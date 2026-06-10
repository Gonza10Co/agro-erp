# Guarnición sub-pasos (Demo 7) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Profundizar la célula GUARNICION en sus 9 sub-pasos (Área→…→Amarre) con escaneo por sub-paso, trazabilidad fina (operario+hora por sub-paso) y un sub-tablero kanban de 9 columnas.

**Architecture:** Máquina de estados jerárquica `(celula, subPaso)` en `fabricacion-core.ts` (`siguienteEstado`), `Par.subPasoActual` + `EventoTrazabilidad.subPaso` nullable. Frontend: pantalla-operario sub-paso-aware, sub-tablero de Guarnición, sub-paso en tablero y timeline. Construye sobre D5 (escaneo) y D6 (calidad), ambos en `develop`.

**Tech Stack:** NestJS + Prisma + PostgreSQL (:3001), Angular 19 standalone + signals (:4200), Jest/Karma.

**Convenciones (obligatorias):** TDD; commits en español; migraciones `prisma migrate dev` (nunca `db push`); DB local Docker `agro-erp-pg`:5433; backend dev corre desde `dist` (`node dist/main.js`) — si `nest build` no emite `dist`, borrar `.tsbuildinfo`+`dist` y rebuild. Operarios/máquinas siguen a nivel célula GUARNICION (sin cambios de catálogo).

**Sub-pasos (orden fijo):** AREA, ARMADO, VISTAS, CIERRE, PREFORMADO, PERFORADO (perforado y goleteado), REVISION, STROBEL, AMARRE. En AMARRE sale la **capellada** a Almacén.

---

### Task 0: Branch

- [ ] Ya creada: `feat/guarnicion-subpasos` desde `develop`. (Si no: `git checkout develop && git checkout -b feat/guarnicion-subpasos`.)

---

### Task 1: Schema + migración

**Files:** `backend/prisma/schema.prisma`

- [ ] **Step 1:** Agregar enum tras `enum Celula`:

```prisma
enum SubPasoGuarnicion {
  AREA
  ARMADO
  VISTAS
  CIERRE
  PREFORMADO
  PERFORADO
  REVISION
  STROBEL
  AMARRE
}
```

- [ ] **Step 2:** En `model Par`, tras `estado`, agregar `subPasoActual SubPasoGuarnicion?` y `@@index([subPasoActual])`. En `model EventoTrazabilidad`, tras `celula`, agregar `subPaso SubPasoGuarnicion?`.

- [ ] **Step 3:** `cd backend && npx prisma migrate dev --name guarnicion_subpasos` (Docker `agro-erp-pg` arriba). Confirmar migración nueva. La migración es prod-safe (enum nuevo + 2 columnas nullable).

- [ ] **Step 4:** `npm run test:back` → 143 verdes (nada roto por el schema).

- [ ] **Step 5:** Commit: `feat(guarnicion): schema SubPasoGuarnicion + subPasoActual en Par + subPaso en EventoTrazabilidad`.

---

### Task 2: Core — `siguienteEstado` (TDD)

**Files:** `backend/src/fabricacion/fabricacion-core.ts` (+ `.spec.ts`)

- [ ] **Step 1 (test rojo):** Agregar a `fabricacion-core.spec.ts`:

```ts
import { siguienteEstado, ORDEN_SUBPASOS } from './fabricacion-core';

describe('ORDEN_SUBPASOS', () => {
  it('son 9 sub-pasos en orden, AMARRE último', () => {
    expect(ORDEN_SUBPASOS).toHaveLength(9);
    expect(ORDEN_SUBPASOS[0]).toBe('AREA');
    expect(ORDEN_SUBPASOS[8]).toBe('AMARRE');
  });
});

describe('siguienteEstado', () => {
  it('CORTE entra a Guarnición en AREA', () => {
    expect(siguienteEstado({ celula: 'CORTE', subPaso: null })).toEqual({ celula: 'GUARNICION', subPaso: 'AREA' });
  });
  it('avanza sub-paso a sub-paso dentro de Guarnición', () => {
    expect(siguienteEstado({ celula: 'GUARNICION', subPaso: 'AREA' })).toEqual({ celula: 'GUARNICION', subPaso: 'ARMADO' });
    expect(siguienteEstado({ celula: 'GUARNICION', subPaso: 'STROBEL' })).toEqual({ celula: 'GUARNICION', subPaso: 'AMARRE' });
  });
  it('desde AMARRE sale la capellada a Almacén (subPaso null)', () => {
    expect(siguienteEstado({ celula: 'GUARNICION', subPaso: 'AMARRE' })).toEqual({ celula: 'ALMACEN', subPaso: null });
  });
  it('Almacén→Inyección→PT→terminado', () => {
    expect(siguienteEstado({ celula: 'ALMACEN', subPaso: null })).toEqual({ celula: 'INYECCION', subPaso: null });
    expect(siguienteEstado({ celula: 'INYECCION', subPaso: null })).toEqual({ celula: 'PT', subPaso: null });
    expect(siguienteEstado({ celula: 'PT', subPaso: null })).toBeNull();
  });
  it('lanza ante célula desconocida', () => {
    expect(() => siguienteEstado({ celula: 'XXX' as any, subPaso: null })).toThrow();
  });
});
```

- [ ] **Step 2:** Correr `npm run test:back -- fabricacion-core` → rojo.

- [ ] **Step 3 (implementar):** Agregar a `fabricacion-core.ts` (importar `SubPasoGuarnicion` de `@prisma/client`):

```ts
export const ORDEN_SUBPASOS: SubPasoGuarnicion[] =
  ['AREA','ARMADO','VISTAS','CIERRE','PREFORMADO','PERFORADO','REVISION','STROBEL','AMARRE'];

export interface EstadoPar { celula: Celula; subPaso: SubPasoGuarnicion | null; }

/** Única fuente de verdad de la transición (celula, subPaso). null = terminado (sale de PT). */
export function siguienteEstado(e: EstadoPar): EstadoPar | null {
  if (e.celula === 'GUARNICION') {
    const i = ORDEN_SUBPASOS.indexOf(e.subPaso!);
    if (i < 0) throw new Error(`Sub-paso desconocido: "${e.subPaso}"`);
    if (i < ORDEN_SUBPASOS.length - 1) return { celula: 'GUARNICION', subPaso: ORDEN_SUBPASOS[i + 1] };
    return { celula: 'ALMACEN', subPaso: null }; // desde AMARRE
  }
  const sig = siguienteCelula(e.celula); // reusa la cadena célula existente
  if (sig === null) return null;
  if (sig === 'GUARNICION') return { celula: 'GUARNICION', subPaso: 'AREA' };
  return { celula: sig, subPaso: null };
}
```

(Mantener `ORDEN_CELULAS`, `siguienteCelula`, `esUltimaCelula`, `generarPares` intactos. `siguienteCelula` lanza ante célula desconocida → cubre el guard.)

- [ ] **Step 4:** `npm run test:back -- fabricacion-core` → verde.

- [ ] **Step 5:** Commit: `feat(guarnicion): máquina de estados jerárquica siguienteEstado (core, TDD)`.

---

### Task 3: Service — `avanzar` con sub-pasos + includes (TDD)

**Files:** `backend/src/fabricacion/fabricacion.service.ts` (+ `.spec.ts`)

- [ ] **Step 1 (tests rojos):** Agregar a `fabricacion.service.spec.ts` dentro de `describe('FabricacionService.avanzar', ...)` (reusar el `makePrisma`/`dto` existentes):

```ts
  it('entrar a Guarnición desde CORTE setea AREA y registra evento sin subPaso', async () => {
    const { prisma, tx } = makePrisma();
    prisma.par.findUnique.mockResolvedValue({ id: 50, ofId: 1, celulaActual: 'CORTE', subPasoActual: null, estado: 'EN_PROCESO', productoConfiguradoId: 10, tallaId: 1, of: { estado: 'ABIERTA' } });
    tx.par.update.mockResolvedValue({ id: 50 });
    await new FabricacionService(prisma).avanzar('OF1-0001', dto);
    expect(tx.eventoTrazabilidad.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ celula: 'CORTE', subPaso: null }) }));
    expect(tx.par.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ celulaActual: 'GUARNICION', subPasoActual: 'AREA' }) }));
  });

  it('avanza sub-paso dentro de Guarnición y registra el subPaso completado', async () => {
    const { prisma, tx } = makePrisma();
    prisma.par.findUnique.mockResolvedValue({ id: 50, ofId: 1, celulaActual: 'GUARNICION', subPasoActual: 'ARMADO', estado: 'EN_PROCESO', productoConfiguradoId: 10, tallaId: 1, of: { estado: 'EN_PROCESO' } });
    tx.par.update.mockResolvedValue({ id: 50 });
    await new FabricacionService(prisma).avanzar('OF1-0001', dto);
    expect(tx.eventoTrazabilidad.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ celula: 'GUARNICION', subPaso: 'ARMADO' }) }));
    expect(tx.par.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ celulaActual: 'GUARNICION', subPasoActual: 'VISTAS' }) }));
  });

  it('desde AMARRE sale a Almacén con subPasoActual null', async () => {
    const { prisma, tx } = makePrisma();
    prisma.par.findUnique.mockResolvedValue({ id: 50, ofId: 1, celulaActual: 'GUARNICION', subPasoActual: 'AMARRE', estado: 'EN_PROCESO', productoConfiguradoId: 10, tallaId: 1, of: { estado: 'EN_PROCESO' } });
    tx.par.update.mockResolvedValue({ id: 50 });
    await new FabricacionService(prisma).avanzar('OF1-0001', dto);
    expect(tx.par.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ celulaActual: 'ALMACEN', subPasoActual: null }) }));
  });
```

Los tests existentes de avanzar (ALMACEN→INYECCION, PT→TERMINADO, cierre de OF, 409, P2003) deben seguir verdes; agregar `subPasoActual: null` a los mocks de `par.findUnique` de esos tests donde haga falta para el nuevo flujo.

- [ ] **Step 2:** `npm run test:back -- fabricacion.service` → rojo en los nuevos.

- [ ] **Step 3 (implementar):** En `avanzar`, reemplazar el uso de `siguienteCelula(celulaActual)` por `siguienteEstado({ celula: par.celulaActual, subPaso: par.subPasoActual })`. Importar `siguienteEstado`. El evento se crea con `subPaso: par.subPasoActual`. La rama `next === null` (PT→TERMINADO + InventarioPT + cierre OF) queda igual. La rama `next !== null`: `tx.par.update({ where:{id}, data:{ celulaActual: next.celula, subPasoActual: next.subPaso } })`. Mantener la regla `CORTE && of ABIERTA → EN_PROCESO`. Mantener intacto el manejo de errores (409 estado, P2003→400, bodega PT).

- [ ] **Step 4:** Incluir sub-pasos en lecturas:
  - `obtenerPar`: agregar `subPasoActual: true` al `select`/include del par y `subPaso: true` al `select` de cada evento.
  - `tablero`: agregar `subPasoActual: true` al `select` de cada par.

- [ ] **Step 5:** `npm run test:back` completo → verde. `npm run build --workspace backend` → exit 0.

- [ ] **Step 6:** Commit: `feat(guarnicion): avanzar por sub-pasos + subPaso en eventos/tablero/detalle (TDD)`.

---

### Task 4: Seed — operarios extra de Guarnición

**Files:** `backend/prisma/seed-demo.ts`

- [ ] **Step 1:** En el bloque MES de operarios, tras crear el operario único por célula, agregar 2 operarios extra de GUARNICION (ej. "Gloria Guarín" ya existe; agregar "Sofía Costuras" y "Marta Hilván" con `celula: 'GUARNICION'`). Idempotencia ya cubierta por el `operario.deleteMany` del bloque de limpieza.

- [ ] **Step 2:** Correr `npm run seed:demo --workspace backend` dos veces → ambas OK sin errores.

- [ ] **Step 3:** Commit: `feat(guarnicion): seed con operarios extra de Guarnición para el sub-tablero`.

---

### Task 5: Front — modelos + `siguientePasoLabel` (TDD)

**Files:** `frontend/src/app/core/api/models/fabricacion.models.ts` (+ posible `.spec.ts` nuevo para el helper)

- [ ] **Step 1:** Agregar:

```ts
export type SubPasoGuarnicion = 'AREA'|'ARMADO'|'VISTAS'|'CIERRE'|'PREFORMADO'|'PERFORADO'|'REVISION'|'STROBEL'|'AMARRE';
export const ORDEN_SUBPASOS: SubPasoGuarnicion[] = ['AREA','ARMADO','VISTAS','CIERRE','PREFORMADO','PERFORADO','REVISION','STROBEL','AMARRE'];
export const LABEL_SUBPASO: Record<SubPasoGuarnicion, string> = {
  AREA:'Área', ARMADO:'Armado', VISTAS:'Vistas', CIERRE:'Cierre', PREFORMADO:'Preformado',
  PERFORADO:'Perforado y goleteado', REVISION:'Revisión', STROBEL:'Strobel', AMARRE:'Amarre',
};
```

Agregar `subPasoActual: SubPasoGuarnicion | null` a `ParDetalle` y `ParTablero`; `subPaso: SubPasoGuarnicion | null` a `EventoTrazabilidad`.

- [ ] **Step 2:** Helper que devuelve la etiqueta del próximo paso real (sub-paso si está en Guarnición, célula si no). Test (crear `fabricacion.models.spec.ts` o agregar a uno existente):

```ts
import { siguientePasoLabel } from './models/fabricacion.models'; // ajustar ruta
// CORTE → 'Guarnición'; GUARNICION+ARMADO → 'Vistas'; GUARNICION+AMARRE → 'Almacén'; INYECCION → 'P. Terminado'; PT → null
```

Implementación:

```ts
export function siguientePasoLabel(celula: Celula, subPaso: SubPasoGuarnicion | null): string | null {
  if (celula === 'GUARNICION' && subPaso) {
    const i = ORDEN_SUBPASOS.indexOf(subPaso);
    if (i < ORDEN_SUBPASOS.length - 1) return LABEL_SUBPASO[ORDEN_SUBPASOS[i + 1]];
    return LABEL_CELULA['ALMACEN']; // desde AMARRE
  }
  return siguienteCelulaLabel(celula); // helper existente para el resto
}
```

- [ ] **Step 3:** `npm run test:front` → verde (los specs existentes que construyen `ParDetalle`/`ParTablero` usan flush sin tipado o `as never`, no deberían exigir el campo; si el compilador lo pide, agregar `subPasoActual: null`).

- [ ] **Step 4:** Commit: `feat(front/guarnicion): modelos de sub-paso + siguientePasoLabel (TDD)`.

---

### Task 6: Front — pantalla-operario sub-paso-aware (TDD)

**Files:** `frontend/src/app/features/fabricacion/pantalla-operario.component.ts` (+ `.spec.ts`)

- [ ] **Step 1 (tests):** En Guarnición el botón muestra el próximo sub-paso; en AMARRE muestra "Cargar a Almacén (capellada)". El badge del par muestra "en Guarnición · {sub-paso}". Tests con `HttpTestingController` flusheando un par con `celulaActual:'GUARNICION', subPasoActual:'ARMADO'` → botón contiene "Vistas"; con `subPasoActual:'AMARRE'` → botón contiene "Almacén".

- [ ] **Step 2:** Implementar: usar `siguientePasoLabel(p.celulaActual, p.subPasoActual)` para el label del botón (reemplaza `siguienteCelulaLabel`). El texto en AMARRE: si `p.celulaActual==='GUARNICION' && p.subPasoActual==='AMARRE'` → "Cargar a Almacén (capellada) →". Badge de ubicación: `en {LABEL_CELULA[celula]}{ subPasoActual ? ' · '+LABEL_SUBPASO[subPasoActual] : '' }`. La llamada `avanzar` NO cambia. Reusar el panel de calidad D6 sin tocar.

- [ ] **Step 3:** `npm run test:front` → verde.

- [ ] **Step 4:** Commit: `feat(front/guarnicion): pantalla operario avanza por sub-pasos (label + badge, TDD)`.

---

### Task 7: Front — sub-paso en tablero + link a sub-tablero (TDD)

**Files:** `frontend/src/app/features/fabricacion/tablero.component.ts` (+ `.spec.ts`)

- [ ] **Step 1 (test):** En la columna GUARNICION, los chips muestran el sub-paso (`LABEL_SUBPASO`). El header de Guarnición tiene un link "ver sub-pasos →" a `/fabricacion/guarnicion?ofId=`. Test: flush con un par `celulaActual:'GUARNICION', subPasoActual:'STROBEL'` → el chip contiene "Strobel"; existe un link a `/fabricacion/guarnicion`.

- [ ] **Step 2:** Implementar: en el `@for` de la columna, si `p.celulaActual==='GUARNICION'` mostrar `LABEL_SUBPASO[p.subPasoActual]` como sub-badge. Agregar el link condicional en el header de la columna Guarnición (pasando el `ofId` actual si existe).

- [ ] **Step 3:** `npm run test:front` → verde.

- [ ] **Step 4:** Commit: `feat(front/guarnicion): badge de sub-paso y acceso al sub-tablero desde el tablero (TDD)`.

---

### Task 8: Front — sub-tablero de Guarnición (TDD)

**Files:** `frontend/src/app/features/fabricacion/guarnicion-subtablero.component.ts` (+ `.spec.ts`), `frontend/src/app/app.routes.ts`

- [ ] **Step 1 (spec rojo):** Componente que GETea `/fabricacion/tablero?ofId=` (reusa `FabricacionApi.tablero`), filtra `celulaActual==='GUARNICION'` y agrupa por `subPasoActual` en 9 columnas (`ORDEN_SUBPASOS`), con conteo por columna; chips enlazan a par-detalle. Test: flush con pares en distintos sub-pasos → 9 columnas presentes, par en la columna correcta, conteo correcto.

- [ ] **Step 2:** Implementar reusando el patrón y estilos de `tablero.component.ts` (signals, `computed` que agrupa por sub-paso, `RouterLink`, `ActivatedRoute` para `ofId`, botón Actualizar, manejo de error). Header "Guarnición · sub-pasos".

- [ ] **Step 3:** Ruta en `app.routes.ts` (dentro del shell): `{ path: 'fabricacion/guarnicion', loadComponent: () => import('./features/fabricacion/guarnicion-subtablero.component').then(m => m.GuarnicionSubtableroComponent) }`.

- [ ] **Step 4:** `npm run test:front` → verde. `npm run build --workspace frontend` → exit 0.

- [ ] **Step 5:** Commit: `feat(front/guarnicion): sub-tablero kanban de 9 sub-pasos + ruta (TDD)`.

---

### Task 9: Front — sub-paso en la timeline del par (TDD)

**Files:** `frontend/src/app/features/fabricacion/par-detalle.component.ts` (+ `.spec.ts`)

- [ ] **Step 1 (test):** En eventos de Guarnición la timeline muestra el sub-paso ("Guarnición · Armado"). Test: flush con un evento `celula:'GUARNICION', subPaso:'ARMADO'` → la timeline contiene "Armado".

- [ ] **Step 2:** En el render del evento, si `e.celula==='GUARNICION' && e.subPaso` mostrar `LABEL_CELULA[e.celula] + ' · ' + LABEL_SUBPASO[e.subPaso]` en lugar de solo la célula. El resto de la timeline (incidencias, reposición) intacto.

- [ ] **Step 3:** `npm run test:front` → verde.

- [ ] **Step 4:** Commit: `feat(front/guarnicion): sub-paso en la timeline de trazabilidad del par (TDD)`.

---

### Task 10: Verificación final + E2E + merge

- [ ] **Step 1:** `npm run test:back` (≥146) y `npm run test:front` (≥124) verdes; `npm run build` OK.

- [ ] **Step 2:** **E2E por API** (script efímero, borrar + re-seed al final). Arrancar backend desde `dist` (`node dist/main.js`, Docker arriba). Flujo: login gerente → OF de OP-9005 → avanzar par1 CORTE → verificar `subPasoActual='AREA'` en Guarnición → avanzar los 9 sub-pasos verificando que cada `subPasoActual` avanza y cada `EventoTrazabilidad` lleva su `subPaso` → desde AMARRE → `celulaActual='ALMACEN', subPasoActual=null` → seguir ALMACEN→INYECCION→PT → `TERMINADO` + `InventarioPT +1` → `GET /fabricacion/tablero?ofId=` confirma agrupación por sub-paso. Reportar PASS/FAIL por aserción.

- [ ] **Step 3:** Re-seed demo limpio, borrar el script E2E.

- [ ] **Step 4:** Merge `--no-ff` a `develop`, borrar `feat/guarnicion-subpasos`, actualizar memoria `botas-roadmap` (D7 en develop).
