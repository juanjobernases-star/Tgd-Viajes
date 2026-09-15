export const CATEGORIES = [
  { id: 'monumento', label: 'Monumentos', emoji: '🏛️' },
  { id: 'gastronomia', label: 'Gastronomía', emoji: '🍽️' },
  { id: 'mirador', label: 'Miradores', emoji: '🌅' },
  { id: 'vida_nocturna', label: 'Vida nocturna', emoji: '🌃' },
  { id: 'joya_oculta', label: 'Joyas ocultas', emoji: '💎' },
  { id: 'naturaleza', label: 'Naturaleza', emoji: '🌳' },
  { id: 'compras', label: 'Compras', emoji: '🛍️' },
  { id: 'con_ninos', label: 'Con niños', emoji: '👨‍👩‍👧' },
];
const CAT_BY_ID = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));
export function categoryLabel(id) { return (CAT_BY_ID[id] || {}).label || id; }
export function categoryEmoji(id) { return (CAT_BY_ID[id] || {}).emoji || '📍'; }

const PACE_TARGET = { relajado: 2, moderado: 3, intenso: 4 };
const BUDGET_ALLOW = {
  economico: ['gratis', 'economico'],
  moderado: ['gratis', 'economico', 'medio'],
  sin_limite: ['gratis', 'economico', 'medio'],
};
const WALK_KM = { cerca: 1.5, centro: 4, toda_ciudad: Infinity };
const START_HOUR = { 'mañana': 9, tarde: 13, noche: 17 };

export async function loadPoiCatalog(cityKey) {
  try {
    const res = await fetch(`data/pois/${cityKey}.json`, { cache: 'no-cache' });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) { return null; }
}

function haversineKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return 0;
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
function addMinutes(hhmm, mins) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + mins;
  const nh = Math.floor(total / 60) % 24, nm = total % 60;
  return String(nh).padStart(2, '0') + ':' + String(nm).padStart(2, '0');
}

// Generates a day-by-day itinerary from a single POI catalog, reusing the plan's
// three-layer model: catalog stays untouched, prefs come from the user, result is fresh each call.
export function generateItinerary(prefs, catalog, numDays, hotelCoords) {
  const { categorias = [], ritmo = 'moderado', presupuesto = 'moderado', distancia = 'centro', horario = [], tieneNinos = false } = prefs;
  const allowPrecio = BUDGET_ALLOW[presupuesto] || BUDGET_ALLOW.moderado;
  const maxKm = WALK_KM[distancia] ?? WALK_KM.centro;
  const target = PACE_TARGET[ritmo] || PACE_TARGET.moderado;
  const startHour = horario.length === 1 ? (START_HOUR[horario[0]] || 9) : 9;
  const used = new Set();
  const allPois = (catalog && catalog.pois) || [];
  const dias = [];
  for (let i = 0; i < numDays; i++) {
    let pool = allPois.filter(p => !used.has(p.id) && allowPrecio.includes(p.precio || 'economico'));
    pool = pool.filter(p => !hotelCoords || haversineKm(hotelCoords, p) <= maxKm);
    let matched = categorias.length ? pool.filter(p => categorias.includes(p.categoria)) : pool.slice();
    if (tieneNinos) {
      const kids = pool.filter(p => p.categoria === 'con_ninos' && !matched.includes(p));
      matched = matched.concat(kids.slice(0, 1));
    }
    matched.sort((a, b) => haversineKm(hotelCoords, a) - haversineKm(hotelCoords, b));
    const picks = matched.slice(0, target);
    picks.forEach(p => used.add(p.id));
    const bloques = [];
    let hora = String(startHour).padStart(2, '0') + ':00';
    let lunchDone = false;
    picks.forEach(p => {
      if (!lunchDone && hora >= '12:30' && hora <= '14:30') {
        bloques.push({ hora, poiId: null, origen: 'sugerido', nombreLibre: 'Comida en la zona' });
        hora = addMinutes(hora, 75);
        lunchDone = true;
      }
      bloques.push({ hora, poiId: p.id, origen: 'sugerido' });
      hora = addMinutes(hora, (p.duracion_min || 60) + 25);
    });
    dias.push({ dia: i + 1, bloques });
  }
  return { generadoEn: new Date().toISOString(), dias };
}
