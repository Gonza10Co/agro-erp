# Indicadores de eficiencia (Demo 8) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Dashboard de indicadores del piso de planta calculado de los timestamps de `EventoTrazabilidad`: tiempo promedio por etapa (célula + sub-paso de Guarnición), eficiencia por operario y por máquina, y alertas de demora con umbral configurable por célula.

**Architecture:** Lógica pura en `indicadores-core.ts` (duraciones entre eventos consecutivos → tramos → agregados; detección de demoras). Módulo backend `indicadores` (service + controller + module). Tabla `UmbralDemora` (umbral por célula, sembrada). Frontend: `IndicadoresApi` + dashboard nuevo + nav. Determinístico (sin IA — la predicción de demoras es fase posterior, briefing §IA). Construye sobre D5/D6/D7 (en `develop`).

**Tech Stack:** NestJS + Prisma + PostgreSQL (:3001), Angular 19 standalone + signals (:4200), Jest/Karma.

**Convenciones:** TDD; commits en español; migraciones `prisma migrate dev`; DB local Docker `agro-erp-pg`:5433; backend dev desde `dist` (`node dist/main.js`; si no emite `dist`, borrar `.tsbuildinfo`+`dist` y rebuild). Path: `C:\Users\gonza\Documents\Freelance\Agro\agro-erp`.

## Concepto de cálculo (clave)

Cada `EventoTrazabilidad` registra el trabajo COMPLETADO en una etapa `(celula, subPaso, operarioId, maquinaId, timestamp)`. Ordenando los eventos de un par por timestamp, la **duración del tramo** que recorre cada evento = `evento.timestamp − (timestamp del evento anterior, o `par.createdAt` para el primero)`. Esa duración se imputa a la etapa/operario/máquina del evento. De ahí salen:
- **Tiempo por etapa:** promedio de duración agrupado por `(celula, subPaso)`.
- **Eficiencia x operario:** # tramos + duración promedio agrupado por operario.
- **Eficiencia x máquina:** idem por máquina.
- **Alertas de demora:** par `EN_PROCESO` cuyo tiempo en su etapa actual = `now − (último evento, o createdAt)` supera `UmbralDemora[celulaActual].minutos`.

---

### Task 0: Branch
- [ ] Ya creada: `feat/indicadores-eficiencia` desde `develop`.

---

### Task 1: Schema `UmbralDemora` + migración

**Files:** `backend/prisma/schema.prisma`

- [ ] **Step 1:** Agregar modelo:
```prisma
model UmbralDemora {
  id      Int    @id @default(autoincrement())
  celula  Celula @unique
  minutos Int
}
```
- [ ] **Step 2:** `cd backend && npx prisma migrate dev --name umbral_demora` (Docker arriba). Prod-safe: tabla nueva, sin tocar existentes.
- [ ] **Step 3:** `npm run test:back` → 152 verdes.
- [ ] **Step 4:** Commit: `feat(indicadores): schema UmbralDemora (umbral de demora por célula)`.

---

### Task 2: Core — duraciones, eficiencia, demoras (TDD)

**Files:** `backend/src/indicadores/indicadores-core.ts` (+ `.spec.ts`)

Tipos y funciones puras (sin DB). Reusa `Celula`/`SubPasoGuarnicion` de `@prisma/client`.

- [ ] **Step 1 (tests rojos):** Crear `indicadores-core.spec.ts`. Cubre:

```ts
import { calcularTramos, agruparPorEtapa, agruparPorOperario, agruparPorMaquina, detectarDemoras } from './indicadores-core';

// Un par con createdAt y 3 eventos → 3 tramos con duraciones correctas (en minutos)
describe('calcularTramos', () => {
  it('duración = evento − anterior (createdAt para el primero), en minutos', () => {
    const createdAt = new Date('2026-06-10T08:00:00Z');
    const eventos = [
      { celula: 'CORTE', subPaso: null, operarioId: 1, operario: { nombre: 'A' }, maquinaId: 1, maquina: { nombre: 'M1' }, timestamp: new Date('2026-06-10T08:20:00Z') },
      { celula: 'GUARNICION', subPaso: 'AREA', operarioId: 2, operario: { nombre: 'B' }, maquinaId: 2, maquina: { nombre: 'M2' }, timestamp: new Date('2026-06-10T08:35:00Z') },
    ];
    const tramos = calcularTramos(createdAt, eventos as any);
    expect(tramos).toHaveLength(2);
    expect(tramos[0]).toMatchObject({ celula: 'CORTE', subPaso: null, operarioId: 1, maquinaId: 1, duracionMin: 20 });
    expect(tramos[1]).toMatchObject({ celula: 'GUARNICION', subPaso: 'AREA', operarioId: 2, duracionMin: 15 });
  });
  it('par sin eventos → sin tramos', () => {
    expect(calcularTramos(new Date(), [])).toEqual([]);
  });
});

// Agregados: promedio + conteo
describe('agrupaciones', () => {
  const tramos = [
    { celula: 'CORTE', subPaso: null, operarioId: 1, operarioNombre: 'A', maquinaId: 1, maquinaNombre: 'M1', duracionMin: 10 },
    { celula: 'CORTE', subPaso: null, operarioId: 1, operarioNombre: 'A', maquinaId: 1, maquinaNombre: 'M1', duracionMin: 20 },
    { celula: 'GUARNICION', subPaso: 'AREA', operarioId: 2, operarioNombre: 'B', maquinaId: 2, maquinaNombre: 'M2', duracionMin: 6 },
  ];
  it('porEtapa: promedio y conteo por (celula, subPaso)', () => {
    const r = agruparPorEtapa(tramos as any);
    const corte = r.find((e) => e.celula === 'CORTE' && e.subPaso === null)!;
    expect(corte).toMatchObject({ tramos: 2, promedioMin: 15 });
    const area = r.find((e) => e.subPaso === 'AREA')!;
    expect(area).toMatchObject({ tramos: 1, promedioMin: 6 });
  });
  it('porOperario / porMaquina: promedio + conteo, ordenado por # tramos desc', () => {
    const o = agruparPorOperario(tramos as any);
    expect(o[0]).toMatchObject({ operarioId: 1, nombre: 'A', tramos: 2, promedioMin: 15 });
    const m = agruparPorMaquina(tramos as any);
    expect(m[0]).toMatchObject({ maquinaId: 1, nombre: 'M1', tramos: 2 });
  });
});

// Demoras: par EN_PROCESO cuyo tiempo en etapa supera el umbral de su célula
describe('detectarDemoras', () => {
  const now = new Date('2026-06-10T12:00:00Z');
  const umbrales = { CORTE: 30, GUARNICION: 20, ALMACEN: 30, INYECCION: 45, PT: 30 };
  it('marca demorado el par que excede el umbral de su célula actual', () => {
    const pares = [
      { codigo: 'P1', celulaActual: 'GUARNICION', subPasoActual: 'STROBEL', desde: new Date('2026-06-10T11:00:00Z') }, // 60min > 20
      { codigo: 'P2', celulaActual: 'CORTE', subPasoActual: null, desde: new Date('2026-06-10T11:50:00Z') }, // 10min < 30
    ];
    const al = detectarDemoras(pares as any, umbrales as any, now);
    expect(al).toHaveLength(1);
    expect(al[0]).toMatchObject({ codigo: 'P1', celula: 'GUARNICION', minutosEnEtapa: 60, umbralMin: 20 });
  });
});
```

- [ ] **Step 2:** `npm run test:back -- indicadores-core` → rojo.

- [ ] **Step 3 (implementar):** `indicadores-core.ts`. `calcularTramos(createdAt, eventosOrdenados)` recorre eventos calculando `duracionMin = round((t − prev)/60000)`; emite `{ celula, subPaso, operarioId, operarioNombre, maquinaId, maquinaNombre, duracionMin }`. `agruparPorEtapa` agrupa por `celula+'|'+subPaso`, devuelve `{ celula, subPaso, tramos, promedioMin }` (promedio redondeado). `agruparPorOperario`/`agruparPorMaquina` agrupan por id, devuelven `{ id, nombre, tramos, promedioMin }` ordenado por `tramos` desc (tie-break por nombre). `detectarDemoras(pares, umbrales, now)`: para cada par, `minutosEnEtapa = round((now − desde)/60000)`; si `> umbrales[celulaActual]` emite `{ codigo, celula, subPaso, minutosEnEtapa, umbralMin }`, ordenado por exceso desc.

- [ ] **Step 4:** `npm run test:back -- indicadores-core` → verde.
- [ ] **Step 5:** Commit: `feat(indicadores): núcleo puro de duraciones, eficiencia y demoras (TDD)`.

---

### Task 3: Service + controller + module (TDD)

**Files:** `backend/src/indicadores/indicadores.service.ts` (+ `.spec.ts`), `indicadores.controller.ts`, `indicadores.module.ts`, `backend/src/app.module.ts`

- [ ] **Step 1 (test rojo):** `indicadores.service.spec.ts` con prisma mock (patrón `fabricacion.service.spec.ts`). El service `indicadores(now?)`:
  1. Carga pares con sus eventos ordenados + createdAt (`prisma.par.findMany({ include: { eventos: { include: { operario:{select:{nombre}}, maquina:{select:{nombre}} }, orderBy:{ timestamp:'asc' } } } })`).
  2. Por par → `calcularTramos(par.createdAt, par.eventos)`; concatena todos los tramos → `agruparPorEtapa/Operario/Maquina`.
  3. Carga `umbralDemora.findMany()` → mapa `{ celula: minutos }`. Carga pares `EN_PROCESO` con su último evento (o createdAt) → arma `{ codigo, celulaActual, subPasoActual, desde }` → `detectarDemoras(..., now ?? new Date())`.
  4. Devuelve `{ etapas, operarios, maquinas, alertas }`.
  Test: con un par mockeado con 2 eventos verifica que delega y arma el shape; con un umbral y un par EN_PROCESO viejo verifica una alerta. Inyectar `now` fijo para determinismo.

- [ ] **Step 2:** rojo → **Step 3:** implementar service. **Step 4:** controller `@UseGuards(JwtAuthGuard) @Controller('indicadores')` con `@Get() indicadores() { return this.service.indicadores(); }`. Module (controllers+providers). Registrar `IndicadoresModule` en `app.module.ts` (PrismaModule es `@Global`).
- [ ] **Step 5:** `npm run test:back` completo verde. `npm run build --workspace backend` exit 0.
- [ ] **Step 6:** Commit: `feat(indicadores): endpoint GET /indicadores (eficiencia + alertas) + módulo`.

---

### Task 4: Seed — umbrales + OF histórica con eventos

**Files:** `backend/prisma/seed-demo.ts`

- [ ] **Step 1: Umbrales por célula (upsert idempotente por `celula`):**
```ts
const umbrales = [
  { celula: 'CORTE', minutos: 60 }, { celula: 'GUARNICION', minutos: 30 },
  { celula: 'ALMACEN', minutos: 30 }, { celula: 'INYECCION', minutos: 45 }, { celula: 'PT', minutos: 30 },
] as const;
for (const u of umbrales) await prisma.umbralDemora.upsert({ where: { celula: u.celula }, update: { minutos: u.minutos }, create: u });
```

- [ ] **Step 2: OF histórica (OP-9006) con eventos de timestamps escalonados.** Crear OC/OP/OF 9006 (patrón de OP-9005 pero con `consecutivo: 9006`; agregar 9006 a la lista de consecutivos de la limpieza idempotente del bloque MES, y limpiar sus `eventoTrazabilidad` antes de los pares). Sembrar ~6 pares con historia: un helper que, dado el par y una lista de pasos `{ celula, subPaso, operarioCelula, minutosAtras }`, crea los `EventoTrazabilidad` con `timestamp` = `new Date(Date.now() - minutosAtras*60000)` y deja el par en el estado final:
  - 3-4 pares **TERMINADO** (recorrido completo CORTE→…→PT con tramos de 10-20 min; timestamps de "ayer"/horas atrás) → pueblan tiempo por etapa + eficiencia.
  - 2-3 pares **EN_PROCESO** con último evento **viejo** (ej. 2-3 horas atrás) en GUARNICION/INYECCION → disparan alertas de demora (superan el umbral de su célula).
  Usar los operarios/máquinas existentes por célula (incl. los 3 de Guarnición). `Date.now()` es válido en el seed (script normal).

- [ ] **Step 3:** Correr `npm run seed:demo --workspace backend` dos veces → ambas OK; verificar que `GET /indicadores` (vía un curl rápido o el E2E de T7) devuelve etapas/operarios/máquinas no vacíos y ≥1 alerta.
- [ ] **Step 4:** Commit: `feat(indicadores): seed de umbrales + OF histórica (OP-9006) con eventos para poblar el dashboard`.

---

### Task 5: Front — modelos + `IndicadoresApi` (TDD)

**Files:** `frontend/src/app/core/api/models/indicadores.models.ts`, `frontend/src/app/core/api/indicadores.api.ts` (+ `.spec.ts`)

- [ ] **Step 1:** Modelos: `EtapaIndicador { celula, subPaso, tramos, promedioMin }`, `RecursoIndicador { id, nombre, tramos, promedioMin }` (operario/máquina), `AlertaDemora { codigo, celula, subPaso, minutosEnEtapa, umbralMin }`, `Indicadores { etapas, operarios, maquinas, alertas }`. Reusar `Celula`/`SubPasoGuarnicion` de `fabricacion.models`.
- [ ] **Step 2 (TDD):** `IndicadoresApi.indicadores()` → `GET /indicadores`. Spec con `HttpTestingController` (patrón `calidad.api.spec.ts`). Rojo → implementar → verde.
- [ ] **Step 3:** Commit: `feat(front/indicadores): modelos + IndicadoresApi (TDD)`.

---

### Task 6: Front — dashboard de indicadores + ruta + nav (TDD)

**Files:** `frontend/src/app/features/indicadores/dashboard-indicadores.component.ts` (+ `.spec.ts`), `app.routes.ts`, `layout/shell/shell.component.ts`

- [ ] **Step 1 (spec rojo):** Componente que GETea `/indicadores` y renderiza: tabla/cards **tiempo por etapa** (célula + sub-paso · promedio min · # tramos), tabla **eficiencia por operario** y **por máquina** (nombre · # tramos · promedio), y sección **alertas de demora** (par · etapa · min en etapa vs umbral, resaltado). Botón Actualizar + estado de error + estado vacío. Tests (patrón `dashboard-calidad.component.spec.ts`): flush con etapas/operarios/máquinas/alertas → render de un operario, una etapa con sub-paso ("Strobel"), una alerta con su código; test de error.
- [ ] **Step 2:** Implementar reusando estilos/patrón de `dashboard-calidad.component.ts` (signals, `@if/@for`, `LABEL_CELULA`/`LABEL_SUBPASO`, tokens "Acero", `--danger` para alertas). **Step 3:** ruta `indicadores` (lazy, dentro del shell) + nav-item "Indicadores" en el grupo "Operación" del shell (svg de gráfico/reloj). **Step 4:** `npm run test:front` verde + `npm run build --workspace frontend` exit 0.
- [ ] **Step 5:** Commit: `feat(front/indicadores): dashboard de eficiencia + alertas de demora + ruta y nav (TDD)`.

---

### Task 7: Verificación final + E2E + merge

- [ ] **Step 1:** `npm run test:back` y `npm run test:front` verdes; `npm run build` OK.
- [ ] **Step 2: E2E por API** (script efímero, borrar + re-seed al final; backend desde `dist`, Docker arriba). Login gerente → `GET /indicadores` → verificar: `etapas` no vacío con al menos una entrada de Guarnición con sub-paso; `operarios` y `maquinas` no vacíos con promedios > 0; `alertas` ≥1 con `minutosEnEtapa > umbralMin`. Reportar PASS/FAIL por aserción.
- [ ] **Step 3:** Re-seed limpio, borrar el script E2E.
- [ ] **Step 4:** Merge `--no-ff` a `develop`, borrar `feat/indicadores-eficiencia`, actualizar memoria `botas-roadmap` (D8 en develop).

## Fuera de alcance (futuro)
- Predicción de demoras con IA/ML (briefing: fase posterior).
- Tiempo de entrega del PEDIDO con descuento de días retenidos por cartera (es indicador a nivel Pedidos/Despacho, no piso de planta).
- Edición de umbrales por UI (se siembran; CRUD futuro).
- Costos en pesos por etapa/operario (D8 es tiempo/conteo, no $).
