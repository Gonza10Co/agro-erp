/*
 * KILL SWITCH del service worker (modo sin internet).
 *
 * Si el service worker de las tablets da problemas, se apaga así:
 *   1. Copiar ESTE archivo encima de frontend/public/sw.js (cp frontend/sw-kill.js frontend/public/sw.js).
 *   2. Poner SERVICE_WORKER_HABILITADO = false en frontend/src/app/core/offline/offline-config.ts.
 *   3. Desplegar.
 * Cada tablet que tenga el worker viejo descarga este (sw.js va sin caché), que se
 * instala de inmediato, borra las cachés agro-shell-*, se desregistra y recarga las
 * pestañas abiertas: quedan como si nunca hubiera existido.
 *
 * ⚠️ NUNCA borrar public/sw.js: si el archivo desaparece (404), el navegador deja el
 * worker viejo instalado y sirviendo su caché. Para apagar, se reemplaza por este.
 */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('agro-shell-')).map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clientes = await self.clients.matchAll({ type: 'window' });
      for (const c of clientes) {
        c.postMessage({ type: 'sw-apagado' });
        // Recargar sin worker: la app vuelve a cargar todo de la red.
        c.navigate(c.url).catch(() => undefined);
      }
    })(),
  );
});
