// Recreación en JS puro del catálogo de destinos del onboarding v2, a partir
// del mismo catálogo continente→país→ciudad que ya usa el resto de Andanzas
// (antes duplicado inline en docs/index.html como `DESTINOS`). Las
// "sugerencias" del paso 5 (logística) son plantillas por interés que se
// cruzan con la ciudad elegida en tiempo de ejecución — no hay contenido de
// ejemplo por destino real, así que generarlas es más honesto que inventar
// datos concretos por ciudad.

const DESTINOS = {
  europa: { label: "Europa", emoji: "🏰", paises: {
    italia: { label: "Italia", emoji: "🇮🇹", ciudades: ["Milán", "Roma", "Florencia", "Venecia", "Nápoles"] },
    espana: { label: "España", emoji: "🇪🇸", ciudades: ["Barcelona", "Madrid", "Sevilla", "Valencia", "Málaga"] },
    francia: { label: "Francia", emoji: "🇫🇷", ciudades: ["París", "Marsella", "Lyon", "Niza", "Burdeos"] },
    alemania: { label: "Alemania", emoji: "🇩🇪", ciudades: ["Berlín", "Múnich", "Hamburgo", "Fráncfort", "Colonia"] },
    portugal: { label: "Portugal", emoji: "🇵🇹", ciudades: ["Lisboa", "Oporto", "Faro", "Sintra", "Braga"] },
    grecia: { label: "Grecia", emoji: "🇬🇷", ciudades: ["Atenas", "Santorini", "Mikonos", "Tesalónica", "Creta"] },
    reinounido: { label: "Reino Unido", emoji: "🇬🇧", ciudades: ["Londres", "Edimburgo", "Manchester", "Liverpool", "Oxford"] },
    holanda: { label: "Países Bajos", emoji: "🇳🇱", ciudades: ["Ámsterdam", "Róterdam", "La Haya", "Utrecht"] },
    suiza: { label: "Suiza", emoji: "🇨🇭", ciudades: ["Zúrich", "Ginebra", "Berna", "Lucerna", "Interlaken"] },
    austria: { label: "Austria", emoji: "🇦🇹", ciudades: ["Viena", "Salzburgo", "Innsbruck", "Graz"] },
    croacia: { label: "Croacia", emoji: "🇭🇷", ciudades: ["Dubrovnik", "Split", "Zagreb", "Plitvice"] },
    republica_checa: { label: "República Checa", emoji: "🇨🇿", ciudades: ["Praga", "Český Krumlov", "Brno"] },
    hungria: { label: "Hungría", emoji: "🇭🇺", ciudades: ["Budapest", "Eger", "Pécs"] },
    irlanda: { label: "Irlanda", emoji: "🇮🇪", ciudades: ["Dublín", "Galway", "Cork", "Killarney"] },
    noruega: { label: "Noruega", emoji: "🇳🇴", ciudades: ["Oslo", "Bergen", "Tromsø", "Stavanger"] },
    suecia: { label: "Suecia", emoji: "🇸🇪", ciudades: ["Estocolmo", "Gotemburgo", "Malmö"] },
    dinamarca: { label: "Dinamarca", emoji: "🇩🇰", ciudades: ["Copenhague", "Aarhus", "Odense"] },
    finlandia: { label: "Finlandia", emoji: "🇫🇮", ciudades: ["Helsinki", "Rovaniemi", "Turku"] },
    islandia: { label: "Islandia", emoji: "🇮🇸", ciudades: ["Reikiavik", "Akureyri", "Vík"] },
    turquia: { label: "Turquía", emoji: "🇹🇷", ciudades: ["Estambul", "Capadocia", "Antalya", "Éfeso"] },
    polonia: { label: "Polonia", emoji: "🇵🇱", ciudades: ["Varsovia", "Cracovia", "Gdansk", "Wroclaw"] }
  }},
  asia: { label: "Asia", emoji: "🏯", paises: {
    japon: { label: "Japón", emoji: "🇯🇵", ciudades: ["Tokio", "Kioto", "Osaka", "Hiroshima", "Nara"] },
    tailandia: { label: "Tailandia", emoji: "🇹🇭", ciudades: ["Bangkok", "Chiang Mai", "Phuket", "Krabi", "Ayutthaya"] },
    vietnam: { label: "Vietnam", emoji: "🇻🇳", ciudades: ["Hanói", "Ho Chi Minh", "Hoi An", "Ha Long", "Da Nang"] },
    india: { label: "India", emoji: "🇮🇳", ciudades: ["Delhi", "Jaipur", "Agra", "Varanasi", "Goa", "Mumbai"] },
    corea: { label: "Corea del Sur", emoji: "🇰🇷", ciudades: ["Seúl", "Busan", "Jeju", "Gyeongju"] },
    indonesia: { label: "Indonesia", emoji: "🇮🇩", ciudades: ["Bali", "Yakarta", "Yogyakarta", "Lombok"] },
    china: { label: "China", emoji: "🇨🇳", ciudades: ["Pekín", "Shanghái", "Xi'an", "Guilin", "Hong Kong"] },
    malasia: { label: "Malasia", emoji: "🇲🇾", ciudades: ["Kuala Lumpur", "Penang", "Langkawi", "Malaca"] },
    camboya: { label: "Camboya", emoji: "🇰🇭", ciudades: ["Siem Reap", "Phnom Penh", "Sihanoukville"] },
    nepal: { label: "Nepal", emoji: "🇳🇵", ciudades: ["Katmandú", "Pokhara", "Chitwan"] },
    sri_lanka: { label: "Sri Lanka", emoji: "🇱🇰", ciudades: ["Colombo", "Kandy", "Galle", "Sigiriya"] },
    filipinas: { label: "Filipinas", emoji: "🇵🇭", ciudades: ["Manila", "Cebú", "Palawan", "Boracay"] },
    emiratos: { label: "Emiratos Árabes", emoji: "🇦🇪", ciudades: ["Dubái", "Abu Dabi", "Sharjah"] }
  }},
  america: { label: "América", emoji: "🗽", paises: {
    mexico: { label: "México", emoji: "🇲🇽", ciudades: ["Ciudad de México", "Cancún", "Oaxaca", "Playa del Carmen", "Guadalajara"] },
    usa: { label: "Estados Unidos", emoji: "🇺🇸", ciudades: ["Nueva York", "Los Ángeles", "San Francisco", "Miami", "Chicago", "Las Vegas"] },
    argentina: { label: "Argentina", emoji: "🇦🇷", ciudades: ["Buenos Aires", "Mendoza", "Bariloche", "Ushuaia", "Salta"] },
    colombia: { label: "Colombia", emoji: "🇨🇴", ciudades: ["Bogotá", "Cartagena", "Medellín", "Santa Marta"] },
    peru: { label: "Perú", emoji: "🇵🇪", ciudades: ["Lima", "Cusco", "Machu Picchu", "Arequipa"] },
    brasil: { label: "Brasil", emoji: "🇧🇷", ciudades: ["Río de Janeiro", "São Paulo", "Salvador", "Florianópolis", "Foz de Iguazú"] },
    chile: { label: "Chile", emoji: "🇨🇱", ciudades: ["Santiago", "Valparaíso", "San Pedro de Atacama", "Torres del Paine"] },
    costa_rica: { label: "Costa Rica", emoji: "🇨🇷", ciudades: ["San José", "Monteverde", "Manuel Antonio", "Arenal"] },
    cuba: { label: "Cuba", emoji: "🇨🇺", ciudades: ["La Habana", "Trinidad", "Viñales", "Santiago de Cuba"] },
    canada: { label: "Canadá", emoji: "🇨🇦", ciudades: ["Toronto", "Vancouver", "Montreal", "Quebec", "Banff"] },
    ecuador: { label: "Ecuador", emoji: "🇪🇨", ciudades: ["Quito", "Galápagos", "Cuenca", "Baños"] },
    uruguay: { label: "Uruguay", emoji: "🇺🇾", ciudades: ["Montevideo", "Punta del Este", "Colonia del Sacramento"] },
    republica_dominicana: { label: "República Dominicana", emoji: "🇩🇴", ciudades: ["Punta Cana", "Santo Domingo", "Samaná"] }
  }},
  africa: { label: "África", emoji: "🦁", paises: {
    marruecos: { label: "Marruecos", emoji: "🇲🇦", ciudades: ["Marrakech", "Fez", "Chefchaouen", "Essaouira", "Desierto del Sahara"] },
    sudafrica: { label: "Sudáfrica", emoji: "🇿🇦", ciudades: ["Ciudad del Cabo", "Johannesburgo", "Kruger", "Durban"] },
    egipto: { label: "Egipto", emoji: "🇪🇬", ciudades: ["El Cairo", "Luxor", "Asuán", "Alejandría", "Sharm el-Sheij"] },
    kenia: { label: "Kenia", emoji: "🇰🇪", ciudades: ["Nairobi", "Masái Mara", "Mombasa", "Amboseli"] },
    tanzania: { label: "Tanzania", emoji: "🇹🇿", ciudades: ["Zanzíbar", "Serengeti", "Kilimanjaro", "Dar es-Salam"] },
    etiopia: { label: "Etiopía", emoji: "🇪🇹", ciudades: ["Addis Abeba", "Lalibela", "Gondar"] },
    namibia: { label: "Namibia", emoji: "🇳🇦", ciudades: ["Windhoek", "Sossusvlei", "Etosha", "Swakopmund"] },
    tunez: { label: "Túnez", emoji: "🇹🇳", ciudades: ["Túnez", "Sidi Bou Said", "Cartago", "Djerba"] }
  }},
  oceania: { label: "Oceanía", emoji: "🏝️", paises: {
    australia: { label: "Australia", emoji: "🇦🇺", ciudades: ["Sídney", "Melbourne", "Cairns", "Perth", "Gran Barrera de Coral"] },
    nueva_zelanda: { label: "Nueva Zelanda", emoji: "🇳🇿", ciudades: ["Auckland", "Queenstown", "Wellington", "Rotorua", "Milford Sound"] },
    fiyi: { label: "Fiyi", emoji: "🇫🇯", ciudades: ["Nadi", "Suva", "Islas Mamanuca"] },
    polinesia: { label: "Polinesia Francesa", emoji: "🇵🇫", ciudades: ["Tahití", "Bora Bora", "Moorea"] }
  }}
};

// Plantillas por interés para las tarjetas de sugerencia del paso 5. No son
// contenido de ejemplo de un destino concreto (nunca "Hotel X reservado") —
// son ideas genéricas que se rellenan con el nombre de la ciudad elegida.
const SUGGESTION_TEMPLATES = {
  arte: [
    { emoji: "🎨", title: c => `Museos y arte en ${c}`, tag: c => `Las mejores colecciones de ${c}` },
    { emoji: "🏛️", title: c => `Casco histórico de ${c}`, tag: c => `El corazón monumental de ${c}` },
    { emoji: "🖼️", title: c => `Galerías y arte callejero de ${c}`, tag: c => `Arte más allá de los museos en ${c}` },
    { emoji: "🎭", title: c => `Teatro y espectáculos en ${c}`, tag: c => `Una noche de cultura en ${c}` }
  ],
  comida: [
    { emoji: "🍝", title: c => `Sabores de ${c}`, tag: c => `Platos típicos que probar en ${c}` },
    { emoji: "☕", title: c => `Mercados y cafés de ${c}`, tag: c => `Come como un local en ${c}` },
    { emoji: "🍷", title: c => `Vinos y aperitivo en ${c}`, tag: c => `La mejor hora del aperitivo en ${c}` },
    { emoji: "🍰", title: c => `Dulces y pastelerías de ${c}`, tag: c => `Postres que no te puedes perder en ${c}` }
  ],
  aventura: [
    { emoji: "🏔️", title: c => `Aire libre cerca de ${c}`, tag: c => `Rutas y planes de aventura en ${c}` },
    { emoji: "🚴", title: c => `Explora activo ${c}`, tag: c => `Bici, senderismo o deporte en ${c}` },
    { emoji: "🚣", title: c => `Agua y naturaleza en ${c}`, tag: c => `Planes junto al agua en ${c}` },
    { emoji: "🧗", title: c => `Adrenalina en ${c}`, tag: c => `Actividades para los más aventureros en ${c}` }
  ],
  compras: [
    { emoji: "🛍️", title: c => `De compras por ${c}`, tag: c => `Las mejores calles y mercados de ${c}` },
    { emoji: "🎁", title: c => `Artesanía local de ${c}`, tag: c => `Recuerdos típicos de ${c}` },
    { emoji: "👜", title: c => `Moda y diseño en ${c}`, tag: c => `Las tiendas que marcan tendencia en ${c}` },
    { emoji: "🏺", title: c => `Mercadillos y antigüedades de ${c}`, tag: c => `Tesoros de segunda mano en ${c}` }
  ],
  tranquilo: [
    { emoji: "🌿", title: c => `Rincones tranquilos de ${c}`, tag: c => `Parques para desconectar en ${c}` },
    { emoji: "🌅", title: c => `Atardeceres en ${c}`, tag: c => `Los mejores miradores de ${c}` },
    { emoji: "🧘", title: c => `Desconexión en ${c}`, tag: c => `Planes tranquilos en familia en ${c}` },
    { emoji: "🌳", title: c => `Naturaleza cerca de ${c}`, tag: c => `Jardines y espacios verdes de ${c}` }
  ]
};

function slugify(s) {
  return String(s)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function buildWorld() {
  const continents = [];
  const countries = [];
  const cities = [];
  const suggestions = [];

  Object.entries(DESTINOS).forEach(([contId, cont]) => {
    continents.push({ id: contId, label: cont.label, emoji: cont.emoji });
    Object.entries(cont.paises).forEach(([countryId, pais]) => {
      countries.push({ id: countryId, continent: contId, label: pais.label, emoji: pais.emoji });
      pais.ciudades.forEach(nombre => {
        const cityId = slugify(nombre);
        cities.push({ id: cityId, country: countryId, continent: contId, label: nombre, emoji: "📍" });
        Object.entries(SUGGESTION_TEMPLATES).forEach(([interest, tpls]) => {
          tpls.forEach(tpl => {
            suggestions.push({
              city: cityId,
              interest,
              emoji: tpl.emoji,
              title: tpl.title(nombre),
              tag: tpl.tag(nombre)
            });
          });
        });
      });
    });
  });

  return { continents, countries, cities, suggestions };
}

let _cache = null;
export function loadWorldData() {
  if (!_cache) _cache = buildWorld();
  return Promise.resolve(_cache);
}
