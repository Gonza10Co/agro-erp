# MES — Núcleo de Trazabilidad (Demo 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Desde una OP con producción pendiente, generar una Orden de Fabricación que materializa cada par como entidad con código único/QR; el par avanza por las 5 células vía escaneo (registrando evento de trazabilidad), se ve en un tablero kanban en vivo, y al salir de PT suma a `InventarioPT`.

**Architecture:** Patrón idéntico a Demos 2-4: lógica **pura** testeable (`fabricacion-core.ts`) + `FabricacionService` (Prisma + `$transaction`) + controller bajo `JwtAuthGuard` + módulo registrado en `AppModule`. Frontend Angular 19 standalone (signals) con feature `fabricacion`: tablero kanban, pantalla de operario y detalle de par con QR. Una sola migración Prisma.

**Tech Stack:** NestJS + Prisma + PostgreSQL (Docker `agro-erp-pg`, :5433) en backend (:3001); Angular 19 + Plain CSS (tokens "Acero") en frontend (:4200); Jest (back), Karma/Jasmine (front); `angularx-qrcode` para el QR.

**Referencia:** spec `docs/superpowers/specs/2026-06-07-mes-trazabilidad-nucleo-design.md`.

---

## Estructura de archivos

```
backend/
  prisma/schema.prisma                         (MODIFICAR: +5 modelos, +3 enums, +3 inversas)
  prisma/seed-demo.ts                          (MODIFICAR: operarios, máquinas, OP-9005 driver, limpieza)
  src/fabricacion/
    fabricacion-core.ts                        (CREAR: lógica pura — células + generarPares)
    fabricacion-core.spec.ts                   (CREAR: tests puros)
    dto/avanzar.dto.ts                         (CREAR)
    fabricacion.service.ts                     (CREAR)
    fabricacion.service.spec.ts                (CREAR)
    fabricacion.controller.ts                  (CREAR)
    fabricacion.module.ts                      (CREAR)
  src/app.module.ts                            (MODIFICAR: registrar FabricacionModule)

frontend/src/app/
  core/api/models/fabricacion.models.ts        (CREAR)
  core/api/fabricacion.api.ts                  (CREAR)
  features/fabricacion/
    tablero.component.ts                        (CREAR: kanban en vivo)
    pantalla-operario.component.ts             (CREAR: escaneo + avanzar)
    par-detalle.component.ts                    (CREAR: timeline + QR)
    of-list.component.ts                        (CREAR: lista de OF)
  features/pedidos/op/op-detalle.component.ts  (MODIFICAR: botón Generar/Ver OF)
  app.routes.ts                                (MODIFICAR: rutas fabricacion)
  layout/shell/shell.component.ts              (MODIFICAR: nav "Fabricación")
```

---

## Task 0: Crear branch de implementación

- [ ] **Step 1: Crear y posicionarse en la branch desde `develop`**

Run:
```bash
cd "/c/Users/gonza/Documents/Freelance/Botas Agroindustriales/agro-erp"
git checkout develop && git pull --ff-only 2>/dev/null; git checkout -b feat/mes-trazabilidad
```
Expected: `Switched to a new branch 'feat/mes-trazabilidad'`

- [ ] **Step 2: Verificar que Docker DB está arriba**

Run: `docker ps --filter name=agro-erp-pg --format "{{.Names}} {{.Status}}"`
Expected: una línea con `agro-erp-pg ... Up ...`. Si no aparece, arrancarlo (ver `botas-dev-local`) antes de seguir.

---

## Task 1: Schema Prisma + migración

**Files:**
- Modify: `backend/prisma/schema.prisma` (agregar al final, sección MES)

- [ ] **Step 1: Agregar enums y modelos del MES al final del schema**

Agregar al final de `backend/prisma/schema.prisma`:

```prisma
// ───────────────────────── Módulo 5: MES / Fabricación ─────────────────────────

enum Celula {
  CORTE
  GUARNICION
  ALMACEN
  INYECCION
  PT
}

enum EstadoOF {
  ABIERTA
  EN_PROCESO
  TERMINADA
  ANULADA
}

enum EstadoPar {
  EN_PROCESO
  TERMINADO
}

model OrdenFabricacion {
  id          Int             @id @default(autoincrement())
  consecutivo Int             @unique
  opId        Int
  op          OrdenProduccion @relation(fields: [opId], references: [id])
  fecha       DateTime        @default(now())
  estado      EstadoOF        @default(ABIERTA)
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  pares Par[]

  @@index([opId])
}

model Par {
  id                    Int                 @id @default(autoincrement())
  codigo                String              @unique
  ofId                  Int
  of                    OrdenFabricacion    @relation(fields: [ofId], references: [id])
  productoConfiguradoId Int
  productoConfigurado   ProductoConfigurado @relation(fields: [productoConfiguradoId], references: [id])
  tallaId               Int
  talla                 Talla               @relation(fields: [tallaId], references: [id])
  celulaActual          Celula              @default(CORTE)
  estado                EstadoPar           @default(EN_PROCESO)
  createdAt             DateTime            @default(now())
  updatedAt             DateTime            @updatedAt

  eventos EventoTrazabilidad[]

  @@index([ofId])
  @@index([celulaActual])
}

model EventoTrazabilidad {
  id         Int      @id @default(autoincrement())
  parId      Int
  par        Par      @relation(fields: [parId], references: [id])
  celula     Celula
  operarioId Int
  operario   Operario @relation(fields: [operarioId], references: [id])
  maquinaId  Int
  maquina    Maquina  @relation(fields: [maquinaId], references: [id])
  timestamp  DateTime @default(now())

  @@index([parId])
  @@index([celula])
}

model Operario {
  id     Int     @id @default(autoincrement())
  nombre String
  celula Celula
  activo Boolean @default(true)

  eventos EventoTrazabilidad[]
}

model Maquina {
  id     Int     @id @default(autoincrement())
  codigo String  @unique
  nombre String
  celula Celula
  activo Boolean @default(true)

  eventos EventoTrazabilidad[]
}
```

- [ ] **Step 2: Agregar las relaciones inversas en modelos existentes**

En `model OrdenProduccion` (junto a `requerimientos RequerimientoCompra[]`), agregar:
```prisma
  ordenesFabricacion OrdenFabricacion[]
```
En `model ProductoConfigurado`, agregar:
```prisma
  pares Par[]
```
En `model Talla`, agregar:
```prisma
  pares Par[]
```

- [ ] **Step 3: Crear la migración y regenerar el cliente**

Run:
```bash
cd backend && npx prisma migrate dev --name modulo5_mes_trazabilidad
```
Expected: crea `prisma/migrations/<ts>_modulo5_mes_trazabilidad/` y `✔ Generated Prisma Client`. Sin errores de SQL.

- [ ] **Step 4: Verificar que el cliente tipa los modelos nuevos**

Run: `cd backend && npx tsc --noEmit -p tsconfig.json`
Expected: sin errores (compila; `prisma.par`, `prisma.ordenFabricacion`, etc. existen en el cliente).

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(mes): schema OF/Par/EventoTrazabilidad/Operario/Maquina + migración"
```

---

## Task 2: Lógica pura — células y generación de pares

**Files:**
- Create: `backend/src/fabricacion/fabricacion-core.ts`
- Test: `backend/src/fabricacion/fabricacion-core.spec.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/src/fabricacion/fabricacion-core.spec.ts`:

```typescript
import {
  ORDEN_CELULAS,
  siguienteCelula,
  esUltimaCelula,
  generarPares,
  LineaProduccion,
} from './fabricacion-core';

describe('siguienteCelula', () => {
  it('avanza en orden CORTE→GUARNICION→ALMACEN→INYECCION→PT', () => {
    expect(siguienteCelula('CORTE')).toBe('GUARNICION');
    expect(siguienteCelula('GUARNICION')).toBe('ALMACEN');
    expect(siguienteCelula('ALMACEN')).toBe('INYECCION');
    expect(siguienteCelula('INYECCION')).toBe('PT');
  });

  it('PT no tiene siguiente (null)', () => {
    expect(siguienteCelula('PT')).toBeNull();
  });

  it('expone el orden completo de 5 células', () => {
    expect(ORDEN_CELULAS).toEqual(['CORTE', 'GUARNICION', 'ALMACEN', 'INYECCION', 'PT']);
  });
});

describe('esUltimaCelula', () => {
  it('solo PT es la última', () => {
    expect(esUltimaCelula('PT')).toBe(true);
    expect(esUltimaCelula('CORTE')).toBe(false);
    expect(esUltimaCelula('INYECCION')).toBe(false);
  });
});

describe('generarPares', () => {
  const lineas: LineaProduccion[] = [
    { productoConfiguradoId: 10, tallaId: 1, cantAProducir: 2 },
    { productoConfiguradoId: 10, tallaId: 2, cantAProducir: 1 },
  ];

  it('genera un par por unidad de cantAProducir', () => {
    const pares = generarPares(5, lineas);
    expect(pares).toHaveLength(3);
  });

  it('asigna códigos únicos y bien formados OF{consecutivo}-{seq:0000}', () => {
    const pares = generarPares(5, lineas);
    expect(pares.map((p) => p.codigo)).toEqual([
      'OF5-0001',
      'OF5-0002',
      'OF5-0003',
    ]);
    expect(new Set(pares.map((p) => p.codigo)).size).toBe(3);
  });

  it('mapea producto y talla de cada línea', () => {
    const pares = generarPares(5, lineas);
    expect(pares[0]).toMatchObject({ productoConfiguradoId: 10, tallaId: 1 });
    expect(pares[2]).toMatchObject({ productoConfiguradoId: 10, tallaId: 2 });
  });

  it('ignora líneas con cantAProducir <= 0', () => {
    const pares = generarPares(9, [
      { productoConfiguradoId: 1, tallaId: 1, cantAProducir: 0 },
      { productoConfiguradoId: 1, tallaId: 2, cantAProducir: 2 },
    ]);
    expect(pares).toHaveLength(2);
    expect(pares[0].codigo).toBe('OF9-0001');
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd backend && npx jest src/fabricacion/fabricacion-core.spec.ts`
Expected: FAIL — `Cannot find module './fabricacion-core'`.

- [ ] **Step 3: Implementar la lógica pura**

Crear `backend/src/fabricacion/fabricacion-core.ts`:

```typescript
import { Celula } from '@prisma/client';

/** Orden físico de las células por las que viaja un par. */
export const ORDEN_CELULAS: Celula[] = [
  'CORTE',
  'GUARNICION',
  'ALMACEN',
  'INYECCION',
  'PT',
];

/** Devuelve la célula siguiente, o null si `actual` es la última (PT). */
export function siguienteCelula(actual: Celula): Celula | null {
  const i = ORDEN_CELULAS.indexOf(actual);
  if (i < 0 || i >= ORDEN_CELULAS.length - 1) return null;
  return ORDEN_CELULAS[i + 1];
}

/** True si la célula es la última del flujo (PT). */
export function esUltimaCelula(c: Celula): boolean {
  return siguienteCelula(c) === null;
}

/** Línea de producción pendiente de la OP (lo que hay que fabricar). */
export interface LineaProduccion {
  productoConfiguradoId: number;
  tallaId: number;
  cantAProducir: number;
}

/** Par a materializar (lo que va a la tabla Par, sin ofId). */
export interface ParData {
  codigo: string;
  productoConfiguradoId: number;
  tallaId: number;
}

/**
 * Materializa un Par por cada unidad de `cantAProducir`.
 * Código: `OF{consecutivo}-{seq}` con seq incremental global (4 dígitos) desde 1.
 * Ignora líneas con cantAProducir <= 0.
 */
export function generarPares(
  consecutivoOF: number,
  lineas: LineaProduccion[],
): ParData[] {
  const out: ParData[] = [];
  let seq = 0;
  for (const l of lineas) {
    for (let i = 0; i < l.cantAProducir; i++) {
      seq++;
      out.push({
        codigo: `OF${consecutivoOF}-${String(seq).padStart(4, '0')}`,
        productoConfiguradoId: l.productoConfiguradoId,
        tallaId: l.tallaId,
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `cd backend && npx jest src/fabricacion/fabricacion-core.spec.ts`
Expected: PASS — los 7 tests verdes.

- [ ] **Step 5: Commit**

```bash
git add backend/src/fabricacion/fabricacion-core.ts backend/src/fabricacion/fabricacion-core.spec.ts
git commit -m "feat(mes): lógica pura de células + generación de pares (TDD)"
```

---

## Task 3: DTO + `FabricacionService.generarOF`

**Files:**
- Create: `backend/src/fabricacion/dto/avanzar.dto.ts`
- Create: `backend/src/fabricacion/fabricacion.service.ts`
- Test: `backend/src/fabricacion/fabricacion.service.spec.ts`

- [ ] **Step 1: Crear el DTO de avanzar (se usa en Task 4, lo creamos ya)**

Crear `backend/src/fabricacion/dto/avanzar.dto.ts`:

```typescript
import { IsInt } from 'class-validator';

export class AvanzarDto {
  @IsInt()
  operarioId!: number;

  @IsInt()
  maquinaId!: number;
}
```

- [ ] **Step 2: Escribir el test que falla para `generarOF`**

Crear `backend/src/fabricacion/fabricacion.service.spec.ts`:

```typescript
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { FabricacionService } from './fabricacion.service';

function makePrisma(overrides: any = {}) {
  const tx = {
    ordenFabricacion: {
      aggregate: jest.fn().mockResolvedValue({ _max: { consecutivo: 4 } }),
      create: jest.fn().mockResolvedValue({ id: 1, consecutivo: 5 }),
      update: jest.fn().mockResolvedValue({}),
    },
    par: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
    },
    eventoTrazabilidad: { create: jest.fn().mockResolvedValue({}) },
    bodega: { findFirst: jest.fn().mockResolvedValue({ id: 7 }) },
    inventarioPT: { upsert: jest.fn().mockResolvedValue({}) },
    ...overrides.tx,
  };
  const prisma: any = {
    ordenProduccion: {
      findUnique: jest.fn(),
    },
    par: { findUnique: jest.fn() },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
    ...overrides.root,
  };
  return { prisma, tx };
}

describe('FabricacionService.generarOF', () => {
  it('crea OF con consecutivo max+1 y N pares en CORTE', async () => {
    const { prisma, tx } = makePrisma();
    prisma.ordenProduccion.findUnique.mockResolvedValue({
      id: 100,
      ordenesFabricacion: [],
      lineas: [
        {
          productoConfiguradoId: 10,
          tallas: [
            { tallaId: 1, cantAProducir: 2 },
            { tallaId: 2, cantAProducir: 1 },
          ],
        },
      ],
    });
    const service = new FabricacionService(prisma);

    const res = await service.generarOF(100);

    expect(tx.ordenFabricacion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ consecutivo: 5, opId: 100 }) }),
    );
    const createManyArg = tx.par.createMany.mock.calls[0][0];
    expect(createManyArg.data).toHaveLength(3);
    expect(createManyArg.data[0]).toMatchObject({ ofId: 1, codigo: 'OF5-0001' });
    expect(res).toEqual({ id: 1, consecutivo: 5, opId: 100, totalPares: 3 });
  });

  it('404 si la OP no existe', async () => {
    const { prisma } = makePrisma();
    prisma.ordenProduccion.findUnique.mockResolvedValue(null);
    await expect(new FabricacionService(prisma).generarOF(999)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('409 si la OP ya tiene OF', async () => {
    const { prisma } = makePrisma();
    prisma.ordenProduccion.findUnique.mockResolvedValue({
      id: 1, ordenesFabricacion: [{ id: 1 }], lineas: [],
    });
    await expect(new FabricacionService(prisma).generarOF(1)).rejects.toBeInstanceOf(ConflictException);
  });

  it('400 si la OP no tiene producción pendiente', async () => {
    const { prisma } = makePrisma();
    prisma.ordenProduccion.findUnique.mockResolvedValue({
      id: 1, ordenesFabricacion: [],
      lineas: [{ productoConfiguradoId: 10, tallas: [{ tallaId: 1, cantAProducir: 0 }] }],
    });
    await expect(new FabricacionService(prisma).generarOF(1)).rejects.toBeInstanceOf(BadRequestException);
  });
});
```

- [ ] **Step 3: Correr el test para verificar que falla**

Run: `cd backend && npx jest src/fabricacion/fabricacion.service.spec.ts`
Expected: FAIL — `Cannot find module './fabricacion.service'`.

- [ ] **Step 4: Implementar `FabricacionService` con `generarOF`**

Crear `backend/src/fabricacion/fabricacion.service.ts`:

```typescript
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { generarPares, siguienteCelula, LineaProduccion } from './fabricacion-core';
import { AvanzarDto } from './dto/avanzar.dto';

@Injectable()
export class FabricacionService {
  constructor(private readonly prisma: PrismaService) {}

  async generarOF(opId: number) {
    const op = await this.prisma.ordenProduccion.findUnique({
      where: { id: opId },
      include: { lineas: { include: { tallas: true } }, ordenesFabricacion: true },
    });
    if (!op) throw new NotFoundException(`OP ${opId} no existe`);
    if (op.ordenesFabricacion.length > 0)
      throw new ConflictException('La OP ya tiene una OF');

    const lineas: LineaProduccion[] = op.lineas.flatMap((l: any) =>
      l.tallas
        .filter((t: any) => t.cantAProducir > 0)
        .map((t: any) => ({
          productoConfiguradoId: l.productoConfiguradoId,
          tallaId: t.tallaId,
          cantAProducir: t.cantAProducir,
        })),
    );
    if (lineas.length === 0)
      throw new BadRequestException('La OP no tiene producción pendiente');

    return this.prisma.$transaction(async (tx) => {
      const agg = await tx.ordenFabricacion.aggregate({ _max: { consecutivo: true } });
      const consecutivo = (agg._max.consecutivo ?? 0) + 1;
      const of = await tx.ordenFabricacion.create({ data: { consecutivo, opId } });
      const pares = generarPares(consecutivo, lineas).map((p) => ({ ...p, ofId: of.id }));
      await tx.par.createMany({ data: pares });
      return { id: of.id, consecutivo, opId, totalPares: pares.length };
    });
  }
}
```

> Nota: `siguienteCelula`/`AvanzarDto` se importan ya aunque `avanzar` se implementa en Task 4 (evita un segundo edit del import). Si el linter marca import sin uso, se resuelve al cerrar Task 4. Si molesta, agregar `avanzar` ahora con la firma stub no — mejor seguir a Task 4 inmediatamente.

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `cd backend && npx jest src/fabricacion/fabricacion.service.spec.ts`
Expected: PASS — los 4 tests de `generarOF` verdes.

- [ ] **Step 6: Commit**

```bash
git add backend/src/fabricacion/dto/avanzar.dto.ts backend/src/fabricacion/fabricacion.service.ts backend/src/fabricacion/fabricacion.service.spec.ts
git commit -m "feat(mes): generarOF (consecutivo + materializa pares) (TDD)"
```

---

## Task 4: `FabricacionService.avanzar` (escaneo + cierre de ciclo)

**Files:**
- Modify: `backend/src/fabricacion/fabricacion.service.ts`
- Modify: `backend/src/fabricacion/fabricacion.service.spec.ts`

- [ ] **Step 1: Agregar los tests que fallan para `avanzar`**

Agregar al final de `backend/src/fabricacion/fabricacion.service.spec.ts`:

```typescript
describe('FabricacionService.avanzar', () => {
  const dto = { operarioId: 3, maquinaId: 4 };

  it('registra evento en la célula actual y mueve a la siguiente', async () => {
    const { prisma, tx } = makePrisma();
    prisma.par.findUnique.mockResolvedValue({
      id: 50, ofId: 1, celulaActual: 'CORTE', estado: 'EN_PROCESO',
      productoConfiguradoId: 10, tallaId: 1, of: { estado: 'ABIERTA' },
    });
    tx.par.update.mockResolvedValue({ id: 50, celulaActual: 'GUARNICION' });
    const service = new FabricacionService(prisma);

    await service.avanzar('OF1-0001', dto);

    expect(tx.eventoTrazabilidad.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ parId: 50, celula: 'CORTE', operarioId: 3, maquinaId: 4 }),
      }),
    );
    expect(tx.par.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ celulaActual: 'GUARNICION' }) }),
    );
  });

  it('al salir de CORTE pasa la OF de ABIERTA a EN_PROCESO', async () => {
    const { prisma, tx } = makePrisma();
    prisma.par.findUnique.mockResolvedValue({
      id: 50, ofId: 1, celulaActual: 'CORTE', estado: 'EN_PROCESO',
      productoConfiguradoId: 10, tallaId: 1, of: { estado: 'ABIERTA' },
    });
    await new FabricacionService(prisma).avanzar('OF1-0001', dto);
    expect(tx.ordenFabricacion.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { estado: 'EN_PROCESO' } }),
    );
  });

  it('desde PT termina el par y suma 1 a InventarioPT', async () => {
    const { prisma, tx } = makePrisma();
    prisma.par.findUnique.mockResolvedValue({
      id: 50, ofId: 1, celulaActual: 'PT', estado: 'EN_PROCESO',
      productoConfiguradoId: 10, tallaId: 1, of: { estado: 'EN_PROCESO' },
    });
    tx.par.count.mockResolvedValue(0); // era el último par en proceso
    await new FabricacionService(prisma).avanzar('OF1-0001', dto);

    expect(tx.par.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { estado: 'TERMINADO' } }),
    );
    expect(tx.inventarioPT.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productoConfiguradoId_tallaId_bodegaId: { productoConfiguradoId: 10, tallaId: 1, bodegaId: 7 } },
        create: expect.objectContaining({ cantDisponible: 1 }),
        update: { cantDisponible: { increment: 1 } },
      }),
    );
    expect(tx.ordenFabricacion.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { estado: 'TERMINADA' } }),
    );
  });

  it('404 si el par no existe', async () => {
    const { prisma } = makePrisma();
    prisma.par.findUnique.mockResolvedValue(null);
    await expect(new FabricacionService(prisma).avanzar('NOPE', dto)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('409 si el par ya está TERMINADO', async () => {
    const { prisma } = makePrisma();
    prisma.par.findUnique.mockResolvedValue({
      id: 50, ofId: 1, celulaActual: 'PT', estado: 'TERMINADO',
      productoConfiguradoId: 10, tallaId: 1, of: { estado: 'EN_PROCESO' },
    });
    await expect(new FabricacionService(prisma).avanzar('OF1-0001', dto)).rejects.toBeInstanceOf(ConflictException);
  });
});
```

- [ ] **Step 2: Correr para verificar que fallan**

Run: `cd backend && npx jest src/fabricacion/fabricacion.service.spec.ts`
Expected: FAIL — `service.avanzar is not a function`.

- [ ] **Step 3: Implementar `avanzar` en el service**

Agregar el método `avanzar` dentro de la clase `FabricacionService` (después de `generarOF`):

```typescript
  async avanzar(codigo: string, dto: AvanzarDto) {
    const par = await this.prisma.par.findUnique({
      where: { codigo },
      include: { of: true },
    });
    if (!par) throw new NotFoundException(`Par ${codigo} no existe`);
    if (par.estado === 'TERMINADO')
      throw new ConflictException('El par ya está terminado');

    const celulaActual = par.celulaActual;
    const siguiente = siguienteCelula(celulaActual);

    return this.prisma.$transaction(async (tx) => {
      await tx.eventoTrazabilidad.create({
        data: {
          parId: par.id,
          celula: celulaActual,
          operarioId: dto.operarioId,
          maquinaId: dto.maquinaId,
        },
      });

      if (siguiente === null) {
        // Última célula (PT): terminar el par y sumar a InventarioPT.
        const updated = await tx.par.update({
          where: { id: par.id },
          data: { estado: 'TERMINADO' },
        });
        const bodega = await tx.bodega.findFirst({
          where: { tipo: 'PROPIA', activo: true },
          orderBy: { prioridad: 'asc' },
        });
        if (!bodega)
          throw new BadRequestException('No hay bodega PROPIA configurada');
        await tx.inventarioPT.upsert({
          where: {
            productoConfiguradoId_tallaId_bodegaId: {
              productoConfiguradoId: par.productoConfiguradoId,
              tallaId: par.tallaId,
              bodegaId: bodega.id,
            },
          },
          create: {
            productoConfiguradoId: par.productoConfiguradoId,
            tallaId: par.tallaId,
            bodegaId: bodega.id,
            cantDisponible: 1,
          },
          update: { cantDisponible: { increment: 1 } },
        });
        const restantes = await tx.par.count({
          where: { ofId: par.ofId, estado: 'EN_PROCESO' },
        });
        if (restantes === 0)
          await tx.ordenFabricacion.update({
            where: { id: par.ofId },
            data: { estado: 'TERMINADA' },
          });
        return updated;
      }

      // Avance normal a la siguiente célula.
      if (celulaActual === 'CORTE' && par.of.estado === 'ABIERTA') {
        await tx.ordenFabricacion.update({
          where: { id: par.ofId },
          data: { estado: 'EN_PROCESO' },
        });
      }
      return tx.par.update({
        where: { id: par.id },
        data: { celulaActual: siguiente },
      });
    });
  }
```

- [ ] **Step 4: Correr para verificar que pasan**

Run: `cd backend && npx jest src/fabricacion/fabricacion.service.spec.ts`
Expected: PASS — los 9 tests del service verdes (4 de generarOF + 5 de avanzar).

- [ ] **Step 5: Commit**

```bash
git add backend/src/fabricacion/fabricacion.service.ts backend/src/fabricacion/fabricacion.service.spec.ts
git commit -m "feat(mes): avanzar par (evento + transición + cierre de ciclo a InventarioPT) (TDD)"
```

---

## Task 5: Lecturas del service (OF, par, tablero, catálogos)

**Files:**
- Modify: `backend/src/fabricacion/fabricacion.service.ts`
- Modify: `backend/src/fabricacion/fabricacion.service.spec.ts`

- [ ] **Step 1: Agregar test de `tablero` (agrupación de lectura)**

Agregar al final de `backend/src/fabricacion/fabricacion.service.spec.ts`:

```typescript
describe('FabricacionService lecturas', () => {
  it('tablero filtra por ofId cuando se pasa', async () => {
    const { prisma } = makePrisma();
    prisma.par = {
      ...prisma.par,
      findMany: jest.fn().mockResolvedValue([]),
    };
    await new FabricacionService(prisma).tablero(1);
    expect(prisma.par.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ofId: 1 } }),
    );
  });

  it('tablero sin ofId no filtra', async () => {
    const { prisma } = makePrisma();
    prisma.par = { ...prisma.par, findMany: jest.fn().mockResolvedValue([]) };
    await new FabricacionService(prisma).tablero(undefined);
    expect(prisma.par.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });
});
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `cd backend && npx jest src/fabricacion/fabricacion.service.spec.ts -t tablero`
Expected: FAIL — `service.tablero is not a function`.

- [ ] **Step 3: Implementar las lecturas en el service**

Agregar estos métodos dentro de `FabricacionService`:

```typescript
  listarOF() {
    return this.prisma.ordenFabricacion.findMany({
      orderBy: { consecutivo: 'desc' },
      select: {
        id: true,
        consecutivo: true,
        estado: true,
        fecha: true,
        op: { select: { consecutivo: true } },
        _count: { select: { pares: true } },
      },
    });
  }

  async obtenerOF(id: number) {
    const of = await this.prisma.ordenFabricacion.findUnique({
      where: { id },
      include: {
        op: { select: { consecutivo: true } },
        pares: {
          orderBy: { codigo: 'asc' },
          select: {
            id: true,
            codigo: true,
            celulaActual: true,
            estado: true,
            talla: { select: { valor: true } },
          },
        },
      },
    });
    if (!of) throw new NotFoundException(`OF ${id} no existe`);
    return of;
  }

  tablero(ofId?: number) {
    return this.prisma.par.findMany({
      where: ofId ? { ofId } : {},
      orderBy: { codigo: 'asc' },
      select: {
        id: true,
        codigo: true,
        celulaActual: true,
        estado: true,
        talla: { select: { valor: true } },
        of: { select: { consecutivo: true } },
      },
    });
  }

  async obtenerPar(codigo: string) {
    const par = await this.prisma.par.findUnique({
      where: { codigo },
      include: {
        of: { select: { consecutivo: true } },
        talla: { select: { valor: true } },
        productoConfigurado: { select: { id: true } },
        eventos: {
          orderBy: { timestamp: 'asc' },
          include: {
            operario: { select: { nombre: true } },
            maquina: { select: { nombre: true } },
          },
        },
      },
    });
    if (!par) throw new NotFoundException(`Par ${codigo} no existe`);
    return par;
  }

  listarOperarios(celula?: string) {
    return this.prisma.operario.findMany({
      where: { activo: true, ...(celula ? { celula: celula as any } : {}) },
      orderBy: { nombre: 'asc' },
    });
  }

  listarMaquinas(celula?: string) {
    return this.prisma.maquina.findMany({
      where: { activo: true, ...(celula ? { celula: celula as any } : {}) },
      orderBy: { nombre: 'asc' },
    });
  }
```

- [ ] **Step 4: Correr toda la suite del service**

Run: `cd backend && npx jest src/fabricacion/fabricacion.service.spec.ts`
Expected: PASS — 11 tests verdes.

- [ ] **Step 5: Commit**

```bash
git add backend/src/fabricacion/fabricacion.service.ts backend/src/fabricacion/fabricacion.service.spec.ts
git commit -m "feat(mes): lecturas de OF, par, tablero y catálogos (TDD)"
```

---

## Task 6: Controller + módulo + registro

**Files:**
- Create: `backend/src/fabricacion/fabricacion.controller.ts`
- Create: `backend/src/fabricacion/fabricacion.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Crear el controller**

Crear `backend/src/fabricacion/fabricacion.controller.ts`:

```typescript
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { FabricacionService } from './fabricacion.service';
import { AvanzarDto } from './dto/avanzar.dto';

@UseGuards(JwtAuthGuard)
@Controller('fabricacion')
export class FabricacionController {
  constructor(private readonly service: FabricacionService) {}

  @Post('of')
  generarOF(@Body('opId', ParseIntPipe) opId: number) {
    return this.service.generarOF(opId);
  }

  @Get('of')
  listarOF() {
    return this.service.listarOF();
  }

  @Get('of/:id')
  obtenerOF(@Param('id', ParseIntPipe) id: number) {
    return this.service.obtenerOF(id);
  }

  @Post('par/:codigo/avanzar')
  avanzar(@Param('codigo') codigo: string, @Body() dto: AvanzarDto) {
    return this.service.avanzar(codigo, dto);
  }

  @Get('par/:codigo')
  obtenerPar(@Param('codigo') codigo: string) {
    return this.service.obtenerPar(codigo);
  }

  @Get('tablero')
  tablero(@Query('ofId') ofId?: string) {
    return this.service.tablero(ofId ? Number(ofId) : undefined);
  }

  @Get('operarios')
  operarios(@Query('celula') celula?: string) {
    return this.service.listarOperarios(celula);
  }

  @Get('maquinas')
  maquinas(@Query('celula') celula?: string) {
    return this.service.listarMaquinas(celula);
  }
}
```

- [ ] **Step 2: Crear el módulo**

Crear `backend/src/fabricacion/fabricacion.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { FabricacionController } from './fabricacion.controller';
import { FabricacionService } from './fabricacion.service';

@Module({
  controllers: [FabricacionController],
  providers: [FabricacionService],
})
export class FabricacionModule {}
```

> `PrismaService` es global (vía `PrismaModule`), igual que en `ComprasModule`/`DespachoModule` — no hace falta importarlo acá.

- [ ] **Step 3: Registrar el módulo en `AppModule`**

En `backend/src/app.module.ts`: agregar el import y sumarlo al array `imports` (después de `ComprasModule`):

```typescript
import { FabricacionModule } from './fabricacion/fabricacion.module';
```
```typescript
    ComprasModule,
    FabricacionModule,
```

- [ ] **Step 4: Compilar y verificar arranque**

Run:
```bash
cd backend && rm -rf dist tsconfig.build.tsbuildinfo && npx tsc --noEmit -p tsconfig.json
```
Expected: sin errores de compilación.
> Gotcha conocido (ver `botas-roadmap`): si `nest build` no emite `dist`, borrar `.tsbuildinfo` + `dist` y rebuild.

- [ ] **Step 5: Correr toda la suite backend**

Run: `cd backend && npm test`
Expected: PASS — toda la suite verde (incluye los nuevos specs de fabricacion).

- [ ] **Step 6: Commit**

```bash
git add backend/src/fabricacion/fabricacion.controller.ts backend/src/fabricacion/fabricacion.module.ts backend/src/app.module.ts
git commit -m "feat(mes): controller + module + registro en AppModule"
```

---

## Task 7: Seed de demo (operarios, máquinas, OP-9005 driver)

**Files:**
- Modify: `backend/prisma/seed-demo.ts`

- [ ] **Step 1: Agregar limpieza idempotente del MES al inicio del bloque de borrado**

En `backend/prisma/seed-demo.ts`, junto a los `deleteMany` que limpian las OPs de demo (los `where: { ... consecutivo: { in: [9001, 9002, 9003] } }`), agregar **antes** de borrar las OP/OC, el borrado de las entidades MES (respetando FKs: eventos → pares → OF; y catálogos):

```typescript
  // ── Limpieza MES (idempotente) ──
  await prisma.eventoTrazabilidad.deleteMany({
    where: { par: { of: { op: { consecutivo: { in: [9001, 9002, 9003, 9005] } } } } },
  });
  await prisma.par.deleteMany({
    where: { of: { op: { consecutivo: { in: [9001, 9002, 9003, 9005] } } } },
  });
  await prisma.ordenFabricacion.deleteMany({
    where: { op: { consecutivo: { in: [9001, 9002, 9003, 9005] } } },
  });
  await prisma.maquina.deleteMany({});
  await prisma.operario.deleteMany({});
```
Y agregar `9005` a los `in: [9001, 9002, 9003]` existentes de las OPs/OCs/etc. para que la OP-9005 se limpie en re-seeds.

- [ ] **Step 2: Sembrar operarios y máquinas (uno por célula)**

Agregar después del bloque de proveedores/stock (final del archivo, antes del `console.log` de cierre si lo hay):

```typescript
  // ── MES: operarios y máquinas (uno por célula) ──
  const celulas = ['CORTE', 'GUARNICION', 'ALMACEN', 'INYECCION', 'PT'] as const;
  const nombresOperario: Record<(typeof celulas)[number], string> = {
    CORTE: 'Carlos Cortés',
    GUARNICION: 'Gloria Guarín',
    ALMACEN: 'Aldo Mena',
    INYECCION: 'Iván Yepes',
    PT: 'Patricia Téllez',
  };
  const nombresMaquina: Record<(typeof celulas)[number], string> = {
    CORTE: 'Cortadora CNC',
    GUARNICION: 'Máquina de costura plana',
    ALMACEN: 'Estación de armado',
    INYECCION: 'Inyectora robotizada',
    PT: 'Empacadora',
  };
  for (const c of celulas) {
    await prisma.operario.create({ data: { nombre: nombresOperario[c], celula: c } });
    await prisma.maquina.create({
      data: { codigo: `MAQ-${c}`, nombre: nombresMaquina[c], celula: c },
    });
  }
```

- [ ] **Step 3: Crear la OP-9005 driver del MES (cantidades chicas)**

La OP-9003 tiene 200 pares (demasiado para el tablero). Crear una OP-9005 dedicada con producción pendiente chica. Agregar después de la OP-9003 (reusa `clienteAlDia` y `prodDiel`, `tallaA`, `tallaB` ya definidos en el seed):

```typescript
  // ── OP 9005 — driver del MES (cantidades chicas para el tablero) ──
  const oc9005 = await prisma.ordenCompra.create({
    data: {
      consecutivo: 9005,
      clienteId: clienteAlDia.id,
      estado: 'EN_PRODUCCION',
      lineas: {
        create: [
          {
            productoConfiguradoId: prodDiel.id,
            tallas: { create: [{ tallaId: tallaA.id, cantidad: 6 }, { tallaId: tallaB.id, cantidad: 6 }] },
          },
        ],
      },
    },
  });
  const op9005 = await prisma.ordenProduccion.create({
    data: { consecutivo: 9005, ocId: oc9005.id, estado: 'EN_PRODUCCION' },
  });
  const op9005Linea = await prisma.ordenProduccionLinea.create({
    data: { opId: op9005.id, productoConfiguradoId: prodDiel.id },
  });
  await prisma.ordenProduccionLineaTalla.createMany({
    data: [
      { opLineaId: op9005Linea.id, tallaId: tallaA.id, cantPedida: 6, cantAmarrada: 0, cantAProducir: 6 },
      { opLineaId: op9005Linea.id, tallaId: tallaB.id, cantPedida: 6, cantAmarrada: 0, cantAProducir: 6 },
    ],
  });
  console.log('  OP-9005 (driver MES): 12 pares pendientes desde Corte');
```

> Driver del MES = **OP-9005** (12 pares). La bodega PT destino del cierre de ciclo es la `PROPIA` de menor `prioridad` ya existente en el seed.

- [ ] **Step 4: Correr el seed**

Run: `cd backend && npm run seed:demo`
Expected: termina sin error, imprime la línea `OP-9005 (driver MES): 12 pares pendientes desde Corte`.

- [ ] **Step 5: Verificar datos sembrados**

Run:
```bash
cd backend && npx prisma studio --browser none &>/dev/null & sleep 1; node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();(async()=>{console.log('operarios',await p.operario.count());console.log('maquinas',await p.maquina.count());console.log('op9005',await p.ordenProduccion.findUnique({where:{consecutivo:9005}}));await p.\$disconnect()})()"
```
Expected: `operarios 5`, `maquinas 5`, y la OP-9005 existe.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/seed-demo.ts
git commit -m "feat(mes): seed de operarios, máquinas y OP-9005 driver del tablero"
```

---

## Task 8: Frontend — modelos + API client

**Files:**
- Create: `frontend/src/app/core/api/models/fabricacion.models.ts`
- Create: `frontend/src/app/core/api/fabricacion.api.ts`

- [ ] **Step 1: Crear los modelos TypeScript**

Crear `frontend/src/app/core/api/models/fabricacion.models.ts`:

```typescript
export type Celula = 'CORTE' | 'GUARNICION' | 'ALMACEN' | 'INYECCION' | 'PT';
export type EstadoPar = 'EN_PROCESO' | 'TERMINADO';
export type EstadoOF = 'ABIERTA' | 'EN_PROCESO' | 'TERMINADA' | 'ANULADA';

export interface OFGenerada {
  id: number;
  consecutivo: number;
  opId: number;
  totalPares: number;
}

export interface OFListItem {
  id: number;
  consecutivo: number;
  estado: EstadoOF;
  fecha: string;
  op: { consecutivo: number };
  _count: { pares: number };
}

export interface ParTablero {
  id: number;
  codigo: string;
  celulaActual: Celula;
  estado: EstadoPar;
  talla: { valor: string };
  of: { consecutivo: number };
}

export interface EventoTrazabilidad {
  id: number;
  celula: Celula;
  timestamp: string;
  operario: { nombre: string };
  maquina: { nombre: string };
}

export interface ParDetalle {
  id: number;
  codigo: string;
  celulaActual: Celula;
  estado: EstadoPar;
  of: { consecutivo: number };
  talla: { valor: string };
  eventos: EventoTrazabilidad[];
}

export interface Operario {
  id: number;
  nombre: string;
  celula: Celula;
}

export interface Maquina {
  id: number;
  codigo: string;
  nombre: string;
  celula: Celula;
}

export const ORDEN_CELULAS: Celula[] = ['CORTE', 'GUARNICION', 'ALMACEN', 'INYECCION', 'PT'];

export const LABEL_CELULA: Record<Celula, string> = {
  CORTE: 'Corte',
  GUARNICION: 'Guarnición',
  ALMACEN: 'Almacén',
  INYECCION: 'Inyección',
  PT: 'P. Terminado',
};

export function siguienteCelulaLabel(c: Celula): string | null {
  const i = ORDEN_CELULAS.indexOf(c);
  if (i < 0 || i >= ORDEN_CELULAS.length - 1) return null;
  return LABEL_CELULA[ORDEN_CELULAS[i + 1]];
}
```

- [ ] **Step 2: Escribir el test del API client (falla)**

Crear `frontend/src/app/core/api/fabricacion.api.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FabricacionApi } from './fabricacion.api';
import { environment } from '../../../environments/environment';

describe('FabricacionApi', () => {
  let api: FabricacionApi;
  let httpMock: HttpTestingController;
  const base = environment.apiUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FabricacionApi, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(FabricacionApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('generarOF hace POST a /fabricacion/of con opId', () => {
    api.generarOF(100).subscribe();
    const req = httpMock.expectOne(`${base}/fabricacion/of`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ opId: 100 });
    req.flush({ id: 1, consecutivo: 5, opId: 100, totalPares: 12 });
  });

  it('avanzar hace POST con operario y máquina', () => {
    api.avanzar('OF5-0001', 3, 4).subscribe();
    const req = httpMock.expectOne(`${base}/fabricacion/par/OF5-0001/avanzar`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ operarioId: 3, maquinaId: 4 });
    req.flush({});
  });

  it('tablero filtra por ofId', () => {
    api.tablero(1).subscribe();
    const req = httpMock.expectOne(`${base}/fabricacion/tablero?ofId=1`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('operarios filtra por célula', () => {
    api.operarios('CORTE').subscribe();
    const req = httpMock.expectOne(`${base}/fabricacion/operarios?celula=CORTE`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });
});
```

- [ ] **Step 3: Correr para verificar que falla**

Run: `cd frontend && ng test --watch=false --browsers=ChromeHeadless --include='**/fabricacion.api.spec.ts'`
Expected: FAIL — no existe `fabricacion.api`.

- [ ] **Step 4: Implementar el API client**

Crear `frontend/src/app/core/api/fabricacion.api.ts`:

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  OFGenerada, OFListItem, ParTablero, ParDetalle, Operario, Maquina,
} from './models/fabricacion.models';

@Injectable({ providedIn: 'root' })
export class FabricacionApi {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  generarOF(opId: number) {
    return this.http.post<OFGenerada>(`${this.base}/fabricacion/of`, { opId });
  }
  listarOF() {
    return this.http.get<OFListItem[]>(`${this.base}/fabricacion/of`);
  }
  avanzar(codigo: string, operarioId: number, maquinaId: number) {
    return this.http.post<unknown>(
      `${this.base}/fabricacion/par/${codigo}/avanzar`,
      { operarioId, maquinaId },
    );
  }
  par(codigo: string) {
    return this.http.get<ParDetalle>(`${this.base}/fabricacion/par/${codigo}`);
  }
  tablero(ofId?: number) {
    let params = new HttpParams();
    if (ofId != null) params = params.set('ofId', ofId);
    return this.http.get<ParTablero[]>(`${this.base}/fabricacion/tablero`, { params });
  }
  operarios(celula?: string) {
    let params = new HttpParams();
    if (celula) params = params.set('celula', celula);
    return this.http.get<Operario[]>(`${this.base}/fabricacion/operarios`, { params });
  }
  maquinas(celula?: string) {
    let params = new HttpParams();
    if (celula) params = params.set('celula', celula);
    return this.http.get<Maquina[]>(`${this.base}/fabricacion/maquinas`, { params });
  }
}
```

- [ ] **Step 5: Correr para verificar que pasa**

Run: `cd frontend && ng test --watch=false --browsers=ChromeHeadless --include='**/fabricacion.api.spec.ts'`
Expected: PASS — 4 tests verdes.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/core/api/models/fabricacion.models.ts frontend/src/app/core/api/fabricacion.api.ts frontend/src/app/core/api/fabricacion.api.spec.ts
git commit -m "feat(mes): modelos + FabricacionApi (front) (TDD)"
```

---

## Task 9: Frontend — instalar QR + componente Par detalle

**Files:**
- Modify: `frontend/package.json` (dependencia)
- Create: `frontend/src/app/features/fabricacion/par-detalle.component.ts`

- [ ] **Step 1: Instalar `angularx-qrcode` (compatible Angular 19)**

Run: `cd frontend && npm install angularx-qrcode@^19`
Expected: agrega la dependencia sin conflictos de peer (Angular 19). Si el rango exacto falla, usar la última `19.x` disponible.

- [ ] **Step 2: Crear el componente de detalle de par (timeline + QR)**

Crear `frontend/src/app/features/fabricacion/par-detalle.component.ts`:

```typescript
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { QRCodeComponent } from 'angularx-qrcode';
import { FabricacionApi } from '../../core/api/fabricacion.api';
import { ParDetalle, LABEL_CELULA } from '../../core/api/models/fabricacion.models';

@Component({
  selector: 'app-par-detalle',
  standalone: true,
  imports: [DatePipe, QRCodeComponent],
  template: `
    <div class="page">
      <div class="page-header"><div class="ph-title">Trazabilidad del par</div></div>
      @if (par(); as p) {
        <div class="grid">
          <div class="card"><div class="card-body qr-box">
            <qrcode [qrdata]="p.codigo" [width]="200" [errorCorrectionLevel]="'M'"></qrcode>
            <div class="mono code">{{ p.codigo }}</div>
            <div class="cell-sub">OF-{{ p.of.consecutivo }} · Talla {{ p.talla.valor }}</div>
            <div>
              @if (p.estado === 'TERMINADO') { <span class="badge badge-accent">terminado</span> }
              @else { <span class="badge">en {{ label(p.celulaActual) }}</span> }
            </div>
          </div></div>
          <div class="card"><div class="card-body">
            <h4>Recorrido</h4>
            @if (p.eventos.length) {
              <ul class="timeline">
                @for (e of p.eventos; track e.id) {
                  <li>
                    <span class="tl-cel">{{ label(e.celula) }}</span>
                    <span class="cell-sub">{{ e.operario.nombre }} · {{ e.maquina.nombre }}</span>
                    <span class="cell-sub mono">{{ e.timestamp | date:'dd MMM HH:mm' }}</span>
                  </li>
                }
              </ul>
            } @else {
              <p class="cell-sub">Sin eventos todavía.</p>
            }
          </div></div>
        </div>
      } @else {
        <div class="empty"><h4>{{ error() ?? 'Cargando…' }}</h4></div>
      }
    </div>
  `,
  styles: [`
    .grid{display:grid;grid-template-columns:minmax(220px,280px) 1fr;gap:var(--sp-4)}
    .qr-box{display:flex;flex-direction:column;align-items:center;gap:var(--sp-2);text-align:center}
    .code{font-size:var(--text-sm)}
    .timeline{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:var(--sp-3)}
    .timeline li{display:flex;flex-direction:column;gap:2px;padding-bottom:var(--sp-3);border-bottom:var(--bw) solid var(--border)}
    .tl-cel{font-weight:var(--fw-medium)}
    .mono{font-family:var(--font-mono)}
  `],
})
export class ParDetalleComponent implements OnInit {
  private readonly api = inject(FabricacionApi);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  par = signal<ParDetalle | null>(null);
  error = signal<string | null>(null);
  label = (c: ParDetalle['celulaActual']) => LABEL_CELULA[c];

  ngOnInit(): void {
    const codigo = this.route.snapshot.paramMap.get('codigo')!;
    this.api.par(codigo).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (p) => this.par.set(p),
      error: () => this.error.set('Par no encontrado'),
    });
  }
}
```

- [ ] **Step 3: Verificar que compila (typecheck del front)**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: sin errores (los tipos de `angularx-qrcode` resuelven).

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/app/features/fabricacion/par-detalle.component.ts
git commit -m "feat(mes): detalle de par con QR + timeline de trazabilidad"
```

---

## Task 10: Frontend — Tablero kanban en vivo

**Files:**
- Create: `frontend/src/app/features/fabricacion/tablero.component.ts`

- [ ] **Step 1: Crear el componente de tablero**

Crear `frontend/src/app/features/fabricacion/tablero.component.ts`:

```typescript
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FabricacionApi } from '../../core/api/fabricacion.api';
import { ParTablero, Celula, ORDEN_CELULAS, LABEL_CELULA } from '../../core/api/models/fabricacion.models';

@Component({
  selector: 'app-fabricacion-tablero',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="ph-title">Tablero de fabricación</div>
        <button class="btn" (click)="cargar()">Actualizar</button>
      </div>
      <div class="kanban">
        @for (c of columnas; track c) {
          <div class="col">
            <div class="col-h">
              <span>{{ label(c) }}</span>
              <span class="badge">{{ porCelula()[c].length }}</span>
            </div>
            <div class="col-body">
              @for (p of porCelula()[c]; track p.id) {
                <a class="par-chip" [routerLink]="['/fabricacion/par', p.codigo]">
                  <span class="mono">{{ p.codigo }}</span>
                  <span class="cell-sub">T{{ p.talla.valor }}</span>
                </a>
              } @empty {
                <div class="cell-sub empty-col">—</div>
              }
            </div>
          </div>
        }
        <div class="col col-done">
          <div class="col-h"><span>Terminados</span><span class="badge badge-accent">{{ terminados().length }}</span></div>
          <div class="col-body">
            @for (p of terminados(); track p.id) {
              <a class="par-chip done" [routerLink]="['/fabricacion/par', p.codigo]">
                <span class="mono">{{ p.codigo }}</span><span class="cell-sub">T{{ p.talla.valor }}</span>
              </a>
            }
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .kanban{display:grid;grid-template-columns:repeat(6,1fr);gap:var(--sp-3);align-items:start}
    .col{background:var(--surface);border:var(--bw) solid var(--border);border-radius:var(--radius);min-height:120px}
    .col-h{display:flex;justify-content:space-between;align-items:center;padding:var(--sp-2) var(--sp-3);border-bottom:var(--bw) solid var(--border);font-weight:var(--fw-medium);font-size:var(--text-sm)}
    .col-body{padding:var(--sp-2);display:flex;flex-direction:column;gap:var(--sp-2)}
    .par-chip{display:flex;justify-content:space-between;gap:var(--sp-2);padding:var(--sp-2);border:var(--bw) solid var(--border);border-radius:var(--radius-sm);font-size:var(--text-caption);text-decoration:none;color:inherit}
    .par-chip:hover{border-color:var(--accent)}
    .par-chip.done{opacity:.7}
    .mono{font-family:var(--font-mono)}
    .empty-col{text-align:center;padding:var(--sp-2)}
  `],
})
export class FabricacionTableroComponent implements OnInit {
  private readonly api = inject(FabricacionApi);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly columnas: Celula[] = ORDEN_CELULAS;
  label = (c: Celula) => LABEL_CELULA[c];
  private pares = signal<ParTablero[]>([]);
  private ofId?: number;

  porCelula = computed(() => {
    const map: Record<Celula, ParTablero[]> = {
      CORTE: [], GUARNICION: [], ALMACEN: [], INYECCION: [], PT: [],
    };
    for (const p of this.pares()) {
      if (p.estado === 'EN_PROCESO') map[p.celulaActual].push(p);
    }
    return map;
  });
  terminados = computed(() => this.pares().filter((p) => p.estado === 'TERMINADO'));

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap.get('ofId');
    this.ofId = q ? Number(q) : undefined;
    this.cargar();
  }

  cargar(): void {
    this.api.tablero(this.ofId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe((p) => this.pares.set(p));
  }
}
```

> Refresco: en D5 el tablero se actualiza con el botón "Actualizar" (manual). Polling automático queda como mejora opcional; mantenerlo simple para la demo.

- [ ] **Step 2: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/features/fabricacion/tablero.component.ts
git commit -m "feat(mes): tablero kanban de fabricación (6 columnas)"
```

---

## Task 11: Frontend — Pantalla de operario (escaneo + avanzar)

**Files:**
- Create: `frontend/src/app/features/fabricacion/pantalla-operario.component.ts`

- [ ] **Step 1: Crear el componente de pantalla de operario**

Crear `frontend/src/app/features/fabricacion/pantalla-operario.component.ts`:

```typescript
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FabricacionApi } from '../../core/api/fabricacion.api';
import {
  Celula, Operario, Maquina, ParDetalle, ORDEN_CELULAS, LABEL_CELULA, siguienteCelulaLabel,
} from '../../core/api/models/fabricacion.models';

@Component({
  selector: 'app-pantalla-operario',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="page">
      <div class="page-header"><div class="ph-title">Puesto de trabajo</div></div>

      <div class="card"><div class="card-body puesto">
        <label>Célula
          <select [(ngModel)]="celula" (ngModelChange)="onCelula()">
            @for (c of celulas; track c) { <option [value]="c">{{ label(c) }}</option> }
          </select>
        </label>
        <label>Operario
          <select [(ngModel)]="operarioId">
            @for (o of operarios(); track o.id) { <option [value]="o.id">{{ o.nombre }}</option> }
          </select>
        </label>
        <label>Máquina
          <select [(ngModel)]="maquinaId">
            @for (m of maquinas(); track m.id) { <option [value]="m.id">{{ m.nombre }}</option> }
          </select>
        </label>
      </div></div>

      <div class="card"><div class="card-body">
        <label class="scan-label">Escanear código del par
          <input #scan class="scan-input mono" [(ngModel)]="codigo"
                 (keyup.enter)="buscar()" placeholder="OF5-0001" autofocus />
        </label>
        @if (msg(); as m) { <div class="msg" [class.err]="esError()">{{ m }}</div> }

        @if (par(); as p) {
          <div class="par-card">
            <div class="mono big">{{ p.codigo }}</div>
            <div class="cell-sub">OF-{{ p.of.consecutivo }} · Talla {{ p.talla.valor }} · en {{ label(p.celulaActual) }}</div>
            @if (p.estado === 'TERMINADO') {
              <span class="badge badge-accent">ya terminado</span>
            } @else if (siguiente(p)) {
              <button class="btn btn-primary" (click)="avanzar(p)">Avanzar a {{ siguiente(p) }} →</button>
            } @else {
              <button class="btn btn-primary" (click)="avanzar(p)">Terminar (cargar a PT) ✓</button>
            }
          </div>
        }
      </div></div>
    </div>
  `,
  styles: [`
    .puesto{display:flex;gap:var(--sp-4);flex-wrap:wrap}
    .puesto label,.scan-label{display:flex;flex-direction:column;gap:var(--sp-1);font-size:var(--text-caption);color:var(--text-subtle)}
    select,.scan-input{padding:var(--sp-2);border:var(--bw) solid var(--border);border-radius:var(--radius-sm);font-size:var(--text-sm)}
    .scan-input{font-size:var(--text-lg);max-width:280px}
    .msg{margin-top:var(--sp-3);color:var(--accent)}
    .msg.err{color:var(--danger)}
    .par-card{margin-top:var(--sp-4);display:flex;flex-direction:column;gap:var(--sp-2);align-items:flex-start}
    .big{font-size:var(--text-xl)}
    .mono{font-family:var(--font-mono)}
  `],
})
export class PantallaOperarioComponent implements OnInit {
  private readonly api = inject(FabricacionApi);
  private readonly destroyRef = inject(DestroyRef);

  readonly celulas: Celula[] = ORDEN_CELULAS;
  label = (c: Celula) => LABEL_CELULA[c];
  siguiente = (p: ParDetalle) => siguienteCelulaLabel(p.celulaActual);

  celula: Celula = 'CORTE';
  operarioId?: number;
  maquinaId?: number;
  codigo = '';
  operarios = signal<Operario[]>([]);
  maquinas = signal<Maquina[]>([]);
  par = signal<ParDetalle | null>(null);
  msg = signal<string | null>(null);
  esError = signal(false);

  ngOnInit(): void {
    this.onCelula();
  }

  onCelula(): void {
    this.api.operarios(this.celula).pipe(takeUntilDestroyed(this.destroyRef)).subscribe((o) => {
      this.operarios.set(o);
      this.operarioId = o[0]?.id;
    });
    this.api.maquinas(this.celula).pipe(takeUntilDestroyed(this.destroyRef)).subscribe((m) => {
      this.maquinas.set(m);
      this.maquinaId = m[0]?.id;
    });
  }

  buscar(): void {
    const c = this.codigo.trim();
    if (!c) return;
    this.par.set(null);
    this.msg.set(null);
    this.api.par(c).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (p) => this.par.set(p),
      error: () => { this.esError.set(true); this.msg.set(`Par ${c} no encontrado`); },
    });
  }

  avanzar(p: ParDetalle): void {
    if (this.operarioId == null || this.maquinaId == null) {
      this.esError.set(true);
      this.msg.set('Seleccioná operario y máquina');
      return;
    }
    this.api.avanzar(p.codigo, this.operarioId, this.maquinaId)
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: () => {
          this.esError.set(false);
          this.msg.set(`Par ${p.codigo} avanzado ✓`);
          this.par.set(null);
          this.codigo = '';
        },
        error: (e) => {
          this.esError.set(true);
          this.msg.set(e?.error?.message ?? 'No se pudo avanzar el par');
        },
      });
  }
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/features/fabricacion/pantalla-operario.component.ts
git commit -m "feat(mes): pantalla de operario (contexto de puesto + escaneo + avanzar)"
```

---

## Task 12: Frontend — lista de OF + rutas + navegación

**Files:**
- Create: `frontend/src/app/features/fabricacion/of-list.component.ts`
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/layout/shell/shell.component.ts`

- [ ] **Step 1: Crear la lista de OF**

Crear `frontend/src/app/features/fabricacion/of-list.component.ts`:

```typescript
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FabricacionApi } from '../../core/api/fabricacion.api';
import { OFListItem } from '../../core/api/models/fabricacion.models';

@Component({
  selector: 'app-of-list',
  standalone: true,
  imports: [DatePipe, RouterLink],
  template: `
    <div class="page">
      <div class="page-header"><div class="ph-title">Órdenes de Fabricación</div></div>
      <div class="card"><div class="card-body">
        @if (ofs().length) {
          <table class="tbl">
            <thead><tr><th>OF</th><th>OP</th><th>Pares</th><th>Estado</th><th>Fecha</th><th></th></tr></thead>
            <tbody>
              @for (o of ofs(); track o.id) {
                <tr>
                  <td class="mono">OF-{{ o.consecutivo }}</td>
                  <td class="mono">OP-{{ o.op.consecutivo }}</td>
                  <td>{{ o._count.pares }}</td>
                  <td><span class="badge">{{ o.estado }}</span></td>
                  <td>{{ o.fecha | date:'dd MMM y' }}</td>
                  <td><a class="btn btn-sm" [routerLink]="['/fabricacion/tablero']" [queryParams]="{ ofId: o.id }">Ver tablero</a></td>
                </tr>
              }
            </tbody>
          </table>
        } @else {
          <div class="empty"><h4>Sin OF todavía</h4><p class="cell-sub">Generá una OF desde el detalle de una OP con producción pendiente.</p></div>
        }
      </div></div>
    </div>
  `,
  styles: [`
    .tbl{width:100%;border-collapse:collapse}
    .tbl th{text-align:left;font-size:var(--text-caption);color:var(--text-subtle);font-weight:var(--fw-medium);padding:0 0 var(--sp-2);border-bottom:var(--bw) solid var(--border)}
    .tbl td{padding:var(--sp-3) var(--sp-3) var(--sp-3) 0;border-bottom:var(--bw) solid var(--border);font-size:var(--text-sm)}
    .mono{font-family:var(--font-mono)}
  `],
})
export class OfListComponent implements OnInit {
  private readonly api = inject(FabricacionApi);
  private readonly destroyRef = inject(DestroyRef);
  ofs = signal<OFListItem[]>([]);

  ngOnInit(): void {
    this.api.listarOF().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((o) => this.ofs.set(o));
  }
}
```

- [ ] **Step 2: Agregar las rutas de fabricación**

En `frontend/src/app/app.routes.ts`, dentro del array `children` (después de la ruta `compras/requerimiento/:id`), agregar:

```typescript
      { path: 'fabricacion', loadComponent: () => import('./features/fabricacion/of-list.component').then(m => m.OfListComponent) },
      { path: 'fabricacion/operario', loadComponent: () => import('./features/fabricacion/pantalla-operario.component').then(m => m.PantallaOperarioComponent) },
      { path: 'fabricacion/tablero', loadComponent: () => import('./features/fabricacion/tablero.component').then(m => m.FabricacionTableroComponent) },
      { path: 'fabricacion/par/:codigo', loadComponent: () => import('./features/fabricacion/par-detalle.component').then(m => m.ParDetalleComponent) },
```

- [ ] **Step 3: Agregar ítems de navegación en el shell**

En `frontend/src/app/layout/shell/shell.component.ts`, dentro del `nav-group` "Operación" (después del `<a>` de Despachos), agregar dos ítems:

```html
          <a class="nav-item" routerLink="/fabricacion/tablero" routerLinkActive="is-active">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="5" height="16"/><rect x="10" y="4" width="5" height="10"/><rect x="17" y="4" width="4" height="7"/></svg></span>
            <span class="nav-label">Tablero de fabricación</span>
          </a>
          <a class="nav-item" routerLink="/fabricacion/operario" routerLinkActive="is-active">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h13l5 5v5h-2M3 7v10h2M9 7V4h4v3"/><circle cx="7" cy="17" r="2"/><circle cx="18" cy="17" r="2"/></svg></span>
            <span class="nav-label">Puesto de operario</span>
          </a>
```
> Si el `<a>` de Despachos tiene una estructura con `</a>` de cierre en línea propia, insertá los dos bloques inmediatamente después de ese cierre, manteniendo la indentación del grupo.

- [ ] **Step 4: Verificar que compila y arranca el front**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: sin errores. (El arranque real se valida en Task 14.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/fabricacion/of-list.component.ts frontend/src/app/app.routes.ts frontend/src/app/layout/shell/shell.component.ts
git commit -m "feat(mes): lista de OF + rutas fabricación + navegación"
```

---

## Task 13: Frontend — botón "Generar OF / Ver OF" en detalle de OP

**Files:**
- Modify: `frontend/src/app/features/pedidos/op/op-detalle.component.ts`

- [ ] **Step 1: Leer el componente actual**

Run: `sed -n '1,80p' frontend/src/app/features/pedidos/op/op-detalle.component.ts`
Identificar: cómo carga la OP (signal del detalle), cómo detecta `cantAProducir > 0` (probablemente ya lo usa para "Calcular requerimientos" de Demo 4) y dónde está la barra de acciones del header.

- [ ] **Step 2: Inyectar `FabricacionApi` y `Router` y agregar el handler**

En la clase del componente, agregar (junto a las demás inyecciones):
```typescript
  private readonly fabricacionApi = inject(FabricacionApi);
  // (Router ya suele estar inyectado; si no: private readonly router = inject(Router);)
  ofId = signal<number | null>(null);     // id de OF existente si la OP ya tiene
  generandoOF = signal(false);
```
Imports al tope del archivo:
```typescript
import { FabricacionApi } from '../../../core/api/fabricacion.api';
import { Router } from '@angular/router';
```
Handler:
```typescript
  generarOF(opId: number): void {
    if (this.generandoOF()) return;
    this.generandoOF.set(true);
    this.fabricacionApi.generarOF(opId).subscribe({
      next: (of) => this.router.navigate(['/fabricacion/tablero'], { queryParams: { ofId: of.id } }),
      error: (e) => { this.generandoOF.set(false); alert(e?.error?.message ?? 'No se pudo generar la OF'); },
    });
  }
```
> El proyecto tiene **deuda pendiente** de un sistema de toasts (ver `botas-frontend`); acá se usa `alert` provisorio igual que otras acciones, o el patrón de error que ya use `op-detalle`. Si `op-detalle` ya tiene un signal de error en UI, reusarlo en vez de `alert`.

- [ ] **Step 3: Agregar el botón en el template (en la barra de acciones del header de la OP)**

Donde estén los botones de acción de la OP (junto a "Calcular requerimientos" de D4), agregar — visible solo si hay producción pendiente. Reusar la condición existente de `cantAProducir > 0` del componente; si se llama distinto, adaptarla:

```html
        @if (tieneProduccionPendiente()) {
          <button class="btn btn-primary" [disabled]="generandoOF()" (click)="generarOF(op().id)">
            {{ generandoOF() ? 'Generando…' : 'Generar OF' }}
          </button>
        }
```
> Regla D5 (1 OP → 1 OF): el backend responde 409 si la OP ya tiene OF; el `alert`/mensaje de error lo comunica. (Mostrar un botón "Ver OF" persistente requeriría un GET extra de OF por OP — opcional, fuera del mínimo; el 409 cubre el caso.)
> `tieneProduccionPendiente()`: si el componente ya expone esta condición para D4, reusarla; si no, derivarla del detalle de la OP (`some(linea.tallas, t => t.cantAProducir > 0)`).

- [ ] **Step 4: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: sin errores.

- [ ] **Step 5: Correr la suite del front**

Run: `cd frontend && ng test --watch=false --browsers=ChromeHeadless`
Expected: PASS — toda la suite verde (incluye el spec de `FabricacionApi`).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/pedidos/op/op-detalle.component.ts
git commit -m "feat(mes): botón Generar OF en detalle de OP"
```

---

## Task 14: Verificación E2E manual + cierre

**Files:** (ninguno — verificación)

- [ ] **Step 1: Re-seed limpio**

Run: `cd backend && npm run seed:demo`
Expected: sin error; imprime la línea de OP-9005.

- [ ] **Step 2: Levantar backend y frontend**

Run (dos terminales):
```bash
cd backend && npm run start:dev    # :3001
cd frontend && npm start           # :4200
```
Expected: back compila y queda escuchando en 3001; front sirve en 4200.

- [ ] **Step 2b: Verificar suites completas una vez más**

Run: `cd backend && npm test` y `cd frontend && ng test --watch=false --browsers=ChromeHeadless`
Expected: ambas verdes. Anotar el conteo de tests (back/front) para la memoria.

- [ ] **Step 3: Flujo end-to-end en el navegador**

1. Login (usuario gerente: `gerente`/`gerente123`).
2. Ir a **Órdenes de Producción** → abrir **OP-9005** → click **"Generar OF"**.
3. Verificar que navega al **Tablero**: 12 pares en la columna **Corte**, resto vacías.
4. Ir a **Puesto de operario** → célula **Corte** (operario/máquina autocompletados) → escanear el código `OF{n}-0001` (verlo en el tablero o en el detalle) → **Avanzar a Guarnición**.
5. Volver al **Tablero** → **Actualizar**: ese par ahora está en **Guarnición**.
6. Repetir el avance del mismo par por Guarnición → Almacén → Inyección → PT → **Terminar**.
7. Verificar que el par aparece en **Terminados** y que su **detalle** (click en el chip) muestra el **QR** y el **timeline** con las 5 etapas (operario/máquina/hora).
8. Verificar el cierre de ciclo: en la DB, `InventarioPT` sumó 1 al producto+talla del par en la bodega PROPIA.

Run (verificación de inventario):
```bash
cd backend && node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();(async()=>{const i=await p.inventarioPT.findMany({where:{cantDisponible:{gt:0}},include:{talla:true,bodega:true}});console.log(i.map(x=>({talla:x.talla.valor,bodega:x.bodega.codigo,disp:x.cantDisponible})));await p.\$disconnect()})()"
```
Expected: al menos una fila con `disp >= 1` para la talla del par terminado.

- [ ] **Step 4: Verificar reglas de error**

- Volver a abrir OP-9005 → **"Generar OF"** otra vez → debe mostrar error (409 "La OP ya tiene una OF").
- En Puesto de operario, escanear un código inexistente → mensaje "Par no encontrado".
- Escanear un par ya **TERMINADO** y avanzar → mensaje de error (409 "El par ya está terminado").

- [ ] **Step 5: Actualizar memoria del roadmap**

Actualizar `botas-roadmap.md`: marcar **Demo 5 — MES núcleo de trazabilidad** como implementada en `develop` (con conteo de tests y nota de E2E OK), y mover el "PRÓXIMO" a la siguiente demo (Calidad D6 / Indicadores D8). Registrar el driver = OP-9005 y los gotchas nuevos si aparecieron.

- [ ] **Step 6: Finalizar la branch**

Invocar la skill `superpowers:finishing-a-development-branch` para decidir merge a `develop` (patrón D2/D3/D4: merge no-ff) vs. PR.

---

## Self-Review (cobertura del spec)

- **Modelos (spec §4):** Task 1 crea los 5 modelos + 3 enums + 3 inversas. ✅
- **generarOF + materializar pares (spec §3, §5):** Task 2 (puro) + Task 3 (service). ✅
- **avanzar + evento + transición + cierre de ciclo a InventarioPT (spec §3, §5):** Task 4. ✅
- **Regla 1 OP→1 OF / 409 (spec §5, §7):** Task 3 (`generarOF` valida `ordenesFabricacion.length`). ✅
- **Lecturas: OF, par+timeline, tablero, catálogos (spec §5):** Task 5 + Task 6 (controller). ✅
- **Bodega PT = PROPIA mayor prioridad (spec §5):** Task 4 (`findFirst` orderBy prioridad asc). ✅
- **Frontend: API, tablero kanban, pantalla operario, par+QR, botón Generar OF (spec §6):** Tasks 8-13. ✅
- **Seed: operarios, máquinas, driver (spec §9):** Task 7 (OP-9005 por volumen, en vez de 9003). ✅
- **Errores/edge cases (spec §7):** cubiertos en tests (404/409/400) y verificación manual (Task 14 Step 4). ✅
- **Testing (spec §8):** unit puro (Task 2), service (Tasks 3-5), front API (Task 8), E2E manual (Task 14). Los specs de componentes Angular visuales se cubren con typecheck + E2E manual (patrón del repo, que no testea templates pesados con Karma salvo APIs/lógica). ✅

**Desvío documentado vs spec:** el spec sugería OP-9003 como driver "si su cantAProducir es chico"; se verificó que son 200 pares → el plan usa **OP-9005** (12 pares) dedicada. Coherente con la nota del spec §9.
