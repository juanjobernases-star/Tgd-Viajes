// API de la seccion Documentacion. El navegador habla solo con este servicio;
// la contrasena de la nube no sale de aqui.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Carga del .env sin dependencias: valores con espacios entre comillas incluidos.
const aqui = dirname(fileURLToPath(import.meta.url));
try {
  for (const linea of readFileSync(join(aqui, '..', '.env'), 'utf8').split('\n')) {
    const m = linea.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (!m) continue;
    const valor = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = valor;
  }
} catch { /* en contenedor las variables llegan por el entorno */ }

const Fastify = (await import('fastify')).default;
const multipart = (await import('@fastify/multipart')).default;
const nube = await import('./webdav.js');
const auth = await import('./auth.js');
const cookie = (await import('@fastify/cookie')).default;
const estaticos = (await import('@fastify/static')).default;

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' } });
await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024, files: 1 } });
await app.register(cookie);
await app.register(estaticos, { root: join(aqui, 'public'), prefix: '/' });

// Cabeceras de la propia pagina. La CSP evita que un fichero servido desde
// aqui pueda cargar codigo de fuera: todo lo que ejecuta la interfaz es local.
app.addHook('onSend', async (req, res, cuerpo) => {
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('Referrer-Policy', 'no-referrer');
  if (!req.url.startsWith('/api/')) {
    res.header('Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; " +
      "form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  }
  return cuerpo;
});

// Todo lo que cuelga de /api/viajes exige sesion. Lista blanca explicita: si
// manana se anade una ruta nueva, nace protegida en vez de nacer abierta.
const ABIERTAS = new Set(['/api/sesion', '/api/salud', '/api/registro', '/api/reset-password', '/api/reset-password/confirmar']);
app.addHook('onRequest', async (req, res) => {
  if (!req.url.startsWith('/api/')) return;
  const ruta = req.url.split('?')[0];
  if (ABIERTAS.has(ruta) && req.method !== 'GET') return;   // login
  if (ABIERTAS.has(ruta) && ruta === '/api/salud') return;  // sonda sin datos
  if (ruta === '/api/sesion' && req.method === 'GET') { /* consulta: sigue */ }
  const usuario = auth.verificarTestigo(req.cookies?.[auth.COOKIE]);
  if (!usuario) { res.code(401).send({ error: 'Sesion requerida' }); return res; }
  req.usuario = usuario;
});

app.setErrorHandler((err, _req, res) => {
  const codigo = err.codigo || err.statusCode || 500;
  if (codigo >= 500) app.log.error({ err }, 'fallo tratando la peticion');
  // Hacia fuera solo el mensaje: los detalles de la nube quedan en el log.
  res.code(codigo).send({ error: codigo >= 500 ? 'Error hablando con la nube' : err.message });
});

// --- Sesion ---------------------------------------------------------------
app.post('/api/sesion', async (req, res) => {
  const ip = req.ip;
  if (auth.bloqueado(ip)) {
    res.code(429);
    return { error: 'Demasiados intentos fallidos. Espera unos minutos.' };
  }
  const { usuario, password } = req.body ?? {};
  if (!(await auth.credencialesValidas(usuario, password))) {
    auth.registrarFallo(ip);
    app.log.warn({ ip, usuario }, 'intento de acceso fallido');
    res.code(401);
    // Mensaje unico: distinguir "usuario no existe" de "contrasena mala"
    // le confirma a quien prueba cuales son las cuentas validas.
    return { error: 'Credenciales invalidas' };
  }
  auth.limpiar(ip);
  res.setCookie(auth.COOKIE, auth.crearTestigo(usuario), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.COOKIE_SEGURA !== 'no',
    path: process.env.COOKIE_PATH || '/',
    maxAge: auth.HORAS * 3600
  });
  const perfil = await nube.leerPerfil(usuario);
  return { usuario, perfil };
});

app.get('/api/sesion', async (req, res) => {
  const usuario = auth.verificarTestigo(req.cookies?.[auth.COOKIE]);
  if (!usuario) { res.code(401); return { error: 'Sin sesion' }; }
  const perfil = await nube.leerPerfil(usuario);
  return { usuario, perfil };
});

app.delete('/api/sesion', async (_req, res) => {
  res.clearCookie(auth.COOKIE, { path: process.env.COOKIE_PATH || '/' });
  res.code(204);
});

app.get('/api/salud', async () => ({ ok: true, registro: auth.registroDisponible() }));

// --- Registro ---------------------------------------------------------------
const INTERESES_VALIDOS = new Set(['arte','comida','aventura','compras','tranquilo']);

app.post('/api/registro', async (req, res) => {
  if (!auth.registroDisponible()) {
    res.code(503);
    return { error: 'El registro no está habilitado en este servidor' };
  }
  const ip = req.ip;
  if (auth.bloqueado(ip)) {
    res.code(429);
    return { error: 'Demasiados intentos. Espera unos minutos.' };
  }
  const { usuario, password, nombre, email, intereses, destino } = req.body ?? {};
  if (!usuario || !password || !nombre) {
    res.code(400);
    return { error: 'Faltan campos obligatorios (usuario, password, nombre)' };
  }
  if (typeof password !== 'string' || password.length < 8) {
    res.code(400);
    return { error: 'La contraseña debe tener al menos 8 caracteres' };
  }
  const ints = Array.isArray(intereses) ? intereses.filter(i => INTERESES_VALIDOS.has(i)) : [];
  // Sanitise destination
  let destinoLimpio = undefined;
  if (destino && typeof destino === 'object' && typeof destino.continente === 'string' && typeof destino.pais === 'string') {
    destinoLimpio = {
      continente: destino.continente.slice(0, 50),
      pais: destino.pais.slice(0, 50),
      ciudades: Array.isArray(destino.ciudades) ? destino.ciudades.filter(c => typeof c === 'string').map(c => c.slice(0, 100)).slice(0, 20) : []
    };
  }
  try {
    await auth.crearUsuario(usuario, password, nombre);
  } catch (e) {
    if (e.message.includes('ya existe')) { res.code(409); return { error: e.message }; }
    auth.registrarFallo(ip);
    app.log.warn({ ip, usuario, err: e.message }, 'fallo en registro');
    res.code(400);
    return { error: e.message };
  }
  const perfil = { nombre, email: email || '', intereses: ints, creado: new Date().toISOString() };
  if (destinoLimpio) perfil.destino = destinoLimpio;
  try { await nube.guardarPerfil(usuario, perfil); } catch (e) {
    app.log.warn({ usuario, err: e.message }, 'perfil no guardado tras registro');
  }
  auth.limpiar(ip);
  res.setCookie(auth.COOKIE, auth.crearTestigo(usuario), {
    httpOnly: true, sameSite: 'strict',
    secure: process.env.COOKIE_SEGURA !== 'no',
    path: process.env.COOKIE_PATH || '/',
    maxAge: auth.HORAS * 3600
  });
  res.code(201);
  return { usuario, perfil };
});

// --- Restablecer contraseña -------------------------------------------------
import { createTransport } from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASSWORD;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;
const APP_URL = process.env.APP_URL || '';

const mailer = SMTP_HOST ? createTransport({
  host: SMTP_HOST, port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 15_000
}) : null;

app.post('/api/reset-password', async (req, res) => {
  const ip = req.ip;
  if (auth.bloqueado(ip)) {
    res.code(429);
    return { error: 'Demasiados intentos. Espera unos minutos.' };
  }
  const { usuario } = req.body ?? {};
  if (!usuario) { res.code(400); return { error: 'Introduce tu usuario' }; }
  const email = await auth.obtenerEmailUsuario(usuario);
  if (!email) {
    auth.registrarFallo(ip);
    return { ok: true, mensaje: 'Si el usuario existe y tiene email, recibirás un enlace.' };
  }
  if (!mailer) {
    res.code(503);
    return { error: 'El envío de correo no está configurado en el servidor' };
  }
  const token = auth.crearTokenReset(usuario);
  const baseUrl = APP_URL || `${req.protocol}://${req.hostname}`;
  const enlace = `${baseUrl}?reset=${token}`;
  try {
    await mailer.sendMail({
      from: SMTP_FROM,
      to: email,
      subject: 'Andanzas — Restablecer contraseña',
      text: `Hola,\n\nHas solicitado restablecer tu contraseña en Andanzas.\n\nHaz clic en el siguiente enlace (válido 30 minutos):\n${enlace}\n\nSi no fuiste tú, ignora este mensaje.\n\n— Andanzas`,
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#2F6F65;margin-bottom:8px">Andanzas</h2>
        <p>Has solicitado restablecer tu contraseña.</p>
        <p><a href="${enlace}" style="display:inline-block;padding:12px 24px;background:#7FB8B0;color:#1F3F39;border-radius:100px;text-decoration:none;font-weight:600">Restablecer contraseña</a></p>
        <p style="font-size:13px;color:#6B5642">Este enlace es válido durante 30 minutos. Si no solicitaste este cambio, ignora este mensaje.</p>
      </div>`
    });
  } catch (e) {
    app.log.error({ err: e.message, usuario }, 'error enviando email de reset');
    res.code(502);
    return { error: 'No se pudo enviar el correo' };
  }
  app.log.info({ usuario, email: email.replace(/(.{2}).*@/, '$1***@') }, 'email de reset enviado');
  return { ok: true, mensaje: 'Si el usuario existe y tiene email, recibirás un enlace.' };
});

app.post('/api/reset-password/confirmar', async (req, res) => {
  const { token, password } = req.body ?? {};
  if (!token || !password) { res.code(400); return { error: 'Faltan datos' }; }
  const usuario = auth.consumirTokenReset(token);
  if (!usuario) { res.code(400); return { error: 'Enlace inválido o expirado. Solicita uno nuevo.' }; }
  try {
    await auth.cambiarPassword(usuario, password);
  } catch (e) {
    res.code(400);
    return { error: e.message };
  }
  return { ok: true, mensaje: 'Contraseña cambiada. Ya puedes iniciar sesión.' };
});

// --- Perfil -----------------------------------------------------------------
app.get('/api/perfil', async (req) => {
  const perfil = await nube.leerPerfil(req.usuario);
  return { usuario: req.usuario, perfil };
});

// Sanitize a string field: must be string, truncated to maxLen
function sanStr(v, maxLen = 200) {
  return typeof v === 'string' ? v.slice(0, maxLen) : '';
}

function sanitizarViaje(viaje) {
  if (!viaje || typeof viaje !== 'object') return undefined;
  const out = {};

  if (viaje.hotel && typeof viaje.hotel === 'object') {
    const h = viaje.hotel;
    out.hotel = {
      nombre: sanStr(h.nombre), direccion: sanStr(h.direccion),
      telefono: sanStr(h.telefono), checkIn: sanStr(h.checkIn, 10),
      horaCheckIn: sanStr(h.horaCheckIn, 5), checkOut: sanStr(h.checkOut, 10),
      horaCheckOut: sanStr(h.horaCheckOut, 5), confirmacion: sanStr(h.confirmacion),
      mapsUrl: sanStr(h.mapsUrl, 500)
    };
  }

  if (Array.isArray(viaje.vuelos)) {
    out.vuelos = viaje.vuelos.slice(0, 10).map(v => ({
      id: sanStr(v.id, 20), tipo: sanStr(v.tipo, 10),
      numero: sanStr(v.numero, 100), origen: sanStr(v.origen, 3).toUpperCase(),
      destino: sanStr(v.destino, 3).toUpperCase(), fecha: sanStr(v.fecha, 10),
      hora: sanStr(v.hora, 5), aerolinea: sanStr(v.aerolinea, 100),
      confirmacion: sanStr(v.confirmacion, 100)
    }));
  }

  if (Array.isArray(viaje.viajeros)) {
    out.viajeros = viaje.viajeros.slice(0, 20).map(t => ({
      id: sanStr(t.id, 20), nombre: sanStr(t.nombre, 100),
      inicial: sanStr(t.inicial, 3), color: sanStr(t.color, 20)
    }));
  }

  if (Array.isArray(viaje.excursiones)) {
    out.excursiones = viaje.excursiones.slice(0, 30).map(e => ({
      id: sanStr(e.id, 20), nombre: sanStr(e.nombre),
      proveedor: sanStr(e.proveedor), fecha: sanStr(e.fecha, 10),
      hora: sanStr(e.hora, 5), precio: sanStr(e.precio, 50),
      url: sanStr(e.url, 500), confirmacion: sanStr(e.confirmacion)
    }));
  }

  return out;
}

app.put('/api/perfil', async (req) => {
  const actual = await nube.leerPerfil(req.usuario) || {};
  const { nombre, email, intereses, destino, viaje } = req.body ?? {};
  if (nombre) actual.nombre = nombre;
  if (email !== undefined) actual.email = email;
  if (Array.isArray(intereses)) actual.intereses = intereses.filter(i => INTERESES_VALIDOS.has(i));
  if (destino && typeof destino === 'object' && typeof destino.continente === 'string' && typeof destino.pais === 'string') {
    actual.destino = {
      continente: destino.continente.slice(0, 50),
      pais: destino.pais.slice(0, 50),
      ciudades: Array.isArray(destino.ciudades) ? destino.ciudades.filter(c => typeof c === 'string').map(c => c.slice(0, 100)).slice(0, 20) : []
    };
  }
  if (viaje !== undefined) {
    actual.viaje = sanitizarViaje(viaje);
  }
  await nube.guardarPerfil(req.usuario, actual);
  return { usuario: req.usuario, perfil: actual };
});

// --- Vuelos en directo (proxy a AviationStack) ------------------------------
// La clave se queda en el servidor; el navegador solo ve el resultado filtrado.
const AVIATION_KEY = process.env.AVIATION_API_KEY;
const vueloCache = new Map();
const VUELO_TTL = 5 * 60 * 1000;
const VUELO_CACHE_MAX = 500;

app.get('/api/flight-status', async (req, res) => {
  const flight = (req.query.flight || '').trim().toUpperCase();
  if (!flight || !/^[A-Z0-9]{2,3}\d{1,5}$/.test(flight)) {
    res.code(400);
    return { error: 'Número de vuelo no válido (ejemplo: FR1234)' };
  }
  if (!AVIATION_KEY) {
    res.code(503);
    return { error: 'Servicio de vuelos no configurado en el servidor' };
  }

  const cacheKey = flight;
  const cached = vueloCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < VUELO_TTL) return cached.data;

  try {
    const url = `https://api.aviationstack.com/v1/flights?access_key=${encodeURIComponent(AVIATION_KEY)}&flight_iata=${encodeURIComponent(flight)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const j = await r.json();

    if (j.error) throw new Error(j.error.message || 'Error de la API de vuelos');

    const data = (j.data || [])[0];
    if (!data) {
      res.code(404);
      return { error: 'No se encontró ese vuelo. Revisa el número.' };
    }

    const result = {
      status: data.flight_status,
      delay: data.departure?.delay ?? null,
      gate: data.departure?.gate ?? null,
      estDeparture: data.departure?.estimated ?? null
    };

    if (vueloCache.size >= VUELO_CACHE_MAX) {
      const oldest = vueloCache.keys().next().value;
      vueloCache.delete(oldest);
    }
    vueloCache.set(cacheKey, { ts: Date.now(), data: result });
    return result;
  } catch (e) {
    app.log.warn({ flight, err: e.message }, 'fallo consultando vuelo');
    res.code(502);
    return { error: e.message || 'No se pudo consultar el vuelo' };
  }
});

// --- Búsqueda de vuelos y hoteles (proxies) --------------------------------
const IATA_RE = /^[A-Z]{3}$/;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
function validarIATA(v) { return typeof v === 'string' && IATA_RE.test(v.toUpperCase().trim()); }
function validarFecha(v) { return typeof v === 'string' && FECHA_RE.test(v.trim()); }

const AMADEUS_KEY = process.env.AMADEUS_API_KEY;
const AMADEUS_SECRET = process.env.AMADEUS_API_SECRET;
const SKYSCANNER_KEY = process.env.SKYSCANNER_API_KEY;
const KIWI_KEY = process.env.KIWI_API_KEY;
const BOOKING_AID = process.env.BOOKING_AFFILIATE_ID;

let amadeusToken = null;
let amadeusTokenExp = 0;

async function getAmadeusToken() {
  if (amadeusToken && Date.now() < amadeusTokenExp) return amadeusToken;
  const r = await fetch('https://test.api.amadeus.com/v1/security/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${encodeURIComponent(AMADEUS_KEY)}&client_secret=${encodeURIComponent(AMADEUS_SECRET)}`,
    signal: AbortSignal.timeout(10000)
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('Amadeus auth failed');
  amadeusToken = j.access_token;
  amadeusTokenExp = Date.now() + (j.expires_in - 60) * 1000;
  return amadeusToken;
}

// Amadeus: buscar vuelos
app.get('/api/buscar/vuelos/amadeus', async (req, res) => {
  const { origen, destino, fecha, adultos } = req.query;
  if (!validarIATA(origen) || !validarIATA(destino) || !validarFecha(fecha)) { res.code(400); return { error: 'Origen/destino deben ser códigos IATA (3 letras) y fecha YYYY-MM-DD' }; }
  if (!AMADEUS_KEY || !AMADEUS_SECRET) { res.code(503); return { error: 'Amadeus no configurado' }; }
  try {
    const token = await getAmadeusToken();
    const params = new URLSearchParams({
      originLocationCode: origen.toUpperCase().trim(),
      destinationLocationCode: destino.toUpperCase().trim(),
      departureDate: fecha.trim(),
      adults: String(Math.min(Number(adultos) || 1, 9)),
      max: '5', currencyCode: 'EUR'
    });
    const r = await fetch(`https://test.api.amadeus.com/v2/shopping/flight-offers?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000)
    });
    const j = await r.json();
    if (j.errors) throw new Error(j.errors[0]?.detail || 'Error Amadeus');
    const results = (j.data || []).map(o => ({
      precio: o.price?.total,
      moneda: o.price?.currency,
      aerolinea: o.validatingAirlineCodes?.[0],
      segmentos: (o.itineraries || []).map(it => ({
        duracion: it.duration,
        tramos: (it.segments || []).map(s => ({
          origen: s.departure?.iataCode,
          destino: s.arrival?.iataCode,
          salida: s.departure?.at,
          llegada: s.arrival?.at,
          vuelo: (s.carrierCode || '') + (s.number || '')
        }))
      }))
    }));
    return { fuente: 'amadeus', resultados: results };
  } catch (e) {
    app.log.warn({ err: e.message }, 'amadeus flights');
    res.code(502); return { error: e.message };
  }
});

// Amadeus: buscar hoteles
app.get('/api/buscar/hoteles/amadeus', async (req, res) => {
  const { ciudad, checkin, checkout, adultos } = req.query;
  if (!validarIATA(ciudad)) { res.code(400); return { error: 'Ciudad debe ser código IATA (3 letras)' }; }
  if (!AMADEUS_KEY || !AMADEUS_SECRET) { res.code(503); return { error: 'Amadeus no configurado' }; }
  try {
    const token = await getAmadeusToken();
    const params = new URLSearchParams({ cityCode: ciudad.toUpperCase().trim() });
    const r = await fetch(`https://test.api.amadeus.com/v1/reference-data/locations/hotels/by-city?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000)
    });
    const j = await r.json();
    if (j.errors) throw new Error(j.errors[0]?.detail || 'Error Amadeus');
    const results = (j.data || []).slice(0, 10).map(h => ({
      nombre: h.name,
      hotelId: h.hotelId,
      latitud: h.geoCode?.latitude,
      longitud: h.geoCode?.longitude,
      direccion: [h.address?.countryCode].filter(Boolean).join(', ')
    }));
    return { fuente: 'amadeus', resultados: results };
  } catch (e) {
    app.log.warn({ err: e.message }, 'amadeus hotels');
    res.code(502); return { error: e.message };
  }
});

// Skyscanner (RapidAPI): buscar vuelos
app.get('/api/buscar/vuelos/skyscanner', async (req, res) => {
  const { origen, destino, fecha } = req.query;
  if (!validarIATA(origen) || !validarIATA(destino) || !validarFecha(fecha)) { res.code(400); return { error: 'Origen/destino IATA (3 letras), fecha YYYY-MM-DD' }; }
  if (!SKYSCANNER_KEY) { res.code(503); return { error: 'Skyscanner no configurado' }; }
  try {
    const url = `https://sky-scanner3.p.rapidapi.com/flights/search-one-way?fromEntityId=${encodeURIComponent(origen.toUpperCase().trim())}&toEntityId=${encodeURIComponent(destino.toUpperCase().trim())}&departDate=${fecha.trim()}`;
    const r = await fetch(url, {
      headers: { 'x-rapidapi-key': SKYSCANNER_KEY, 'x-rapidapi-host': 'sky-scanner3.p.rapidapi.com' },
      signal: AbortSignal.timeout(15000)
    });
    const j = await r.json();
    const itineraries = j.data?.itineraries || [];
    const results = itineraries.slice(0, 5).map(it => ({
      precio: it.price?.formatted,
      deepLink: it.legs?.[0]?.segments?.[0]?.marketingCarrier?.name || '',
      tramos: (it.legs || []).map(l => ({
        origen: l.origin?.displayCode,
        destino: l.destination?.displayCode,
        salida: l.departure,
        llegada: l.arrival,
        duracion: l.durationInMinutes + ' min',
        aerolinea: l.carriers?.marketing?.[0]?.name
      }))
    }));
    return { fuente: 'skyscanner', resultados: results };
  } catch (e) {
    app.log.warn({ err: e.message }, 'skyscanner');
    res.code(502); return { error: e.message };
  }
});

// Kiwi Tequila: buscar vuelos con deep link
app.get('/api/buscar/vuelos/kiwi', async (req, res) => {
  const { origen, destino, fecha } = req.query;
  if (!validarIATA(origen) || !validarIATA(destino) || !validarFecha(fecha)) { res.code(400); return { error: 'Origen/destino IATA (3 letras), fecha YYYY-MM-DD' }; }
  if (!KIWI_KEY) { res.code(503); return { error: 'Kiwi no configurado' }; }
  const o = origen.toUpperCase().trim(), d = destino.toUpperCase().trim(), f = fecha.trim();
  try {
    const params = new URLSearchParams({
      fly_from: o, fly_to: d,
      date_from: f.slice(5, 7) + '/' + f.slice(8, 10) + '/' + f.slice(0, 4),
      date_to: f.slice(5, 7) + '/' + f.slice(8, 10) + '/' + f.slice(0, 4),
      curr: 'EUR', limit: '5', sort: 'price'
    });
    const r = await fetch(`https://api.tequila.kiwi.com/v2/search?${params}`, {
      headers: { apikey: KIWI_KEY },
      signal: AbortSignal.timeout(15000)
    });
    const j = await r.json();
    const results = (j.data || []).map(f => ({
      precio: f.price + ' €',
      deepLink: f.deep_link,
      aerolinea: f.airlines?.join(', '),
      duracion: Math.round((f.duration?.total || 0) / 3600) + 'h',
      origen: f.flyFrom,
      destino: f.flyTo,
      salida: f.local_departure,
      llegada: f.local_arrival
    }));
    return { fuente: 'kiwi', resultados: results };
  } catch (e) {
    app.log.warn({ err: e.message }, 'kiwi');
    res.code(502); return { error: e.message };
  }
});

// Booking.com: deep link generator (no API needed, just affiliate link)
app.get('/api/buscar/hoteles/booking', async (req, res) => {
  const { ciudad, checkin, checkout, adultos } = req.query;
  if (!ciudad) { res.code(400); return { error: 'Falta la ciudad' }; }
  const aid = BOOKING_AID || '0';
  const params = new URLSearchParams({
    ss: ciudad, checkin: checkin || '', checkout: checkout || '',
    group_adults: String(adultos || 2), no_rooms: '1', aid
  });
  return {
    fuente: 'booking',
    deepLink: `https://www.booking.com/searchresults.html?${params}`,
    mensaje: 'Busca y reserva directamente en Booking.com'
  };
});

app.get('/api/categorias', async () => ({ categorias: nube.CATEGORIAS }));

// Una sola llamada devuelve la pantalla entera: la interfaz no encadena
// siete peticiones para pintar siete categorias.
app.get('/api/documentos', async () => ({ categorias: await nube.listarTodo() }));

app.get('/api/documentos/:categoria', async (req) => ({
  documentos: await nube.listarCategoria(req.params.categoria)
}));

app.post('/api/documentos/:categoria', async (req, res) => {
  const parte = await req.file();
  if (!parte) { res.code(400); return { error: 'No llego ningun fichero' }; }
  const guardado = await nube.subirDocumento(req.params.categoria, parte.filename, parte.file);
  if (parte.file.truncated) { res.code(413); return { error: 'Fichero demasiado grande' }; }
  res.code(201);
  return guardado;
});

app.get('/api/documentos/:categoria/:fichero', async (req, res) => {
  const { cuerpo, tipo, tamano } = await nube.descargarDocumento(req.params.categoria, req.params.fichero);
  res.header('Content-Type', tipo || 'application/octet-stream');
  if (tamano) res.header('Content-Length', tamano);
  res.header('Content-Disposition',
    `attachment; filename="${req.params.fichero.replace(/["\\]/g, '')}"`);
  return res.send(cuerpo);
});

app.delete('/api/documentos/:categoria/:fichero', async (req, res) => {
  await nube.borrarDocumento(req.params.categoria, req.params.fichero);
  res.code(204);
});

const puerto = Number(process.env.PORT || 3010);
const host = process.env.HOST || '127.0.0.1';
await nube.asegurarRaiz();
await nube.asegurarCategorias();
await nube.asegurarPerfiles();
await app.listen({ port: puerto, host });
if (nube.configurado) app.log.info(`documentos de viaje -> ${nube.info.base}/${nube.info.raiz}`);
else app.log.warn('Nextcloud no configurado — solo login, registro y reset disponibles');
