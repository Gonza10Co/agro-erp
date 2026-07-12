// Repara el package-lock tras un npm install en Windows: npm reescribe el lock
// reflejando solo lo instalado en disco y BORRA los bindings de otras plataformas.
// Sin @unrs/resolver-binding-linux-x64-gnu, jest 30 (unrs-resolver) queda ciego en
// el runner Linux del CI ("Module ts-jest ... was not found"). Corre en postinstall
// (idempotente); el CI usa `npm ci --ignore-scripts`, así que allá nunca ejecuta.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const lockPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package-lock.json');
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
const packages = lock.packages ?? {};

// La versión del binding sigue a la del padre (todas las variantes publican juntas).
const padre = Object.entries(packages).find(([k]) => k.endsWith('node_modules/unrs-resolver'));
if (!padre) process.exit(0); // sin unrs-resolver en el árbol no hay nada que reparar

const clave = 'node_modules/@unrs/resolver-binding-linux-x64-gnu';
if (packages[clave]) process.exit(0); // ya está — no tocar el lock

const version = padre[1].version;
// integrity conocida por versión; para una versión nueva hay que traerla del registry:
//   npm view @unrs/resolver-binding-linux-x64-gnu@<version> dist.integrity
const INTEGRITY = {
  '1.12.2': 'sha512-mPsUhunKKDih5O96Y6enDQyHc1SqBPlY1E/SfMWDM3EdJ95Z9CArPeCVwCCqbP45ljvivdEk8Fxn+SIb1rDAJQ==',
};
const integrity = INTEGRITY[version];
if (!integrity) {
  console.warn(
    `[fix-lock-bindings] unrs-resolver@${version} sin integrity conocida para el binding linux; ` +
      `agregala a tools/fix-lock-bindings.mjs (npm view @unrs/resolver-binding-linux-x64-gnu@${version} dist.integrity)`,
  );
  process.exit(0);
}

packages[clave] = {
  version,
  resolved: `https://registry.npmjs.org/@unrs/resolver-binding-linux-x64-gnu/-/resolver-binding-linux-x64-gnu-${version}.tgz`,
  integrity,
  cpu: ['x64'],
  license: 'MIT',
  optional: true,
  os: ['linux'],
};
// npm escribe "packages" en orden alfabético ("" primero): se preserva ese orden.
lock.packages = Object.fromEntries(Object.entries(packages).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
console.log(`[fix-lock-bindings] re-agregado ${clave}@${version} al package-lock`);
