/*
 * Service worker propio y mínimo (modo sin internet, 2026-11-21).
 *
 * Su único trabajo: que la tablet de planta ABRA la app aunque recarguen sin
 * señal. Guarda el "app shell" (index.html y los .js/.css con hash que se van
 * pidiendo). NUNCA toca la API: el backend vive en otro dominio (Railway) y en
 * modo movil va por /api; los pistolazos sin señal los guarda la app en su cola.
 * Solo se registra en las tablets (rol ESTACION o /fabricacion/estacion, /tv).
 *
 * - Navegación: siempre la red; la caché SOLO si la red falla de verdad (sin señal).
 * - Assets con hash: primero la caché (el nombre cambia en cada build).
 * - Otros archivos del mismo origen (favicon, logo): la caché y se refresca atrás.
 * - Solo se guarda lo que el servidor sirve como JavaScript, CSS o imagen: nunca un
 *   HTML disfrazado de asset (el rewrite del SPA responde index.html a todo).
 *
 * Subir VERSION borra las cachés viejas al activarse. Un build nuevo de la app no
 * lo necesita: el index se pide a la red primero y trae los nombres nuevos.
 *
 * ⚠️ NUNCA borrar este archivo: las tablets que ya lo tienen lo seguirían usando.
 * Para apagarlo, copiar encima frontend/sw-kill.js (ver CLAUDE.md).
 */
const VERSION = 'v1';
const CACHE = `agro-shell-${VERSION}`;
const INDEX = '/index.html';
/** Tope de archivos guardados: los builds viejos se van saliendo. */
const MAX_ENTRADAS = 200;

const ES_ASSET_CON_HASH = /-[A-Z0-9]{8,}\.(?:js|css)$/i;
const ES_ESTATICO = /\.(?:js|css|svg|png|ico)$/i;
const TIPO_ASSET = /javascript|text\/css|^image\//i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) =>
        fetch(new Request(INDEX, { cache: 'reload' })).then((r) => (esHtml(r) ? c.put(INDEX, r) : undefined)),
      )
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('agro-shell-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** La app avisa qué archivos ya cargó antes de que este worker la controlara. */
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'precache' || !Array.isArray(data.urls)) return;
  const urls = data.urls.filter((u) => {
    try {
      const url = new URL(u, self.location.origin);
      return url.origin === self.location.origin && esCacheable(url);
    } catch (e) {
      return false;
    }
  });
  event.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(
        urls.map((u) =>
          c.match(u).then((hit) => hit || fetch(u, { credentials: 'same-origin' }).then((r) => (esAsset(r) ? c.put(u, r) : undefined)).catch(() => undefined)),
        ),
      ).then(() => recortar(c)),
    ),
  );
});

function esApi(url) {
  return url.pathname === '/api' || url.pathname.startsWith('/api/');
}

function esCacheable(url) {
  return !esApi(url) && ES_ESTATICO.test(url.pathname);
}

function tipo(res) {
  return (res && res.headers.get('content-type')) || '';
}

/** Un asset de verdad: respuesta buena y JavaScript, CSS o imagen (nunca HTML). */
function esAsset(res) {
  return !!res && res.ok && TIPO_ASSET.test(tipo(res)) && !/html/i.test(tipo(res));
}

function esHtml(res) {
  return !!res && res.ok && /text\/html/i.test(tipo(res));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Otro dominio (el backend en Railway, Google Fonts) o la API por proxy: ni se mira.
  if (url.origin !== self.location.origin || esApi(url)) return;

  if (req.mode === 'navigate') {
    event.respondWith(navegacion(event));
    return;
  }
  if (!esCacheable(url)) return;
  event.respondWith(ES_ASSET_CON_HASH.test(url.pathname) ? primeroCache(event) : cacheYRefresca(event));
});

async function navegacion(event) {
  let res;
  try {
    res = await fetch(event.request);
  } catch (e) {
    // Sin señal de verdad: el shell guardado. Con internet lento se espera a la red.
    const guardado = await caches.match(INDEX, { cacheName: CACHE });
    return guardado || Response.error();
  }
  // El SPA responde index.html en cualquier ruta (rewrite de Vercel): ese es el shell.
  if (esHtml(res)) {
    const copia = res.clone();
    event.waitUntil(caches.open(CACHE).then((c) => c.put(INDEX, copia)));
  }
  return res;
}

async function primeroCache(event) {
  const req = event.request;
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (esAsset(res)) {
    const copia = res.clone();
    event.waitUntil(cache.put(req, copia).then(() => recortar(cache)));
  }
  return res;
}

async function cacheYRefresca(event) {
  const req = event.request;
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const red = fetch(req)
    .then((res) => {
      if (esAsset(res)) {
        const copia = res.clone();
        return cache.put(req, copia).then(() => res);
      }
      return res;
    })
    .catch(() => undefined);
  event.waitUntil(red);
  return hit || (await red) || Response.error();
}

/** Borra los más viejos (el orden de keys() es el de inserción); el index no se toca. */
async function recortar(cache) {
  const keys = await cache.keys();
  const sobran = keys.length - MAX_ENTRADAS;
  if (sobran <= 0) return;
  const borrables = keys.filter((k) => new URL(k.url).pathname !== INDEX).slice(0, sobran);
  await Promise.all(borrables.map((k) => cache.delete(k)));
}
