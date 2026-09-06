// Cliente WebDAV minimo contra Nextcloud. Solo lo que necesita la seccion
// Documentacion: listar, crear carpeta, subir, descargar y borrar.

const BASE = process.env.NC_URL?.replace(/\/+$/, '');
const USER = process.env.NC_USER;
const PASS = process.env.NC_APP_PASSWORD;
const ROOT = (process.env.NC_ROOT || 'Viajes').replace(/^\/+|\/+$/g, '');

if (!BASE || !USER || !PASS) {
  throw new Error('Faltan NC_URL, NC_USER o NC_APP_PASSWORD en el entorno');
}

const DAV = `${BASE}/remote.php/dav/files/${encodeURIComponent(USER)}`;
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');

// La documentacion de viaje es casi siempre la misma, asi que las categorias
// son una lista cerrada. Ademas de ordenar la interfaz, actua como lista blanca:
// solo estos nombres pueden convertirse en una carpeta de la nube.
export const CATEGORIAS = [
  { id: 'pasaporte',  etiqueta: 'Pasaporte' },
  { id: 'dni',        etiqueta: 'DNI' },
  { id: 'conducir',   etiqueta: 'Permiso de conducir' },
  { id: 'seguro',     etiqueta: 'Seguro de viaje' },
  { id: 'vacunas',    etiqueta: 'Vacunas' },
  { id: 'visados',    etiqueta: 'Visados' },
  { id: 'reservas',   etiqueta: 'Reservas' },
  { id: 'otros',      etiqueta: 'Otros' }
];
const IDS = new Set(CATEGORIAS.map((c) => c.id));

export function validarCategoria(id) {
  if (!IDS.has(id)) throw new ErrorNube('Categoria desconocida', 400);
  return id;
}

export class ErrorNube extends Error {
  constructor(mensaje, codigo = 502) { super(mensaje); this.codigo = codigo; }
}

// Un nombre solo puede ser UN segmento de ruta. Sin esto, un viaje llamado
// "../../.." saldria de la carpeta de la app y llegaria a cualquier fichero
// del usuario en la nube: los datos vienen del navegador y no son de fiar.
export function validarNombre(nombre, que = 'nombre') {
  if (typeof nombre !== 'string') throw new ErrorNube(`${que} invalido`, 400);
  const limpio = nombre.trim();
  if (!limpio) throw new ErrorNube(`${que} vacio`, 400);
  if (limpio.length > 180) throw new ErrorNube(`${que} demasiado largo`, 400);
  if (limpio === '.' || limpio === '..') throw new ErrorNube(`${que} invalido`, 400);
  // Separadores, control y los caracteres que rompen en Windows/macOS.
  if (/[\/\\]/.test(limpio)) throw new ErrorNube(`${que} no puede contener barras`, 400);
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(limpio)) throw new ErrorNube(`${que} con caracteres de control`, 400);
  if (/^[.]/.test(limpio)) throw new ErrorNube(`${que} no puede empezar por punto`, 400);
  return limpio;
}

// Cada segmento se codifica por separado: encodeURIComponent escapa "/" y "..",
// asi que ningun nombre puede inyectar estructura en la URL.
function ruta(...segmentos) {
  return [ROOT, ...segmentos].map((s) => encodeURIComponent(s)).join('/');
}
const url = (...s) => `${DAV}/${ruta(...s)}`;

async function peticion(metodo, direccion, opciones = {}) {
  let res;
  try {
    res = await fetch(direccion, {
      method: metodo,
      headers: { Authorization: AUTH, ...(opciones.headers || {}) },
      body: opciones.body,
      duplex: opciones.body ? 'half' : undefined,
      signal: AbortSignal.timeout(opciones.timeout ?? 120000)
    });
  } catch (e) {
    throw new ErrorNube(`No se pudo contactar con la nube: ${e.message}`, 504);
  }
  if (res.status === 401) throw new ErrorNube('La nube rechazo las credenciales', 502);
  if (!opciones.aceptar?.includes(res.status) && !res.ok) {
    throw new ErrorNube(`La nube respondio ${res.status} a ${metodo}`, res.status === 404 ? 404 : 502);
  }
  return res;
}

// PROPFIND devuelve XML. Se extrae solo lo que la app muestra, sin meter un
// parser completo por cuatro campos.
function parsearListado(xml, prefijoBase) {
  const entradas = [];
  const bloques = xml.match(/<[a-z]*:?response[\s>][\s\S]*?<\/[a-z]*:?response>/gi) || [];
  for (const b of bloques) {
    const href = b.match(/<[a-z]*:?href>([\s\S]*?)<\/[a-z]*:?href>/i)?.[1];
    if (!href) continue;
    const ruta = decodeURIComponent(href.trim()).replace(/\/+$/, '');
    if (ruta === prefijoBase.replace(/\/+$/, '')) continue; // la propia carpeta
    const esCarpeta = /<[a-z]*:?collection\s*\/>/i.test(b);
    entradas.push({
      nombre: ruta.split('/').pop(),
      esCarpeta,
      tamano: Number(b.match(/<[a-z]*:?getcontentlength>(\d+)<\//i)?.[1] ?? 0),
      tipo: b.match(/<[a-z]*:?getcontenttype>([\s\S]*?)<\//i)?.[1] ?? null,
      modificado: b.match(/<[a-z]*:?getlastmodified>([\s\S]*?)<\//i)?.[1] ?? null
    });
  }
  return entradas;
}

const CUERPO_PROPFIND = `<?xml version="1.0"?>
<d:propfind xmlns:d="DAV:"><d:prop>
  <d:resourcetype/><d:getcontentlength/><d:getcontenttype/><d:getlastmodified/>
</d:prop></d:propfind>`;

async function listar(...segmentos) {
  const direccion = url(...segmentos);
  const res = await peticion('PROPFIND', direccion, {
    headers: { Depth: '1', 'Content-Type': 'application/xml' },
    body: CUERPO_PROPFIND,
    aceptar: [207]
  });
  const base = new URL(direccion).pathname;
  return parsearListado(await res.text(), base);
}

export async function asegurarRaiz() {
  const res = await fetch(url(), { method: 'MKCOL', headers: { Authorization: AUTH } });
  // 201 creada, 405 ya existia: ambas correctas.
  if (![201, 405].includes(res.status)) {
    throw new ErrorNube(`No se pudo preparar la carpeta ${ROOT} (${res.status})`, 502);
  }
}

export async function asegurarCategorias() {
  for (const c of CATEGORIAS) {
    const res = await fetch(url(c.id), { method: 'MKCOL', headers: { Authorization: AUTH } });
    if (![201, 405].includes(res.status)) {
      throw new ErrorNube(`No se pudo preparar la categoria ${c.id} (${res.status})`, 502);
    }
  }
}

export async function listarTodo() {
  const salida = [];
  for (const c of CATEGORIAS) {
    const ficheros = (await listar(c.id)).filter((e) => !e.esCarpeta);
    salida.push({ ...c, documentos: ficheros });
  }
  return salida;
}

export async function listarCategoria(categoria) {
  const c = validarCategoria(categoria);
  return (await listar(c)).filter((e) => !e.esCarpeta);
}

export async function subirDocumento(categoria, fichero, flujo) {
  const c = validarCategoria(categoria);
  const f = validarNombre(fichero, 'nombre del fichero');
  await peticion('PUT', url(c, f), { body: flujo, headers: { 'Content-Type': 'application/octet-stream' } });
  return { nombre: f, categoria: c };
}

export async function descargarDocumento(categoria, fichero) {
  const c = validarCategoria(categoria);
  const f = validarNombre(fichero, 'nombre del fichero');
  const res = await peticion('GET', url(c, f));
  return { cuerpo: res.body, tipo: res.headers.get('content-type'), tamano: res.headers.get('content-length') };
}

export async function borrarDocumento(categoria, fichero) {
  const c = validarCategoria(categoria);
  const f = validarNombre(fichero, 'nombre del fichero');
  await peticion('DELETE', url(c, f), { aceptar: [204] });
}

// --- Perfiles de usuario (JSON en Nextcloud) --------------------------------
const PERFILES_DIR = 'perfiles';

export async function asegurarPerfiles() {
  const res = await fetch(url(PERFILES_DIR), { method: 'MKCOL', headers: { Authorization: AUTH } });
  if (![201, 405].includes(res.status)) {
    throw new ErrorNube(`No se pudo preparar la carpeta de perfiles (${res.status})`, 502);
  }
}

export async function existePerfil(usuario) {
  const nombre = validarNombre(usuario, 'usuario');
  try {
    const res = await fetch(url(PERFILES_DIR, `${nombre}.json`), {
      method: 'HEAD', headers: { Authorization: AUTH }, signal: AbortSignal.timeout(10000)
    });
    return res.ok;
  } catch { return false; }
}

export async function guardarPerfil(usuario, datos) {
  const nombre = validarNombre(usuario, 'usuario');
  await peticion('PUT', url(PERFILES_DIR, `${nombre}.json`), {
    body: JSON.stringify(datos),
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function leerPerfil(usuario) {
  const nombre = validarNombre(usuario, 'usuario');
  try {
    const res = await peticion('GET', url(PERFILES_DIR, `${nombre}.json`), { aceptar: [200, 404] });
    if (res.status === 404) return null;
    return await res.json();
  } catch { return null; }
}

export const info = { base: BASE, usuario: USER, raiz: ROOT };
