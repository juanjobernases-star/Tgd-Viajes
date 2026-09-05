// Autenticacion delegada en Nextcloud: quien puede entrar en la nube puede
// entrar en la app. Evita un segundo almacen de usuarios y contrasenas que
// mantener, rotar y acabar olvidando.
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

const BASE = process.env.NC_URL?.replace(/\/+$/, '');
const SECRETO = process.env.APP_SECRET;
const HORAS = Number(process.env.SESION_HORAS || 12);
const COOKIE = 'viajes_sesion';

if (!SECRETO || SECRETO.length < 32) {
  throw new Error('APP_SECRET ausente o demasiado corto (minimo 32 caracteres)');
}

// --- Freno de fuerza bruta -------------------------------------------------
// Sin esto, un servicio en la LAN es un oraculo para probar contrasenas de la
// nube a toda velocidad. Ventana deslizante por IP, en memoria.
const intentos = new Map();
const MAX_INTENTOS = 5;
const VENTANA_MS = 15 * 60 * 1000;

function registrarFallo(ip) {
  const ahora = Date.now();
  const previos = (intentos.get(ip) || []).filter((t) => ahora - t < VENTANA_MS);
  previos.push(ahora);
  intentos.set(ip, previos);
}
function bloqueado(ip) {
  const ahora = Date.now();
  const previos = (intentos.get(ip) || []).filter((t) => ahora - t < VENTANA_MS);
  intentos.set(ip, previos);
  return previos.length >= MAX_INTENTOS;
}
function limpiar(ip) { intentos.delete(ip); }

// Purga periodica: si no, el Map crece indefinidamente con IPs que ya caducaron.
setInterval(() => {
  const ahora = Date.now();
  for (const [ip, lista] of intentos) {
    const vivos = lista.filter((t) => ahora - t < VENTANA_MS);
    if (vivos.length) intentos.set(ip, vivos); else intentos.delete(ip);
  }
}, VENTANA_MS).unref();

// --- Testigo de sesion firmado --------------------------------------------
const b64 = (s) => Buffer.from(s).toString('base64url');
const firmar = (datos) => createHmac('sha256', SECRETO).update(datos).digest('base64url');

export function crearTestigo(usuario) {
  const cuerpo = b64(JSON.stringify({
    u: usuario,
    exp: Date.now() + HORAS * 3600 * 1000,
    n: randomBytes(8).toString('hex')
  }));
  return `${cuerpo}.${firmar(cuerpo)}`;
}

export function verificarTestigo(testigo) {
  if (typeof testigo !== 'string' || !testigo.includes('.')) return null;
  const [cuerpo, firma] = testigo.split('.', 2);
  const esperada = firmar(cuerpo);
  // Comparacion en tiempo constante: un "===" filtra por cuanto tarda en fallar.
  const a = Buffer.from(firma || '');
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString());
    if (!datos.exp || datos.exp < Date.now()) return null;
    return datos.u;
  } catch { return null; }
}

// --- Validacion contra la nube --------------------------------------------
export async function credencialesValidas(usuario, password) {
  if (typeof usuario !== 'string' || typeof password !== 'string') return false;
  if (!usuario || !password) return false;
  try {
    const res = await fetch(`${BASE}/ocs/v2.php/cloud/user?format=json`, {
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${usuario}:${password}`).toString('base64'),
        'OCS-APIRequest': 'true'
      },
      signal: AbortSignal.timeout(15000)
    });
    return res.status === 200;
  } catch { return false; }
}

export { COOKIE, HORAS, registrarFallo, bloqueado, limpiar };
