/**
 * Interruptor del service worker de las tablets (modo sin internet).
 *
 * `false` = apagado: al arrancar, la app desregistra cualquier worker y borra las
 * cachés `agro-shell-*`. Para un apagado completo copiar además
 * `frontend/sw-kill.js` encima de `frontend/public/sw.js` (ver CLAUDE.md).
 * NUNCA borrar `public/sw.js`.
 */
export const SERVICE_WORKER_HABILITADO = true;
