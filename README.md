# Andanzas

App de viajes en familia. Planifica itinerarios, controla presupuesto, consulta vuelos en directo y guarda documentación en tu nube privada.

Construida con **Claude Design** (interfaz) y **Fastify** (backend), conectada a **Nextcloud** vía WebDAV.

## Estructura

```
artifact/                   Interfaz (Claude Design)
  Milán en Familia.dc.html  Artifact principal
  data/trips/milan.json     Datos del viaje de ejemplo

backend/                    API (Node 20+ / Fastify 5)
  src/server.js             Rutas: documentos, sesión, vuelos
  src/auth.js               Autenticación delegada en Nextcloud + cookie HMAC
  src/webdav.js             Operaciones WebDAV contra la nube
  Dockerfile                Imagen de producción (node:22-alpine)
  .env.example              Variables de entorno (copiar a .env)
```

## Arranque local

```bash
cd backend
cp .env.example .env
# Edita .env con tus datos de Nextcloud y un APP_SECRET propio
npm install
npm run dev
```

El servidor arranca en `http://127.0.0.1:3010`.

El artifact se abre directamente en [Claude Design](https://claude.ai) — importa `Milán en Familia.dc.html` y coloca `milan.json` en la ruta `data/trips/` que el artifact espera.

## Despliegue con Docker

El backend se despliega como contenedor dentro de un stack de Docker Compose, detrás de un proxy nginx que comparte dominio con Nextcloud:

```yaml
viajes:
  build: ./backend
  container_name: viajes-docs
  restart: unless-stopped
  env_file: ./backend/.env
  # Sin 'ports': solo alcanzable desde el proxy.
```

En nginx, el bloque `location /viajes/` va **antes** de `location /` y con barra final en `proxy_pass`:

```nginx
location /viajes/ {
    proxy_pass http://viajes-docs:3010/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 512M;
}
```

Así la app recibe `/api/...` y Nextcloud conserva la raíz. Ajusta `COOKIE_PATH=/viajes` en el `.env` para acotar la cookie de sesión.

## Consulta de vuelos en directo

El endpoint `GET /api/flight-status?flight=FR1234` consulta AviationStack desde el servidor. La API key nunca llega al navegador.

1. Regístrate en [aviationstack.com](https://aviationstack.com) (plan gratuito disponible).
2. Pon la clave en `AVIATION_API_KEY` del `.env`.
3. Reinicia el contenedor.

Sin clave, el endpoint devuelve `503 Servicio no configurado` y el artifact muestra el error sin romperse.

## Secciones de la app

| Sección | Qué hace |
|---------|----------|
| Resumen | Datos del viaje, hotel, excursiones, reservas, rutas |
| Calendario | Itinerario día a día con tarjetas y vista mensual |
| Vuelo | Tarjeta boarding-pass con consulta en vivo |
| Guía | Puntos de interés ordenados por cercanía + restaurantes |
| Mapas | Mapa esquemático + ruta alpina |
| Documentación | Subida de documentos a Nextcloud por categorías |
| Equipaje | Checklist compartida |
| Presupuesto | Desglose visual con barras |
| Gastos | Registro de gastos con categoría, método y pagador |
| Clima | Previsión en vivo (Open-Meteo) o referencia estacional |
| Frases | Italiano básico |
| Offline | Notas de conectividad y VPN |
| Seguridad | Zonas de riesgo, contactos de emergencia, consejos |

## Seguridad

- La contraseña de Nextcloud es de **aplicación** (revocable por separado).
- Cookie `HttpOnly`, `SameSite=strict`, firmada con HMAC.
- Freno de fuerza bruta: 5 intentos por IP en 15 minutos.
- Nombres de fichero validados como **un solo segmento** (sin path traversal).
- API keys solo en el servidor, nunca en el cliente.
- CSP restrictiva en las páginas servidas por el backend.

## Licencia

Uso personal y familiar.
