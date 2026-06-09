# Hardening post-revisión integral — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar los riesgos detectados en la revisión del 2026-06-09: carreras en consecutivos, falta de lock de inventario, OP anulada con pares vivos, validación débil, usuario hardcodeado, pantalla de operario frágil, módulo MES sin tests front, y ausencia de CI/README.

**Architecture:** Backend NestJS + Prisma/PostgreSQL (consecutivos pasan a secuencias nativas de PG; locks con `SELECT ... FOR UPDATE`). Frontend Angular 19 standalone + signals (specs con `HttpTestingController` apuntando a `http://localhost:3001`). Todo se trabaja en rama `feat/hardening-revision` desde `develop`, merge final `--no-ff`.

**Tech Stack:** NestJS 11, Prisma, PostgreSQL (Docker local `agro-erp-pg`, puerto 5433), Angular 19, Jest (back), Karma/Jasmine (front), GitHub Actions.

**Convenciones del repo:** comentarios y mensajes de commit en español; commits estilo `feat(scope): ...` / `fix(scope): ...` / `test(scope): ...`. El backend corre en :3001. Antes de tareas con migraciones: `docker start agro-erp-pg` (el `.env` del backend ya apunta a local).

**Working dir:** `C:\Users\gonza\Documents\Freelance\Botas Agroindustriales\agro-erp`

---

### Task 1: Rama de trabajo + limpieza de carpeta basura

**Files:**
- Delete (disco, no trackeada): `backendsrccompras/`

- [ ] **Step 1: Crear rama desde develop**

```bash
git checkout develop
git checkout -b feat/hardening-revision
```

- [ ] **Step 2: Borrar carpeta basura (residuo de un path mal escapado, vacía y NO trackeada — verificado con `git ls-files`)**

```powershell
Remove-Item -Recurse -Force "backendsrccompras"
```

- [ ] **Step 3: Verificar que el working tree sigue limpio**

Run: `git status --short`
Expected: sin salida (la carpeta no estaba trackeada, no hay nada que commitear).

---

### Task 2: Helper `siguienteConsecutivo` + migración de secuencias PostgreSQL

El patrón actual `aggregate _max + 1` tiene carrera: dos requests concurrentes leen el mismo max y el segundo `create` revienta con P2002 (consecutivo es `@unique`). Las secuencias de PG son atómicas.

**Files:**
- Create: `backend/src/prisma/consecutivo.ts`
- Test: `backend/src/prisma/consecutivo.spec.ts`
- Create: `backend/prisma/migrations/20260609000000_consecutivo_seqs/migration.sql`

- [ ] **Step 1: Escribir el test que falla**

```typescript
// backend/src/prisma/consecutivo.spec.ts
import { siguienteConsecutivo } from './consecutivo';

describe('siguienteConsecutivo', () => {
  it('consulta nextval de la secuencia correcta y devuelve number', async () => {
    const db = { $queryRawUnsafe: jest.fn().mockResolvedValue([{ v: 42n }]) };
    const v = await siguienteConsecutivo(db, 'of');
    expect(db.$queryRawUnsafe).toHaveBeenCalledWith(
      "SELECT nextval('of_consecutivo_seq') AS v",
    );
    expect(v).toBe(42);
  });

  it('cada entidad usa su propia secuencia', async () => {
    const db = { $queryRawUnsafe: jest.fn().mockResolvedValue([{ v: 1n }]) };
    await siguienteConsecutivo(db, 'oc');
    expect(db.$queryRawUnsafe).toHaveBeenCalledWith(
      "SELECT nextval('oc_consecutivo_seq') AS v",
    );
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test --workspace backend -- consecutivo.spec`
Expected: FAIL — "Cannot find module './consecutivo'"

- [ ] **Step 3: Implementar el helper**

```typescript
// backend/src/prisma/consecutivo.ts
// Numeración consecutiva atómica vía secuencias de PostgreSQL.
// Reemplaza el patrón `aggregate _max + 1`, que tiene carrera bajo concurrencia.
const SECUENCIAS = {
  oc: 'oc_consecutivo_seq',
  op: 'op_consecutivo_seq',
  of: 'of_consecutivo_seq',
  despacho: 'despacho_consecutivo_seq',
  req: 'req_consecutivo_seq',
} as const;

export type EntidadConsecutivo = keyof typeof SECUENCIAS;

export interface ClienteConsecutivo {
  $queryRawUnsafe<T = unknown>(query: string): Promise<T>;
}

export async function siguienteConsecutivo(
  db: ClienteConsecutivo,
  entidad: EntidadConsecutivo,
): Promise<number> {
  // El nombre de la secuencia sale de un mapa cerrado: no hay inyección posible.
  const rows = await db.$queryRawUnsafe<Array<{ v: bigint }>>(
    `SELECT nextval('${SECUENCIAS[entidad]}') AS v`,
  );
  return Number(rows[0].v);
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm test --workspace backend -- consecutivo.spec`
Expected: PASS (2 tests)

- [ ] **Step 5: Crear la migración (arranca cada secuencia en MAX actual + 1)**

```sql
-- backend/prisma/migrations/20260609000000_consecutivo_seqs/migration.sql
-- Secuencias atómicas para numeración consecutiva (elimina la carrera del patrón MAX+1).
CREATE SEQUENCE IF NOT EXISTS "oc_consecutivo_seq";
SELECT setval('oc_consecutivo_seq', COALESCE((SELECT MAX("consecutivo") FROM "OrdenCompra"), 0) + 1, false);

CREATE SEQUENCE IF NOT EXISTS "op_consecutivo_seq";
SELECT setval('op_consecutivo_seq', COALESCE((SELECT MAX("consecutivo") FROM "OrdenProduccion"), 0) + 1, false);

CREATE SEQUENCE IF NOT EXISTS "of_consecutivo_seq";
SELECT setval('of_consecutivo_seq', COALESCE((SELECT MAX("consecutivo") FROM "OrdenFabricacion"), 0) + 1, false);

CREATE SEQUENCE IF NOT EXISTS "despacho_consecutivo_seq";
SELECT setval('despacho_consecutivo_seq', COALESCE((SELECT MAX("consecutivo") FROM "Despacho"), 0) + 1, false);

CREATE SEQUENCE IF NOT EXISTS "req_consecutivo_seq";
SELECT setval('req_consecutivo_seq', COALESCE((SELECT MAX("consecutivo") FROM "RequerimientoCompra"), 0) + 1, false);
```

- [ ] **Step 6: Aplicar la migración en local**

Run: `docker start agro-erp-pg` (si no está corriendo), luego desde `backend/`: `npx prisma migrate dev`
Expected: "Applying migration 20260609000000_consecutivo_seqs" + "Your database is now in sync".

- [ ] **Step 7: Commit**

```bash
git add backend/src/prisma/consecutivo.ts backend/src/prisma/consecutivo.spec.ts backend/prisma/migrations/20260609000000_consecutivo_seqs/
git commit -m "feat(back): secuencias PG para consecutivos atomicos (helper + migracion)"
```

---

### Task 3: Adoptar `siguienteConsecutivo` en los 5 services

**Files:**
- Modify: `backend/src/pedidos/oc/oc.service.ts:14-18`
- Modify: `backend/src/pedidos/op/op.service.ts:25-29`
- Modify: `backend/src/fabricacion/fabricacion.service.ts:36-38`
- Modify: `backend/src/despachos/despacho.service.ts:74-76`
- Modify: `backend/src/compras/compras.service.ts:107-110`
- Modify (specs): `oc.service.spec.ts`, `op.service.spec.ts`, `fabricacion.service.spec.ts`, `despacho.service.spec.ts`, `compras.service.spec.ts` (mismos directorios que sus services)

- [ ] **Step 1: Actualizar los specs primero (TDD): reemplazar mocks de `aggregate` por `$queryRawUnsafe`**

En cada spec, donde el mock de prisma/tx tenga `aggregate: jest.fn().mockResolvedValue({ _max: { consecutivo: N } })`, eliminar ese mock del modelo y agregar al MISMO objeto donde vivía (tx o prisma raíz):

```typescript
$queryRawUnsafe: jest.fn().mockResolvedValue([{ v: BigInt(N + 1) }]),
```

Equivalencias exactas (el valor esperado por las aserciones NO cambia):
- `fabricacion.service.spec.ts`: `_max: { consecutivo: 4 }` → `[{ v: 5n }]` (en `tx`); el test "consecutivo = 1 cuando no hay OFs previas" pasa de mockear `aggregate ... null` a `tx.$queryRawUnsafe.mockResolvedValue([{ v: 1n }])`.
- `oc.service.spec.ts`: `_max: { consecutivo: 3900 }` → `[{ v: 3901n }]` (en `prisma` raíz — `crear()` no usa tx); `_max: { consecutivo: null }` → `[{ v: 1n }]`.
- `op.service.spec.ts`: `_max: { consecutivo: 800 }` → `[{ v: 801n }]` (en `tx`).
- `despacho.service.spec.ts`: `_max: { consecutivo: 4 }` → `[{ v: 5n }]`; `_max: { consecutivo: 0 }` → `[{ v: 1n }]` (en `tx`).
- `compras.service.spec.ts`: `_max: { consecutivo: 0 }` → `[{ v: 1n }]` (revisar si el aggregate está en tx o raíz y poner el mock ahí).

- [ ] **Step 2: Correr los specs y verificar que fallan**

Run: `npm test --workspace backend`
Expected: FAIL en los 5 specs (los services todavía llaman `aggregate`).

- [ ] **Step 3: Reemplazar el patrón en los 5 services**

En cada service, importar el helper y reemplazar el bloque aggregate. Ejemplo en `fabricacion.service.ts` (los otros 4 son análogos — en `oc.service.ts` el receptor es `this.prisma` porque `crear()` no abre transacción):

```typescript
import { siguienteConsecutivo } from '../prisma/consecutivo';
// (en op/oc el path es '../../prisma/consecutivo')

// ANTES:
//   const agg = await tx.ordenFabricacion.aggregate({ _max: { consecutivo: true } });
//   const consecutivo = (agg._max.consecutivo ?? 0) + 1;
// DESPUÉS:
const consecutivo = await siguienteConsecutivo(tx, 'of');
```

Mapa entidad→clave: OrdenCompra→`'oc'`, OrdenProduccion→`'op'`, OrdenFabricacion→`'of'`, Despacho→`'despacho'`, RequerimientoCompra→`'req'`.

- [ ] **Step 4: Correr la suite completa del backend**

Run: `npm test --workspace backend`
Expected: PASS (todas las suites).

- [ ] **Step 5: Commit**

```bash
git add backend/src
git commit -m "fix(back): consecutivos via secuencia PG en OC/OP/OF/Despacho/Requerimiento (fin de la carrera MAX+1)"
```

---

### Task 4: Lock de inventario en amarre + guard de despacho

Dos OPs amarrando el mismo producto/talla leen el mismo disponible y sobre-reservan. Fix: `SELECT ... FOR UPDATE` sobre las filas de `InventarioPT` dentro de la transacción, antes de leer el stock. En despacho, guard para que el decremento nunca deje cantidades negativas.

**Files:**
- Modify: `backend/src/pedidos/op/op.service.ts` (método `generarDesdeOC`, dentro del loop de tallas, antes del `tx.inventarioPT.findMany` de la línea ~43)
- Modify: `backend/src/despachos/despacho.service.ts:78-87`
- Test: `backend/src/pedidos/op/op.service.spec.ts`, `backend/src/despachos/despacho.service.spec.ts`

- [ ] **Step 1: Test del lock en op.service.spec.ts (agregar al describe existente de generarDesdeOC; agregar `$queryRaw: jest.fn().mockResolvedValue([])` al mock de `tx`)**

```typescript
it('bloquea las filas de InventarioPT (FOR UPDATE) antes de leer disponibilidad', async () => {
  // usar el mismo arrange del test feliz existente de generarDesdeOC
  await service.generarDesdeOC(1);
  expect(tx.$queryRaw).toHaveBeenCalled();
  const sql = (tx.$queryRaw as jest.Mock).mock.calls[0][0].join('?');
  expect(sql).toContain('FOR UPDATE');
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm test --workspace backend -- op.service.spec`
Expected: FAIL — `$queryRaw` no fue llamado.

- [ ] **Step 3: Implementar el lock en `generarDesdeOC` (dentro del `for (const t of linea.tallas)`, ANTES del `findMany` de stock)**

```typescript
// Lock pesimista: serializa amarres concurrentes del mismo producto/talla
// para que dos OPs no reserven el mismo stock a la vez.
await tx.$queryRaw`SELECT id FROM "InventarioPT" WHERE "productoConfiguradoId" = ${linea.productoConfiguradoId} AND "tallaId" = ${t.tallaId} FOR UPDATE`;
```

- [ ] **Step 4: Test del guard de despacho en despacho.service.spec.ts (cambiar mock `inventarioPT.update` → `updateMany` que devuelve `{ count: 1 }`)**

```typescript
it('falla con 409 si el inventario ya no alcanza al momento de despachar', async () => {
  tx.inventarioPT.updateMany.mockResolvedValue({ count: 0 });
  // usar el mismo arrange del test feliz existente de despachar
  await expect(service.despachar(dto, user)).rejects.toBeInstanceOf(ConflictException);
});
```

- [ ] **Step 5: Implementar el guard en `despacho.service.ts` (reemplaza el `tx.inventarioPT.update` del loop de reservas)**

```typescript
const res = await tx.inventarioPT.updateMany({
  where: {
    id: r.inventarioPTId,
    cantDisponible: { gte: r.cantidad },
    cantReservada: { gte: r.cantidad },
  },
  data: {
    cantDisponible: { decrement: r.cantidad },
    cantReservada: { decrement: r.cantidad },
  },
});
if (res.count === 0)
  throw new ConflictException(
    'Inventario insuficiente al despachar — reintentá o revisá reservas',
  );
```

- [ ] **Step 6: Correr la suite del backend**

Run: `npm test --workspace backend`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src
git commit -m "fix(back): lock FOR UPDATE en amarre + guard anti-negativos en despacho"
```

---

### Task 5: Anular OP cancela sus OFs y pares en proceso

Hoy `anular()` libera reservas pero deja OFs y pares vivos: los operarios seguirían fabricando una OP muerta.

**Files:**
- Modify: `backend/prisma/schema.prisma` (enum `EstadoPar`: agregar `CANCELADO`)
- Create: `backend/prisma/migrations/20260609000001_estado_par_cancelado/migration.sql`
- Modify: `backend/src/pedidos/op/op.service.ts` (método `anular`)
- Modify: `backend/src/fabricacion/fabricacion.service.ts:52-53` (rechazar pares no EN_PROCESO)
- Test: `op.service.spec.ts`, `fabricacion.service.spec.ts`

- [ ] **Step 1: Schema + migración**

En `schema.prisma`:
```prisma
enum EstadoPar {
  EN_PROCESO
  TERMINADO
  CANCELADO
}
```

```sql
-- backend/prisma/migrations/20260609000001_estado_par_cancelado/migration.sql
ALTER TYPE "EstadoPar" ADD VALUE IF NOT EXISTS 'CANCELADO';
```

Run desde `backend/`: `npx prisma migrate dev` → aplica y regenera el client.

- [ ] **Step 2: Tests que fallan**

En `op.service.spec.ts` (agregar `par: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) }` y `ordenFabricacion: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) }` al mock de `tx` del describe de `anular`):

```typescript
it('al anular cancela los pares en proceso y anula las OFs de la OP', async () => {
  // usar el mismo arrange del test feliz existente de anular()
  await service.anular(5);
  expect(tx.par.updateMany).toHaveBeenCalledWith({
    where: { of: { opId: 5 }, estado: 'EN_PROCESO' },
    data: { estado: 'CANCELADO' },
  });
  expect(tx.ordenFabricacion.updateMany).toHaveBeenCalledWith({
    where: { opId: 5, estado: { in: ['ABIERTA', 'EN_PROCESO'] } },
    data: { estado: 'ANULADA' },
  });
});
```

En `fabricacion.service.spec.ts`:

```typescript
it('409 si el par está cancelado', async () => {
  const { prisma } = makePrisma();
  prisma.par.findUnique.mockResolvedValue({
    id: 1, codigo: 'OF5-0001', estado: 'CANCELADO', celulaActual: 'CORTE', of: { estado: 'EN_PROCESO' },
  });
  await expect(
    new FabricacionService(prisma).avanzar('OF5-0001', { operarioId: 1, maquinaId: 1 }),
  ).rejects.toBeInstanceOf(ConflictException);
});
```

Run: `npm test --workspace backend -- "op.service.spec|fabricacion.service.spec"` → Expected: FAIL.

- [ ] **Step 3: Implementar**

En `op.service.ts` `anular()`, dentro de la transacción, después de liberar reservas y antes del update de la OP:

```typescript
// Una OP anulada no puede seguir fabricándose: se cancelan pares y OFs vivas.
await tx.par.updateMany({
  where: { of: { opId }, estado: 'EN_PROCESO' },
  data: { estado: 'CANCELADO' },
});
await tx.ordenFabricacion.updateMany({
  where: { opId, estado: { in: ['ABIERTA', 'EN_PROCESO'] } },
  data: { estado: 'ANULADA' },
});
```

En `fabricacion.service.ts` `avanzar()`, reemplazar el check de TERMINADO:

```typescript
if (par.estado !== 'EN_PROCESO')
  throw new ConflictException(
    par.estado === 'TERMINADO'
      ? 'El par ya está terminado'
      : 'El par está cancelado (OP anulada)',
  );
```

- [ ] **Step 4: Suite completa**

Run: `npm test --workspace backend`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma backend/src
git commit -m "feat(back): anular OP cancela pares en proceso y anula sus OFs"
```

---

### Task 6: Validación de entrada (query params, FK de escaneo, longitudes) + cap del tablero

**Files:**
- Modify: `backend/src/fabricacion/fabricacion.controller.ts:45-58`
- Modify: `backend/src/fabricacion/fabricacion.service.ts` (`tablero`, `listarOperarios`, `listarMaquinas`, `avanzar`)
- Modify: `backend/src/clientes/dto/crear-cliente.dto.ts`
- Modify: `backend/src/auth/dto/login.dto.ts`
- Test: `backend/src/fabricacion/fabricacion.service.spec.ts`

- [ ] **Step 1: Tests que fallan (fabricacion.service.spec.ts)**

```typescript
it('tablero limita la consulta a 500 pares', async () => {
  const { prisma } = makePrisma({ root: { par: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) } } });
  await new FabricacionService(prisma).tablero();
  expect(prisma.par.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ take: 500 }),
  );
});

it('400 si el operario o la máquina no existen (P2003)', async () => {
  const { prisma, tx } = makePrisma();
  prisma.par.findUnique.mockResolvedValue({
    id: 1, codigo: 'OF5-0001', estado: 'EN_PROCESO', celulaActual: 'CORTE', of: { estado: 'EN_PROCESO' },
  });
  tx.eventoTrazabilidad.create.mockRejectedValue(
    Object.assign(new Error('FK'), { code: 'P2003' }),
  );
  await expect(
    new FabricacionService(prisma).avanzar('OF5-0001', { operarioId: 999, maquinaId: 999 }),
  ).rejects.toBeInstanceOf(BadRequestException);
});
```

Run: `npm test --workspace backend -- fabricacion.service.spec` → Expected: FAIL.

- [ ] **Step 2: Implementar en `fabricacion.service.ts`**

`tablero`: agregar `take: 500` al findMany con comentario `// Cap defensivo: el tablero opera por OF; sin filtro, 500 pares es más que una corrida.`

`avanzar`: envolver la transacción para mapear FK inválida a 400:

```typescript
try {
  return await this.prisma.$transaction(async (tx) => {
    // ... cuerpo actual sin cambios ...
  });
} catch (e: unknown) {
  if ((e as { code?: string })?.code === 'P2003')
    throw new BadRequestException('Operario o máquina inexistente');
  throw e;
}
```

`listarOperarios`/`listarMaquinas`: tipar `celula?: Celula` (import `Celula` de `@prisma/client`) y quitar el `as any`.

- [ ] **Step 3: Endurecer el controller (`fabricacion.controller.ts`)**

```typescript
import { ParseEnumPipe } from '@nestjs/common'; // agregar al import existente
import { Celula } from '@prisma/client';

@Get('tablero')
tablero(@Query('ofId', new ParseIntPipe({ optional: true })) ofId?: number) {
  return this.service.tablero(ofId);
}

@Get('operarios')
operarios(@Query('celula', new ParseEnumPipe(Celula, { optional: true })) celula?: Celula) {
  return this.service.listarOperarios(celula);
}

@Get('maquinas')
maquinas(@Query('celula', new ParseEnumPipe(Celula, { optional: true })) celula?: Celula) {
  return this.service.listarMaquinas(celula);
}
```

- [ ] **Step 4: Longitudes en DTOs**

`crear-cliente.dto.ts`:
```typescript
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
// ...
@IsString() @MaxLength(20) nit!: string;
@IsString() @MaxLength(160) nombre!: string;
@IsOptional() @IsString() @MaxLength(80) ciudad?: string;
```

`login.dto.ts`: agregar `@MaxLength(60)` a `username` y `@MaxLength(72)` a `password` (límite útil de bcrypt/argon2), importando `MaxLength`.

- [ ] **Step 5: Suite + build**

Run: `npm test --workspace backend` y `npm run build --workspace backend`
Expected: PASS ambos.

- [ ] **Step 6: Commit**

```bash
git add backend/src
git commit -m "fix(back): validacion de query params y DTOs, cap del tablero, P2003 a 400 en escaneo"
```

---

### Task 7: Front — usuario real en el shell (adiós "Carolina M.")

**Files:**
- Modify: `frontend/src/app/core/auth/auth.service.ts`
- Modify: `frontend/src/app/layout/shell/shell.component.ts:62-64,82-89`
- Test: `frontend/src/app/core/auth/auth.service.spec.ts` (agregar caso), Create: `frontend/src/app/layout/shell/shell.component.spec.ts`

- [ ] **Step 1: Test de `usuario()` en auth.service.spec.ts (agregar al describe existente, siguiendo su patrón de setup)**

```typescript
it('usuario() decodifica username y role del JWT', () => {
  const payload = btoa(JSON.stringify({ sub: 1, username: 'gerente', role: 'GERENTE' }));
  localStorage.setItem('accessToken', `x.${payload}.y`);
  expect(service.usuario()).toEqual({ username: 'gerente', role: 'GERENTE' });
});

it('usuario() devuelve null sin token o con token corrupto', () => {
  localStorage.removeItem('accessToken');
  expect(service.usuario()).toBeNull();
  localStorage.setItem('accessToken', 'basura');
  expect(service.usuario()).toBeNull();
});
```

- [ ] **Step 2: Implementar `usuario()` en AuthService (debajo de `rol()`)**

```typescript
usuario(): { username: string; role: string } | null {
  const t = this.accessToken;
  if (!t) return null;
  try {
    const p = JSON.parse(atob(t.split('.')[1]));
    return { username: p.username ?? '', role: p.role ?? '' };
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Spec del shell (nuevo archivo `shell.component.spec.ts`)**

```typescript
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ShellComponent } from './shell.component';

describe('ShellComponent', () => {
  it('muestra el usuario logueado del JWT, no un nombre fijo', () => {
    const payload = btoa(JSON.stringify({ sub: 1, username: 'gerente', role: 'GERENTE' }));
    localStorage.setItem('accessToken', `x.${payload}.y`);
    TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('gerente');
    expect(text).toContain('Gerencia');
    expect(text).not.toContain('Carolina');
    localStorage.removeItem('accessToken');
  });
});
```

Run: `npm test --workspace frontend -- --watch=false --browsers=ChromeHeadless` → Expected: FAIL (shell muestra "Carolina M.").

- [ ] **Step 4: Implementar en ShellComponent**

Reemplazar el bloque `.user-card` del template:

```html
<div class="user-card">
  <span class="avatar">{{ iniciales }}</span>
  <span class="user-meta"><b>{{ usuario?.username ?? '—' }}</b><small>{{ rolLabel }}</small></span>
  <button class="icon-btn" type="button" title="Salir" (click)="logout()">
    <!-- svg existente sin cambios -->
  </button>
</div>
```

Y en la clase:

```typescript
export class ShellComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly usuario = this.auth.usuario();
  readonly iniciales = (this.usuario?.username ?? '?').slice(0, 2).toUpperCase();
  readonly rolLabel =
    ({ ADMIN: 'Administración', GERENTE: 'Gerencia', VENTAS: 'Ventas' } as Record<string, string>)[
      this.usuario?.role ?? ''
    ] ?? (this.usuario?.role ?? '');

  logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
```

- [ ] **Step 5: Correr suite front**

Run: `npm test --workspace frontend -- --watch=false --browsers=ChromeHeadless`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "fix(front): shell muestra el usuario real del JWT (fuera Carolina M. hardcodeada)"
```

---

### Task 8: Front — pantalla de operario robusta (foco, red, combos vacíos)

Pantalla crítica de planta: scanner físico + guantes + WiFi industrial intermitente.

**Files:**
- Modify: `frontend/src/app/features/fabricacion/pantalla-operario.component.ts`
- Test: Create `frontend/src/app/features/fabricacion/pantalla-operario.component.spec.ts`

- [ ] **Step 1: Spec nueva (patrón HttpTestingController del repo; base URL `http://localhost:3001`)**

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PantallaOperarioComponent } from './pantalla-operario.component';

const BASE = 'http://localhost:3001/fabricacion';

function setup() {
  TestBed.configureTestingModule({
    imports: [PantallaOperarioComponent],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(PantallaOperarioComponent);
  const http = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  http.expectOne(`${BASE}/operarios?celula=CORTE`).flush([{ id: 1, nombre: 'Pedro', celula: 'CORTE', activo: true }]);
  http.expectOne(`${BASE}/maquinas?celula=CORTE`).flush([{ id: 2, codigo: 'M1', nombre: 'Cortadora', celula: 'CORTE', activo: true }]);
  fixture.detectChanges();
  return { fixture, http };
}

describe('PantallaOperarioComponent', () => {
  it('busca un par y permite avanzarlo', () => {
    const { fixture, http } = setup();
    const comp = fixture.componentInstance;
    comp.codigo = 'OF5-0001';
    comp.buscar();
    http.expectOne(`${BASE}/par/OF5-0001`).flush({
      id: 9, codigo: 'OF5-0001', estado: 'EN_PROCESO', celulaActual: 'CORTE',
      of: { consecutivo: 5 }, talla: { valor: 38 }, eventos: [],
    });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('OF5-0001');

    comp.avanzar(comp.par()!);
    http.expectOne(`${BASE}/par/OF5-0001/avanzar`).flush({});
    fixture.detectChanges();
    expect(comp.msg()).toContain('avanzado');
    expect(comp.codigo).toBe('');
    http.verify();
  });

  it('ante corte de red muestra mensaje de conexión y conserva el código para reintentar', () => {
    const { fixture, http } = setup();
    const comp = fixture.componentInstance;
    comp.codigo = 'OF5-0001';
    comp.buscar();
    http.expectOne(`${BASE}/par/OF5-0001`).error(new ProgressEvent('error'), { status: 0 });
    expect(comp.esError()).toBeTrue();
    expect(comp.msg()).toContain('conexión');
    expect(comp.codigo).toBe('OF5-0001');
    http.verify();
  });

  it('si la API de catálogos falla, limpia operario/máquina y avisa', () => {
    TestBed.configureTestingModule({
      imports: [PantallaOperarioComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(PantallaOperarioComponent);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne(`${BASE}/operarios?celula=CORTE`).error(new ProgressEvent('error'), { status: 0 });
    http.expectOne(`${BASE}/maquinas?celula=CORTE`).error(new ProgressEvent('error'), { status: 0 });
    const comp = fixture.componentInstance;
    expect(comp.operarioId).toBeUndefined();
    expect(comp.maquinaId).toBeUndefined();
    expect(comp.esError()).toBeTrue();
    http.verify();
  });
});
```

Run: `npm test --workspace frontend -- --watch=false --browsers=ChromeHeadless` → Expected: FAIL (mensajes y handlers no existen).

- [ ] **Step 2: Implementar robustez en el componente**

Cambios sobre `pantalla-operario.component.ts`:

1. Implementar `AfterViewInit` y helper de foco (reemplaza el `setTimeout(0)`):

```typescript
ngAfterViewInit(): void {
  this.enfocarScan();
}

/** El scanner físico escribe donde esté el foco: recuperarlo SIEMPRE tras cada acción. */
private enfocarScan(): void {
  requestAnimationFrame(() => this.scanInput?.nativeElement.focus());
}

private msgError(e: { status?: number }, porDefecto: string): string {
  return e?.status === 0
    ? 'Sin conexión con el servidor. Verificá la red y volvé a intentar.'
    : porDefecto;
}
```

(Agregar `AfterViewInit` al import de `@angular/core` y al `implements`.)

2. `onCelula()` con manejo de error en ambos subscribes:

```typescript
onCelula(): void {
  this.api.operarios(this.celula).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
    next: (o) => { this.operarios.set(o); this.operarioId = o[0]?.id; },
    error: () => {
      this.operarios.set([]); this.operarioId = undefined;
      this.esError.set(true); this.msg.set('No se pudieron cargar los operarios de la célula.');
    },
  });
  this.api.maquinas(this.celula).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
    next: (m) => { this.maquinas.set(m); this.maquinaId = m[0]?.id; },
    error: () => {
      this.maquinas.set([]); this.maquinaId = undefined;
      this.esError.set(true); this.msg.set('No se pudieron cargar las máquinas de la célula.');
    },
  });
}
```

3. `buscar()` — error de red distinto de 404, y SIEMPRE re-enfocar:

```typescript
buscar(): void {
  const c = this.codigo.trim();
  if (!c) return;
  this.par.set(null);
  this.msg.set(null);
  this.api.par(c).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
    next: (p) => { this.esError.set(false); this.par.set(p); this.enfocarScan(); },
    error: (e) => {
      this.esError.set(true);
      this.msg.set(this.msgError(e, `Par ${c} no encontrado`));
      this.enfocarScan(); // el código queda en el input para reintentar con Enter
    },
  });
}
```

4. `avanzar()` — reemplazar el `setTimeout` por `enfocarScan()` y mensaje de red:

```typescript
next: () => {
  this.esError.set(false);
  this.msg.set(`Par ${p.codigo} avanzado ✓`);
  this.par.set(null);
  this.codigo = '';
  this.enfocarScan();
},
error: (e) => {
  this.esError.set(true);
  this.msg.set(this.msgError(e, e?.error?.message ?? 'No se pudo avanzar el par'));
  this.enfocarScan();
},
```

5. Accesibilidad/targets táctiles en styles: agregar `.scan-input{min-height:48px}` y `.btn-primary{min-height:48px}` al bloque de estilos del componente (operarios con guantes).

- [ ] **Step 3: Correr suite front**

Run: `npm test --workspace frontend -- --watch=false --browsers=ChromeHeadless`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/fabricacion
git commit -m "fix(front): pantalla operario robusta (foco garantizado, errores de red, combos vacios, targets 48px)"
```

---

### Task 9: Front — specs de los componentes MES restantes + badge de estado en OF

**Files:**
- Create: `frontend/src/app/features/fabricacion/tablero.component.spec.ts`
- Create: `frontend/src/app/features/fabricacion/of-list.component.spec.ts`
- Create: `frontend/src/app/features/fabricacion/par-detalle.component.spec.ts`
- Modify: `frontend/src/app/features/fabricacion/of-list.component.ts:27` (badge con estilo por estado)

- [ ] **Step 1: Spec del tablero**

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { FabricacionTableroComponent } from './tablero.component';

describe('FabricacionTableroComponent', () => {
  it('agrupa pares por célula y separa terminados', () => {
    TestBed.configureTestingModule({
      imports: [FabricacionTableroComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(FabricacionTableroComponent);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('http://localhost:3001/fabricacion/tablero').flush([
      { id: 1, codigo: 'OF5-0001', celulaActual: 'CORTE', estado: 'EN_PROCESO', talla: { valor: 38 }, of: { consecutivo: 5 } },
      { id: 2, codigo: 'OF5-0002', celulaActual: 'GUARNICION', estado: 'EN_PROCESO', talla: { valor: 39 }, of: { consecutivo: 5 } },
      { id: 3, codigo: 'OF5-0003', celulaActual: 'PT', estado: 'TERMINADO', talla: { valor: 40 }, of: { consecutivo: 5 } },
    ]);
    fixture.detectChanges();
    const comp = fixture.componentInstance;
    expect(comp.porCelula()['CORTE'].length).toBe(1);
    expect(comp.porCelula()['GUARNICION'].length).toBe(1);
    expect(comp.terminados().length).toBe(1);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('OF5-0001');
    expect(text).toContain('Terminados');
    http.verify();
  });

  it('muestra error si el tablero no carga', () => {
    TestBed.configureTestingModule({
      imports: [FabricacionTableroComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(FabricacionTableroComponent);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('http://localhost:3001/fabricacion/tablero').error(new ProgressEvent('error'));
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No se pudo cargar el tablero');
    http.verify();
  });
});
```

- [ ] **Step 2: Spec de of-list (incluye la aserción del badge con estilo — fallará hasta el Step 4)**

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { OfListComponent } from './of-list.component';

describe('OfListComponent', () => {
  it('lista las OF con su OP, conteo de pares y badge de estado', () => {
    TestBed.configureTestingModule({
      imports: [OfListComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(OfListComponent);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('http://localhost:3001/fabricacion/of').flush([
      { id: 1, consecutivo: 5, estado: 'TERMINADA', fecha: '2026-06-07', op: { consecutivo: 9005 }, _count: { pares: 12 } },
    ]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('OF-5');
    expect(el.textContent).toContain('OP-9005');
    expect(el.textContent).toContain('12');
    expect(el.querySelector('.badge-accent')).toBeTruthy(); // TERMINADA resalta
    http.verify();
  });
});
```

- [ ] **Step 3: Spec de par-detalle**

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { ParDetalleComponent } from './par-detalle.component';

describe('ParDetalleComponent', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [ParDetalleComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ codigo: 'OF5-0001' }) } } },
      ],
    });
    const fixture = TestBed.createComponent(ParDetalleComponent);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    return { fixture, http };
  }

  it('muestra el QR del par y su recorrido de trazabilidad', () => {
    const { fixture, http } = setup();
    http.expectOne('http://localhost:3001/fabricacion/par/OF5-0001').flush({
      id: 9, codigo: 'OF5-0001', estado: 'EN_PROCESO', celulaActual: 'GUARNICION',
      of: { consecutivo: 5 }, talla: { valor: 38 },
      eventos: [
        { id: 1, celula: 'CORTE', timestamp: '2026-06-07T10:00:00Z', operario: { nombre: 'Pedro' }, maquina: { nombre: 'Cortadora 1' } },
      ],
    });
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('OF5-0001');
    expect(text).toContain('Pedro');
    expect(text).toContain('Cortadora 1');
    http.verify();
  });

  it('muestra error si el par no existe', () => {
    const { fixture, http } = setup();
    http.expectOne('http://localhost:3001/fabricacion/par/OF5-0001').error(new ProgressEvent('error'), { status: 404 });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Par no encontrado');
    http.verify();
  });
});
```

Run: `npm test --workspace frontend -- --watch=false --browsers=ChromeHeadless`
Expected: FAIL solo la aserción `.badge-accent` de of-list; el resto PASS (si falla otra cosa, ajustar el componente, no bajar la aserción).

- [ ] **Step 4: Badge con estilo en of-list.component.ts (línea 27)**

```html
<td><span class="badge" [class.badge-accent]="o.estado === 'TERMINADA'">{{ o.estado }}</span></td>
```

- [ ] **Step 5: Suite completa front**

Run: `npm test --workspace frontend -- --watch=false --browsers=ChromeHeadless`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/fabricacion
git commit -m "test(front): specs de tablero, of-list y par-detalle + badge de estado en OF"
```

---

### Task 10: CI con GitHub Actions

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Crear el workflow**

```yaml
name: CI

on:
  push:
    branches: [master, develop]
  pull_request:

jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx prisma generate
        working-directory: backend
      - run: npm run build --workspace backend
      - run: npm test --workspace backend

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build --workspace frontend
      - run: npm test --workspace frontend -- --watch=false --browsers=ChromeHeadless
```

Nota: `npm ci` en la raíz instala ambos workspaces. Si `npm ci` falla en Linux por el lockfile generado en Windows (binarios opcionales `@unrs/resolver-binding-win32-x64-msvc` en `dependencies` de la raíz), mover esa dependencia a `optionalDependencies` en el `package.json` raíz y regenerar el lock con `npm install`.

- [ ] **Step 2: Validar sintaxis YAML localmente**

Run: `node -e "console.log('yaml ok')"` y revisar indentación a ojo (no hay runner local). El humo real es el push final de la Task 12.

- [ ] **Step 3: Commit**

```bash
git add .github
git commit -m "ci: GitHub Actions con build+tests de backend y frontend"
```

---

### Task 11: README útil + scripts de raíz + CLAUDE.md del repo

**Files:**
- Modify: `README.md` (raíz del repo — ojo: el actual tiene mojibake UTF-8, reescribirlo entero)
- Modify: `package.json` (raíz, bloque `scripts`)
- Create: `CLAUDE.md` (raíz del repo)

- [ ] **Step 1: Scripts de raíz en `package.json`**

```json
"scripts": {
  "dev:back": "npm run start:dev --workspace backend",
  "dev:front": "npm run start --workspace frontend",
  "build": "npm run build --workspace backend && npm run build --workspace frontend",
  "test": "npm run test:back && npm run test:front",
  "test:back": "npm test --workspace backend",
  "test:front": "npm test --workspace frontend -- --watch=false --browsers=ChromeHeadless",
  "seed": "npm run seed --workspace backend",
  "migrate": "npm run prisma:migrate --workspace backend"
}
```

Antes de agregar `seed`/`migrate`, verificar en `backend/package.json` los nombres reales de esos scripts y ajustar (si no existe `prisma:migrate`, usar `"migrate": "npx prisma migrate dev --schema backend/prisma/schema.prisma"` o el equivalente que funcione desde la raíz; probarlo).

- [ ] **Step 2: Reescribir `README.md` (UTF-8 sin BOM, con la herramienta Write, no con Out-File)**

```markdown
# agro-erp

ERP + MES para Botas Agroindustrial S.A.S (Ibagué). Monorepo npm workspaces:
`backend/` (NestJS + Prisma + PostgreSQL) y `frontend/` (Angular 19).

## Setup local (primera vez)

1. **Base de datos** — Postgres en Docker, puerto **5433**:
   `docker run -d --name agro-erp-pg -p 5433:5432 -e POSTGRES_PASSWORD=postgres postgres:16`
   (si ya existe: `docker start agro-erp-pg`)
2. **Dependencias**: `npm install` en la raíz (instala ambos workspaces).
3. **Variables**: copiar `backend/.env.example` → `backend/.env` (la `DATABASE_URL` local apunta a `localhost:5433`).
4. **Migraciones + seed**: desde `backend/`: `npx prisma migrate dev` y `npm run seed`.

## Día a día

| Comando (raíz)        | Qué hace                                  |
|-----------------------|-------------------------------------------|
| `npm run dev:back`    | Backend NestJS en **:3001**                |
| `npm run dev:front`   | Frontend Angular en **:4200**              |
| `npm test`            | Suite completa (back Jest + front Karma)   |
| `npm run build`       | Compila ambos                              |

Usuarios seed: `admin/admin123`, `gerente/gerente123`.

## Workflow de ramas

- `develop`: construcción adelantada (varias demos pueden convivir).
- `master`: lo ya mostrado al cliente. Se avanza por demo con merge `--no-ff` + tag `demo-N`.

## Deploy

- **Frontend**: Vercel (config en `frontend/vercel.json`).
- **Backend**: Railway (config en `railway.json`; `.railwayignore` excluye el lockfile por binarios win32 — no tocar sin leer el comentario).
- Receta completa del deploy mensual: `docs/` y memoria del proyecto.

## Gotchas

- El backend NO emite `dist/` si queda un `.tsbuildinfo` viejo: borrar `backend/dist` y `backend/tsconfig.build.tsbuildinfo` y rebuild.
- El puerto 3000 lo usa otro proyecto: este backend SIEMPRE en 3001.
```

- [ ] **Step 3: Crear `CLAUDE.md` del repo (raíz)**

```markdown
# CLAUDE.md — agro-erp

ERP + MES para fábrica de botas de seguridad (make-to-order). Monorepo npm workspaces.

## Comandos

- Backend dev: `npm run dev:back` (NestJS en :3001 — NUNCA :3000, lo usa otro proyecto)
- Frontend dev: `npm run dev:front` (Angular en :4200)
- Tests: `npm test` (raíz) · solo back: `npm run test:back` · solo front: `npm run test:front`
- DB local: Docker `agro-erp-pg` en :5433 (`docker start agro-erp-pg`); el `.env` del backend apunta a local, NO a Railway.
- Migraciones: desde `backend/`, `npx prisma migrate dev`. SIEMPRE migraciones, nunca `db push`.

## Arquitectura

- `backend/src/<modulo>`: controller delgado + service con Prisma + lógica pura en archivos `*-core.ts` / utilidades testeables sin BD.
- Consecutivos (OC/OP/OF/Despacho/Requerimiento): SIEMPRE vía `siguienteConsecutivo()` de `backend/src/prisma/consecutivo.ts` (secuencias PG). PROHIBIDO el patrón `aggregate _max + 1`.
- Amarre de inventario: las lecturas de `InventarioPT` para reservar van precedidas de `SELECT ... FOR UPDATE` dentro de la transacción.
- Frontend: Angular 19 standalone + signals + control flow nuevo (`@if/@for`), plain CSS con design tokens (tema "Acero"), specs con `HttpTestingController` contra `http://localhost:3001`.

## Dominio (lo mínimo)

OC (pedido del cliente) → OP (producción, amarra stock PT) → OF (corrida de fabricación) → pares con código `OF{n}-{seq}` escaneados por célula (CORTE→GUARNICION→ALMACEN→INYECCION→PT) → InventarioPT → Despacho (regla de cartera: cliente vencido bloquea, autoriza solo GERENTE/ADMIN).

## Workflow

- `develop` = construcción adelantada; `master` = lo mostrado al cliente (merge `--no-ff` + tag `demo-N`).
- TDD: test primero, implementación mínima, commit frecuente. Mensajes de commit y comentarios en español.
- Specs/planes históricos en `docs/superpowers/`.
```

- [ ] **Step 4: Probar los scripts**

Run: `npm test` (desde la raíz)
Expected: corre back y front, ambos PASS. Si `seed`/`migrate` no funcionan desde la raíz, ajustarlos hasta que funcionen o quitarlos del bloque (no dejar scripts rotos).

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md package.json
git commit -m "docs: README de setup completo, CLAUDE.md del repo y scripts npm de raiz"
```

---

### Task 12: Verificación final, merge a develop y push

- [ ] **Step 1: Suites completas en limpio**

Run: `npm run build` y `npm test` desde la raíz.
Expected: build OK, todas las suites PASS (back ≥107, front ≥94 + las nuevas).

- [ ] **Step 2: Humo manual mínimo del backend (con Docker arriba)**

Run: `npm run dev:back` en background, esperar "Nest application successfully started", luego:
```powershell
# login y tablero con el cap
$tok = (Invoke-RestMethod -Method Post -Uri http://localhost:3001/auth/login -Body (@{username='gerente';password='gerente123'} | ConvertTo-Json) -ContentType 'application/json').accessToken
Invoke-RestMethod -Uri 'http://localhost:3001/fabricacion/tablero?ofId=abc' -Headers @{Authorization="Bearer $tok"}
```
Expected: el request con `ofId=abc` devuelve **400** (ParseIntPipe), no 200 con todo el tablero. Matar el proceso al terminar.

- [ ] **Step 3: Merge no-ff a develop y push**

```bash
git checkout develop
git merge --no-ff feat/hardening-revision -m "merge: hardening post-revision integral (consecutivos atomicos, locks, anular OP completo, operario robusto, CI, docs)"
git branch -d feat/hardening-revision
git push origin develop
```

- [ ] **Step 4: Verificar que el workflow de CI corrió en GitHub**

Run: `gh run list --repo Gonza10Co/agro-erp --limit 3`
Expected: run de "CI" en estado completed/success (o en progreso — esperar y re-chequear una vez).
