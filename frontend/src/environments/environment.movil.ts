/**
 * Ensayo desde el celular en la red local: el front se sirve por HTTPS (la cámara lo
 * exige) y el API va por el proxy de `ng serve` (proxy.conf.json) para que no sea
 * contenido mixto. Ver `npm run start:movil` en package.json.
 */
export const environment = {
  production: false,
  apiUrl: '/api',
};
