// ── Control de Vacaciones — Service Worker ────────────────────
// Versión de caché: cambia este número cuando actualices la app
// para que los usuarios reciban la versión nueva automáticamente
const CACHE_NAME = 'vacaciones-v36';

// Archivos que se guardan en caché para funcionar sin internet
const ASSETS = [
  '/Vacaciones/login.html',
  '/Vacaciones/splash.html',
  '/Vacaciones/index.html',
  '/Vacaciones/manifest.json',
  '/Vacaciones/icon-192.png',
  '/Vacaciones/icon-512.png',
  '/Vacaciones/icon-maskable.png',
  '/Vacaciones/styles.css',
  '/Vacaciones/fonts/dm-sans.woff2',
  '/Vacaciones/fonts/syne.woff2',
  '/Vacaciones/state.js',
  '/Vacaciones/firebase.js',
  '/Vacaciones/calendar.js',
  '/Vacaciones/employees.js',
  '/Vacaciones/export-import.js',
  '/Vacaciones/gantt.js',
  '/Vacaciones/tareas-semanales.js',
  '/Vacaciones/permissions.js',
];

// ── INSTALL: guarda los archivos en caché ─────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('✅ SW: archivos en caché');
      return cache.addAll(ASSETS);
    })
  );
  // Activa el nuevo SW inmediatamente sin esperar a que cierren la pestaña
  self.skipWaiting();
});

// ── ACTIVATE: elimina cachés antiguas ─────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('🗑 SW: eliminando caché antigua:', key);
            return caches.delete(key);
          })
      )
    )
  );
  self.clients.claim();
});

// ── FETCH: estrategia Network First ──────────────────────────
// Intenta siempre la red primero (para tener datos frescos de Firebase)
// Si no hay internet, sirve desde caché
self.addEventListener('fetch', event => {
  // Ignorar peticiones a Firebase, CDNs y APIs externas
  // (esas siempre necesitan red y no deben cachearse aquí)
  const url = new URL(event.request.url);
  const isExternal =
    url.hostname.includes('firebase') ||
    url.hostname.includes('google') ||
    url.hostname.includes('cdnjs') ||
    url.hostname.includes('fonts.googleapis') ||
    url.hostname.includes('gstatic');

  if (isExternal) return;

  // firebase-config.js nunca se cachea: evita que la API key quede
  // persistida en el caché del Service Worker en equipos compartidos
  if (url.pathname.endsWith('/firebase-config.js')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Para archivos propios: Network First con fallback a caché
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Si la respuesta es válida, guárdala en caché
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => {
        // Sin internet: sirve desde caché
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // Si no está en caché y no hay red, devuelve index.html
          return caches.match('/Vacaciones/index.html');
        });
      })
  );
});
