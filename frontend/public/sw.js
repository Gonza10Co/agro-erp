/*
 * Service worker propio y mínimo (modo sin internet, 2026-11-21).
 *
 * Su único trabajo: que la tablet de planta ABRA la app aunque recarguen sin
 * señal. Guarda el "app shell" (index.html y los .js/.css con hash que se van
 * pidiendo). NUNCA toca la API: el backend vive en otro dominio (Railway) y en
 * modo movil va por /api; los pistolazos sin señal los guarda la app en su cola.
 *
 * - Navegación: primero la red (con tope de espera); sin red, el index guardado.
 * - Assets con hash: primero la caché (el nombre cambia en cada build).
 * - Otros archivos del mismo origen (favicon, logo): la caché y se refresca atrás.
 *
 * Subir VERSION borra las cachés viejas al activarse. Un build nuevo de la app no
 * lo necesita: el index se pide a la red primero y trae los nombres nuevos.
 */
const VERSION = 'v1';
const CACHE = `agro-shell-${VERSION}`;
const INDEX = '/index.html';
/** Con internet lento, cuánto se espera el index antes de abrir el guardado. */
const ESPERA_NAVEGACION_MS = 4000;
/** Tope de archivos guardados: los builds viejos se van saliendo. */
const MAX_ENTRADAS = 200;

const ES_ASSET_CON_HASH = /-[A-Z0-9]{8,}\.(?:js|css)$/i;
const ES_ESTATICO = /\.(?:js|css|svg|png|ico|woff2?|webmanifest|json)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.add(new Request(INDEX, { cache: 'reload' })))
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
          c.match(u).then((hit) => hit || fetch(u, { credentials: 'same-origin' }).then((r) => (r.ok ? c.put(u, r) : undefined)).catch(() => undefined)),
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

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Otro dominio (el backend en Railway, Google Fonts) o la API por proxy: ni se mira.
  if (url.origin !== self.location.origin || esApi(url)) return;

  if (req.mode === 'navigate') {
    event.respondWith(navegacion(req));
    return;
  }
  if (!esCacheable(url)) return;
  event.respondWith(ES_ASSET_CON_HASH.test(url.pathname) ? primeroCache(req) : cacheYRefresca(req));
});

async function navegacion(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await conTope(fetch(req), ESPERA_NAVEGACION_MS);
    // El SPA responde index.html en cualquier ruta (rewrite de Vercel): ese es el shell.
    if (res.ok && (res.headers.get('content-type') || '').includes('text/html')) {
      await cache.put(INDEX, res.clone());
    }
    return res;
  } catch (e) {
    const guardado = await cache.match(INDEX);
    if (guardado) return guardado;
    // Sin shell guardado todavía: que el navegador muestre su error normal.
    return fetch(req);
  }
}

async function primeroCache(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    await cache.put(req, res.clone());
    recortar(cache);
  }
  return res;
}

async function cacheYRefresca(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const red = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => undefined);
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

function conTope(promesa, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promesa.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
