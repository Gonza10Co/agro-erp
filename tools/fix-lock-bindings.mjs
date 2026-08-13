// Repara el package-lock tras un npm install: npm reescribe el lock reflejando SOLO lo
// instalado en disco y borra los bindings nativos de las demás plataformas. El daño es
// mutuo y cambia según quién instale:
//
//   instalando en Windows → se pierde @unrs/resolver-binding-linux-x64-gnu
//                           ⇒ jest 30 (unrs-resolver) queda ciego en el runner Linux del
//                             CI: "Module ts-jest ... was not found"
//   instalando en macOS   → se pierde ese MISMO binding de Linux (el CI y Vercel corren
//                           allá), y sin el de darwin los tests tampoco corren en el Mac
//
// Por eso la lista de abajo es fija y NO depende de dónde se instale: el lock tiene que
// llevar todas las plataformas que el proyecto usa de verdad, sin importar en cuál se
// generó. Corre en postinstall (idempotente); el CI usa `npm ci --ignore-scripts`, así
// que allá nunca ejecuta — el lock ya llega reparado desde el commit.
//
// ⚠️ NO borrar este script aunque un día parezca inerte: quedará inerte justo cuando el
// lock esté sano, que es su trabajo. El primer `npm install` vuelve a podarlo.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const lockPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package-lock.json');
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
const packages = lock.packages ?? {};

// La versión del binding sigue a la del padre (todas las variantes publican juntas).
const padre = Object.entries(packages).find(([k]) => k.endsWith('node_modules/unrs-resolver'));
if (!padre) process.exit(0); // sin unrs-resolver en el árbol no hay nada que reparar
const version = padre[1].version;

// Plataformas que el proyecto necesita de verdad:
//   linux-x64-gnu → CI (GitHub Actions) y build de Vercel
//   darwin-arm64  → la máquina de desarrollo (MacBook Air M-series)
// win32-x64-msvc no se repone: hoy sobrevive en el lock y ya no se desarrolla en Windows.
// Si algún día vuelve a hacer falta, se agrega acá con su integrity.
const BINDINGS = [
  { plataforma: 'linux-x64-gnu', os: ['linux'], cpu: ['x64'] },
  { plataforma: 'darwin-arm64', os: ['darwin'], cpu: ['arm64'] },
];

// integrity conocida por versión; para una versión nueva hay que traerla del registry:
//   npm view @unrs/resolver-binding-<plataforma>@<version> dist.integrity
const INTEGRITY = {
  '1.12.2': {
    'linux-x64-gnu':
      'sha512-mPsUhunKKDih5O96Y6enDQyHc1SqBPlY1E/SfMWDM3EdJ95Z9CArPeCVwCCqbP45ljvivdEk8Fxn+SIb1rDAJQ==',
    'darwin-arm64':
      'sha512-u9DiNT1auQMO20A9SyTuG3wUgQWB9Z7KjAg0uFuCDR1FsAY8A0CG2S6JpHS1xwm/w1G08bjXZDcyOCjv1WAm2w==',
  },
};

const repuestos = [];
for (const { plataforma, os, cpu } of BINDINGS) {
  const clave = `node_modules/@unrs/resolver-binding-${plataforma}`;
  if (packages[clave]) continue; // ya está — no tocar el lock

  const integrity = INTEGRITY[version]?.[plataforma];
  if (!integrity) {
    console.warn(
      `[fix-lock-bindings] unrs-resolver@${version} sin integrity conocida para ${plataforma}; ` +
        `agregala a tools/fix-lock-bindings.mjs ` +
        `(npm view @unrs/resolver-binding-${plataforma}@${version} dist.integrity)`,
    );
    continue;
  }

  packages[clave] = {
    version,
    resolved: `https://registry.npmjs.org/@unrs/resolver-binding-${plataforma}/-/resolver-binding-${plataforma}-${version}.tgz`,
    integrity,
    cpu,
    license: 'MIT',
    optional: true,
    os,
  };
  repuestos.push(plataforma);
}

if (repuestos.length === 0) process.exit(0); // nada que reparar: no reescribir el archivo

// npm escribe "packages" en orden alfabético ("" primero): se preserva ese orden.
lock.packages = Object.fromEntries(
  Object.entries(packages).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
);
writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
console.log(
  `[fix-lock-bindings] re-agregado(s) al package-lock @${version}: ${repuestos.join(', ')}`,
);
