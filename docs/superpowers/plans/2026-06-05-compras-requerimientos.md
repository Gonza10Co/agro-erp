# Compras / Requerimientos de material (Demo 4) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Desde una OP, calcular el requerimiento de compra de insumos (necesidad neta = bruta − stock) explotando el BOM multinivel, y mostrarlo agrupado por proveedor.

**Architecture:** Backend NestJS (módulo nuevo `compras`) que **reusa** el resolver de BOM de Demo 2 (`resolverBom` + `BomLoaderService`) para la explosión multinivel; solo aporta la agregación (× `cantAProducir`), el cruce contra `InventarioMaterial` y el agrupado por proveedor. Frontend Angular: una vista de requerimiento (agrupada por proveedor) + un botón en el detalle de OP.

**Tech Stack:** NestJS 11, Prisma 7 (PostgreSQL), Jest (back), Angular 19 + signals, Karma (front).

**Spec:** `docs/superpowers/specs/2026-06-05-compras-requerimientos-design.md`

**Precondiciones de entorno:** Docker arriba con Postgres `agro-erp-pg` (:5433); `.env` del backend apunta a local. Branch de trabajo: `feat/compras-requerimientos` (crear desde `develop`).

---

## Task 0: Branch

- [ ] **Step 1: Crear la rama de trabajo**

Run:
```bash
cd "C:/Users/gonza/Documents/Freelance/Botas Agroindustriales/agro-erp"
git checkout develop && git pull --ff-only 2>$null; git checkout -b feat/compras-requerimientos
```
Expected: `Switched to a new branch 'feat/compras-requerimientos'`

---

## Task 1: Migración de schema (Proveedor, InventarioMaterial, RequerimientoCompra)

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create (auto): `backend/prisma/migrations/<timestamp>_compras_requerimientos/`

- [ ] **Step 1: Agregar el enum y `proveedorId` a Material**

En `backend/prisma/schema.prisma`, después del bloque `enum TipoMarca { ... }` (cerca de la línea 70) agregar:

```prisma
enum EstadoRequerimiento {
  CALCULADO
}
```

En `model Material { ... }`, agregar estos campos (junto a los demás escalares y relaciones):

```prisma
  proveedorId Int?
  proveedor   Proveedor? @relation(fields: [proveedorId], references: [id])

  inventario InventarioMaterial?
  lineasReq  RequerimientoCompraLinea[]
```

- [ ] **Step 2: Agregar la relación inversa en OrdenProduccion**

En `model OrdenProduccion { ... }`, agregar junto a `despacho Despacho?`:

```prisma
  requerimientos RequerimientoCompra[]
```

- [ ] **Step 3: Agregar los modelos nuevos al final del archivo**

```prisma
// ───────────────────────── Módulo 4: Compras / Requerimientos ─────────────────────────

model Proveedor {
  id        Int      @id @default(autoincrement())
  nit       String   @unique
  nombre    String
  ciudad    String?
  activo    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  materiales Material[]
  lineasReq  RequerimientoCompraLinea[]
}

model InventarioMaterial {
  id             Int      @id @default(autoincrement())
  materialId     Int      @unique
  material       Material @relation(fields: [materialId], references: [id])
  cantDisponible Decimal  @default(0) @db.Decimal(14, 4)
  updatedAt      DateTime @updatedAt
}

model RequerimientoCompra {
  id          Int                 @id @default(autoincrement())
  consecutivo Int                 @unique
  opId        Int
  op          OrdenProduccion     @relation(fields: [opId], references: [id])
  fecha       DateTime            @default(now())
  estado      EstadoRequerimiento @default(CALCULADO)
  createdAt   DateTime            @default(now())

  lineas RequerimientoCompraLinea[]

  @@index([opId])
}

model RequerimientoCompraLinea {
  id              Int                 @id @default(autoincrement())
  requerimientoId Int
  requerimiento   RequerimientoCompra @relation(fields: [requerimientoId], references: [id])
  materialId      Int
  material        Material            @relation(fields: [materialId], references: [id])
  proveedorId     Int?
  proveedor       Proveedor?          @relation(fields: [proveedorId], references: [id])
  cantNecesaria   Decimal             @db.Decimal(14, 4)
  cantDisponible  Decimal             @db.Decimal(14, 4)
  cantAComprar    Decimal             @db.Decimal(14, 4)

  @@index([requerimientoId])
}
```

- [ ] **Step 4: Crear y aplicar la migración**

Run (Docker debe estar arriba):
```bash
cd "C:/Users/gonza/Documents/Freelance/Botas Agroindustriales/agro-erp/backend"
npx prisma migrate dev --name compras_requerimientos
```
Expected: `Your database is now in sync with your schema.` y se genera la carpeta de migración. El Prisma Client se regenera (aparecen los tipos `Proveedor`, `InventarioMaterial`, `RequerimientoCompra`, `RequerimientoCompraLinea`).

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(compras): schema Proveedor + InventarioMaterial + RequerimientoCompra"
```

---

## Task 2: Helpers puros de cálculo (TDD)

Toda la lógica testeable sin DB: construir líneas netas y agrupar por proveedor. La explosión multinivel NO se testea acá (ya cubierta por `bom-resolver.spec.ts` de Demo 2).

**Files:**
- Create: `backend/src/compras/requerimiento-calculo.ts`
- Test: `backend/src/compras/requerimiento-calculo.spec.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/src/compras/requerimiento-calculo.spec.ts`:

```typescript
import {
  construirLineasRequerimiento,
  agruparPorProveedor,
  LineaSalida,
} from './requerimiento-calculo';

describe('construirLineasRequerimiento', () => {
  it('neto = max(0, necesaria − disponible)', () => {
    const bruto = new Map([[1, 100], [2, 50], [3, 30]]);
    const stock = new Map([[1, 30], [2, 80]]); // mat3 sin registro
    const prov = new Map<number, number | null>([[1, 7], [2, 7], [3, null]]);

    const lineas = construirLineasRequerimiento(bruto, stock, prov);

    expect(lineas).toEqual([
      { materialId: 1, proveedorId: 7, cantNecesaria: 100, cantDisponible: 30, cantAComprar: 70 },
      { materialId: 2, proveedorId: 7, cantNecesaria: 50, cantDisponible: 80, cantAComprar: 0 },
      { materialId: 3, proveedorId: null, cantNecesaria: 30, cantDisponible: 0, cantAComprar: 30 },
    ]);
  });

  it('descarta materiales con necesaria == 0', () => {
    const lineas = construirLineasRequerimiento(
      new Map([[1, 0], [2, 5]]),
      new Map(),
      new Map<number, number | null>([[1, null], [2, null]]),
    );
    expect(lineas.map((l) => l.materialId)).toEqual([2]);
  });
});

describe('agruparPorProveedor', () => {
  const linea = (over: Partial<LineaSalida>): LineaSalida => ({
    materialId: 1, materialCodigo: 'M1', materialNombre: 'Mat 1',
    proveedorId: 7, proveedorNombre: 'Curtiembre XYZ',
    cantNecesaria: 10, cantDisponible: 0, cantAComprar: 10, ...over,
  });

  it('agrupa por proveedor y manda los sin-proveedor al final', () => {
    const grupos = agruparPorProveedor([
      linea({ materialId: 1, proveedorId: 7, proveedorNombre: 'Curtiembre XYZ' }),
      linea({ materialId: 2, proveedorId: null, proveedorNombre: null }),
      linea({ materialId: 3, proveedorId: 7, proveedorNombre: 'Curtiembre XYZ' }),
    ]);

    expect(grupos.map((g) => g.proveedor?.nombre ?? null)).toEqual([
      'Curtiembre XYZ',
      null,
    ]);
    expect(grupos[0].lineas.map((l) => l.materialId)).toEqual([1, 3]);
    expect(grupos[1].lineas.map((l) => l.materialId)).toEqual([2]);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd backend && npx jest src/compras/requerimiento-calculo.spec.ts`
Expected: FAIL — `Cannot find module './requerimiento-calculo'`.

- [ ] **Step 3: Implementar los helpers**

Crear `backend/src/compras/requerimiento-calculo.ts`:

```typescript
/** Línea persistible del requerimiento (lo que va a RequerimientoCompraLinea). */
export interface LineaRequerimientoData {
  materialId: number;
  proveedorId: number | null;
  cantNecesaria: number;
  cantDisponible: number;
  cantAComprar: number;
}

/** Línea enriquecida para la respuesta/UI (con nombres). */
export interface LineaSalida extends LineaRequerimientoData {
  materialCodigo: string;
  materialNombre: string;
  proveedorNombre: string | null;
}

export interface GrupoRequerimiento {
  proveedor: { id: number; nombre: string } | null;
  lineas: LineaSalida[];
}

/**
 * Cruza necesidad bruta contra stock y arma las líneas netas.
 * Preserva el orden de inserción de `bruto`. Descarta materiales con necesaria == 0.
 */
export function construirLineasRequerimiento(
  bruto: Map<number, number>,
  stock: Map<number, number>,
  proveedorPorMaterial: Map<number, number | null>,
): LineaRequerimientoData[] {
  const out: LineaRequerimientoData[] = [];
  for (const [materialId, cantNecesaria] of bruto) {
    if (cantNecesaria <= 0) continue;
    const cantDisponible = stock.get(materialId) ?? 0;
    out.push({
      materialId,
      proveedorId: proveedorPorMaterial.get(materialId) ?? null,
      cantNecesaria,
      cantDisponible,
      cantAComprar: Math.max(0, cantNecesaria - cantDisponible),
    });
  }
  return out;
}

/**
 * Agrupa líneas de salida por proveedor, preservando el orden de primera aparición.
 * Las líneas sin proveedor (proveedorId == null) van a un grupo final.
 */
export function agruparPorProveedor(lineas: LineaSalida[]): GrupoRequerimiento[] {
  const conProv = new Map<number, GrupoRequerimiento>();
  const sinProv: LineaSalida[] = [];

  for (const l of lineas) {
    if (l.proveedorId == null) {
      sinProv.push(l);
      continue;
    }
    let g = conProv.get(l.proveedorId);
    if (!g) {
      g = { proveedor: { id: l.proveedorId, nombre: l.proveedorNombre ?? '' }, lineas: [] };
      conProv.set(l.proveedorId, g);
    }
    g.lineas.push(l);
  }

  const grupos = [...conProv.values()];
  if (sinProv.length) grupos.push({ proveedor: null, lineas: sinProv });
  return grupos;
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `cd backend && npx jest src/compras/requerimiento-calculo.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/compras/requerimiento-calculo.ts backend/src/compras/requerimiento-calculo.spec.ts
git commit -m "feat(compras): helpers puros de cálculo neto y agrupado por proveedor"
```

---

## Task 3: Exportar BomLoaderService para reuso

`ComprasService` necesita `BomLoaderService` (de `catalog`). Hay que exportarlo del módulo.

**Files:**
- Modify: `backend/src/catalog/catalog.module.ts`

- [ ] **Step 1: Agregar `exports`**

En `backend/src/catalog/catalog.module.ts`, agregar la línea `exports`:

```typescript
@Module({
  controllers: [BomController, CatalogController],
  providers: [BomLoaderService, CatalogService],
  exports: [BomLoaderService],
})
export class CatalogModule {}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/catalog/catalog.module.ts
git commit -m "chore(catalog): exportar BomLoaderService para reuso en compras"
```

---

## Task 4: ComprasService.calcularRequerimiento (TDD)

**Files:**
- Create: `backend/src/compras/compras.service.ts`
- Test: `backend/src/compras/compras.service.spec.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/src/compras/compras.service.spec.ts`:

```typescript
import { NotFoundException } from '@nestjs/common';
import { ComprasService } from './compras.service';

function opBase(over: any = {}) {
  return {
    id: 1,
    lineas: [
      {
        productoConfigurado: { referenciaId: 100, marcaId: 5, opciones: [{ opcionId: 9 }] },
        tallas: [
          { tallaId: 10, cantAProducir: 4, talla: { valor: 38 } },
          { tallaId: 11, cantAProducir: 0, talla: { valor: 39 } }, // no suma
        ],
      },
    ],
    ...over,
  };
}

describe('ComprasService.calcularRequerimiento', () => {
  const prisma: any = {
    ordenProduccion: { findUnique: jest.fn() },
    inventarioMaterial: { findMany: jest.fn() },
    material: { findMany: jest.fn() },
    requerimientoCompra: { aggregate: jest.fn(), create: jest.fn() },
  };
  prisma.$transaction = jest.fn((cb: any) => cb(prisma));
  // resolverBom para talla 38: 1 par consume 2 de mat 1 (COMPRADO)
  const bomLoader: any = { cargarEntrada: jest.fn().mockResolvedValue({}) };
  const service = new ComprasService(prisma, bomLoader);
  // mockear resolverBom vía spy del módulo:
  beforeEach(() => jest.clearAllMocks());

  it('404 si la OP no existe', async () => {
    prisma.ordenProduccion.findUnique.mockResolvedValue(null);
    await expect(service.calcularRequerimiento(1)).rejects.toThrow(NotFoundException);
  });

  it('acumula consumo × cantAProducir, resta stock y persiste', async () => {
    prisma.ordenProduccion.findUnique.mockResolvedValue(opBase());
    // resolverBom se mockea devolviendo comprados; lo inyectamos vía bomLoader+spy:
    jest.spyOn(service as any, 'resolver').mockReturnValue({
      comprados: [{ materialId: 1, consumo: 2 }],
    });
    prisma.inventarioMaterial.findMany.mockResolvedValue([
      { materialId: 1, cantDisponible: 3 },
    ]);
    prisma.material.findMany.mockResolvedValue([
      { id: 1, codigo: 'M1', nombreCanonico: 'Cuero', proveedorId: 7, proveedor: { id: 7, nombre: 'Curtiembre' } },
    ]);
    prisma.requerimientoCompra.aggregate.mockResolvedValue({ _max: { consecutivo: 0 } });
    prisma.requerimientoCompra.create.mockResolvedValue({ id: 50, consecutivo: 1, opId: 1, fecha: new Date() });

    const res = await service.calcularRequerimiento(1);

    // bruto = 2 × 4 = 8 ; disponible 3 ; aComprar 5
    const createArg = prisma.requerimientoCompra.create.mock.calls[0][0];
    expect(createArg.data.consecutivo).toBe(1);
    expect(createArg.data.lineas.create).toEqual([
      { materialId: 1, proveedorId: 7, cantNecesaria: 8, cantDisponible: 3, cantAComprar: 5 },
    ]);
    expect(res.grupos[0].proveedor.nombre).toBe('Curtiembre');
    expect(res.grupos[0].lineas[0].cantAComprar).toBe(5);
  });

  it('OP sin producción pendiente → requerimiento vacío', async () => {
    const op = opBase();
    op.lineas[0].tallas[0].cantAProducir = 0;
    prisma.ordenProduccion.findUnique.mockResolvedValue(op);
    prisma.requerimientoCompra.aggregate.mockResolvedValue({ _max: { consecutivo: 0 } });
    prisma.requerimientoCompra.create.mockResolvedValue({ id: 51, consecutivo: 1, opId: 1, fecha: new Date() });

    const res = await service.calcularRequerimiento(1);
    expect(res.grupos).toEqual([]);
    expect(prisma.requerimientoCompra.create.mock.calls[0][0].data.lineas.create).toEqual([]);
  });
});
```

> Nota de diseño: el service expone un método protegido `resolver(entrada)` que envuelve `resolverBom`, para poder espiarlo en tests sin tocar el resolver real. En producción simplemente delega.

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd backend && npx jest src/compras/compras.service.spec.ts`
Expected: FAIL — `Cannot find module './compras.service'`.

- [ ] **Step 3: Implementar el service**

Crear `backend/src/compras/compras.service.ts`:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BomLoaderService } from '../catalog/bom/bom-loader.service';
import { resolverBom } from '../catalog/bom/bom-resolver';
import { EntradaResolucion } from '../catalog/bom/bom-resolver.types';
import {
  construirLineasRequerimiento,
  agruparPorProveedor,
  LineaSalida,
} from './requerimiento-calculo';

type DecimalLike = { toNumber(): number } | number | null;
const num = (d: DecimalLike): number =>
  d == null ? 0 : typeof d === 'number' ? d : d.toNumber();

@Injectable()
export class ComprasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bomLoader: BomLoaderService,
  ) {}

  /** Envoltorio espiable del resolver puro de Demo 2. */
  protected resolver(entrada: EntradaResolucion) {
    return resolverBom(entrada);
  }

  async calcularRequerimiento(opId: number) {
    const op = await this.prisma.ordenProduccion.findUnique({
      where: { id: opId },
      include: {
        lineas: {
          include: {
            productoConfigurado: { include: { opciones: true } },
            tallas: { include: { talla: true } },
          },
        },
      },
    });
    if (!op) throw new NotFoundException(`OP ${opId} no existe`);

    // 1. Acumular necesidad bruta por material COMPRADO
    const bruto = new Map<number, number>();
    for (const linea of op.lineas as any[]) {
      const pc = linea.productoConfigurado;
      const opcionIds = pc.opciones.map((o: any) => o.opcionId);
      for (const t of linea.tallas as any[]) {
        if (t.cantAProducir <= 0) continue;
        const entrada = await this.bomLoader.cargarEntrada({
          referenciaId: pc.referenciaId,
          marcaId: pc.marcaId,
          opcionIds,
          talla: t.talla.valor,
        });
        const { comprados } = this.resolver(entrada);
        for (const c of comprados) {
          bruto.set(c.materialId, (bruto.get(c.materialId) ?? 0) + c.consumo * t.cantAProducir);
        }
      }
    }

    // 2. Cargar stock + materiales (proveedor/nombre) de los materiales con bruto > 0
    const ids = [...bruto.keys()];
    const [stockRows, materialRows] = await Promise.all([
      ids.length
        ? this.prisma.inventarioMaterial.findMany({ where: { materialId: { in: ids } } })
        : Promise.resolve([]),
      ids.length
        ? this.prisma.material.findMany({
            where: { id: { in: ids } },
            select: {
              id: true, codigo: true, nombreCanonico: true,
              proveedorId: true, proveedor: { select: { id: true, nombre: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const stock = new Map<number, number>(
      (stockRows as any[]).map((r) => [r.materialId, num(r.cantDisponible)]),
    );
    const proveedorPorMaterial = new Map<number, number | null>(
      (materialRows as any[]).map((m) => [m.id, m.proveedorId ?? null]),
    );
    const matInfo = new Map<number, any>((materialRows as any[]).map((m) => [m.id, m]));

    // 3. Líneas netas
    const lineasData = construirLineasRequerimiento(bruto, stock, proveedorPorMaterial);

    // 4. Persistir + responder agrupado
    const requerimiento = await this.prisma.$transaction(async (tx) => {
      const agg = await tx.requerimientoCompra.aggregate({ _max: { consecutivo: true } });
      const consecutivo = (agg._max.consecutivo ?? 0) + 1;
      return tx.requerimientoCompra.create({
        data: {
          consecutivo,
          opId: op.id,
          lineas: { create: lineasData },
        },
      });
    });

    const lineasSalida: LineaSalida[] = lineasData.map((l) => {
      const m = matInfo.get(l.materialId);
      return {
        ...l,
        materialCodigo: m?.codigo ?? '',
        materialNombre: m?.nombreCanonico ?? '',
        proveedorNombre: m?.proveedor?.nombre ?? null,
      };
    });

    return {
      id: requerimiento.id,
      consecutivo: requerimiento.consecutivo,
      opId: requerimiento.opId,
      fecha: requerimiento.fecha,
      grupos: agruparPorProveedor(lineasSalida),
    };
  }

  async obtener(id: number) {
    const r = await this.prisma.requerimientoCompra.findUnique({
      where: { id },
      include: {
        lineas: {
          include: {
            material: { select: { codigo: true, nombreCanonico: true } },
            proveedor: { select: { id: true, nombre: true } },
          },
        },
      },
    });
    if (!r) throw new NotFoundException(`Requerimiento ${id} no existe`);
    const lineasSalida: LineaSalida[] = (r.lineas as any[]).map((l) => ({
      materialId: l.materialId,
      proveedorId: l.proveedorId,
      cantNecesaria: num(l.cantNecesaria),
      cantDisponible: num(l.cantDisponible),
      cantAComprar: num(l.cantAComprar),
      materialCodigo: l.material.codigo,
      materialNombre: l.material.nombreCanonico,
      proveedorNombre: l.proveedor?.nombre ?? null,
    }));
    return {
      id: r.id, consecutivo: r.consecutivo, opId: r.opId, fecha: r.fecha,
      grupos: agruparPorProveedor(lineasSalida),
    };
  }

  listarPorOp(opId: number) {
    return this.prisma.requerimientoCompra.findMany({
      where: { opId },
      orderBy: { consecutivo: 'desc' },
      select: { id: true, consecutivo: true, fecha: true },
    });
  }

  listarProveedores() {
    return this.prisma.proveedor.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
      select: { id: true, nit: true, nombre: true, ciudad: true },
    });
  }

  listarInventarioMaterial() {
    return this.prisma.inventarioMaterial.findMany({
      include: { material: { select: { codigo: true, nombreCanonico: true } } },
      orderBy: { materialId: 'asc' },
    });
  }
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `cd backend && npx jest src/compras/compras.service.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/compras/compras.service.ts backend/src/compras/compras.service.spec.ts
git commit -m "feat(compras): ComprasService.calcularRequerimiento reusando resolverBom"
```

---

## Task 5: Controller + Module + registro en AppModule

**Files:**
- Create: `backend/src/compras/compras.controller.ts`
- Create: `backend/src/compras/compras.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Crear el controller**

Crear `backend/src/compras/compras.controller.ts`:

```typescript
import { Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ComprasService } from './compras.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class ComprasController {
  constructor(private readonly service: ComprasService) {}

  @Post('ops/:id/requerimiento')
  calcular(@Param('id', ParseIntPipe) id: number) {
    return this.service.calcularRequerimiento(id);
  }

  @Get('requerimientos/:id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.service.obtener(id);
  }

  @Get('requerimientos')
  listar(@Query('opId', ParseIntPipe) opId: number) {
    return this.service.listarPorOp(opId);
  }

  @Get('proveedores')
  proveedores() {
    return this.service.listarProveedores();
  }

  @Get('inventario-material')
  inventarioMaterial() {
    return this.service.listarInventarioMaterial();
  }
}
```

- [ ] **Step 2: Crear el module**

Crear `backend/src/compras/compras.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { ComprasController } from './compras.controller';
import { ComprasService } from './compras.service';

@Module({
  imports: [CatalogModule],
  controllers: [ComprasController],
  providers: [ComprasService],
})
export class ComprasModule {}
```

- [ ] **Step 3: Registrar en AppModule**

En `backend/src/app.module.ts`, agregar el import y sumarlo a `imports`:

```typescript
import { ComprasModule } from './compras/compras.module';
```
y en el array `imports`, después de `DespachoModule,` agregar:
```typescript
    ComprasModule,
```

- [ ] **Step 4: Verificar que el backend compila y arranca**

Run:
```bash
cd backend && npx tsc --noEmit
```
Expected: sin errores. (Opcional: `npm run start` y verificar que levanta en :3001 sin errores de DI.)

- [ ] **Step 5: Commit**

```bash
git add backend/src/compras/compras.controller.ts backend/src/compras/compras.module.ts backend/src/app.module.ts
git commit -m "feat(compras): controller + module + registro en AppModule"
```

---

## Task 6: Seed de demo (proveedores, proveedor preferido, stock de insumos)

**Files:**
- Modify: `backend/prisma/seed-demo.ts`

- [ ] **Step 1: Leer el seed actual para ubicar materiales COMPRADO y una OP con producción pendiente**

Run: `cd backend && cat prisma/seed-demo.ts` (identificar: cómo se crean los `Material` COMPRADO, el material FABRICADO `plantilla PU` y su BOM, y la OP que queda con `cantAProducir > 0`).

- [ ] **Step 2: Agregar proveedores, asignar proveedor preferido y sembrar stock**

Al final del seed-demo (antes del cierre/`main().then`), agregar un bloque que:

1. Cree 2–3 proveedores con `upsert` por `nit`:
```typescript
const curtiembre = await prisma.proveedor.upsert({
  where: { nit: '900111111-1' },
  update: {},
  create: { nit: '900111111-1', nombre: 'Curtiembre Andina', ciudad: 'Bogotá' },
});
const quimicos = await prisma.proveedor.upsert({
  where: { nit: '900222222-2' },
  update: {},
  create: { nit: '900222222-2', nombre: 'Químicos del Tolima', ciudad: 'Ibagué' },
});
const herrajes = await prisma.proveedor.upsert({
  where: { nit: '900333333-3' },
  update: {},
  create: { nit: '900333333-3', nombre: 'Herrajes y Avíos SAS', ciudad: 'Medellín' },
});
```

2. Asigne `proveedorId` a materiales COMPRADO existentes por `codigo` (usar los códigos reales del seed; ejemplo de patrón):
```typescript
async function asignarProveedor(codigo: string, proveedorId: number) {
  await prisma.material.updateMany({ where: { codigo }, data: { proveedorId } });
}
// Ejemplos — reemplazar por los códigos COMPRADO reales del seed:
await asignarProveedor('CUERO-NEGRO', curtiembre.id);
await asignarProveedor('POLIOL', quimicos.id);
await asignarProveedor('ISOCIANATO', quimicos.id);
await asignarProveedor('OJALETE', herrajes.id);
// (dejar al menos UN material COMPRADO sin proveedor → grupo "Sin proveedor")
```

3. Siembre stock variado en `InventarioMaterial` con `upsert` por `materialId`. Apuntar a tres situaciones visibles en la demo: stock suficiente (neto 0), parcial (neto reducido) y sin registro (todo a comprar):
```typescript
async function stock(codigo: string, cant: number) {
  const m = await prisma.material.findUnique({ where: { codigo } });
  if (!m) return;
  await prisma.inventarioMaterial.upsert({
    where: { materialId: m.id },
    update: { cantDisponible: cant },
    create: { materialId: m.id, cantDisponible: cant },
  });
}
await stock('CUERO-NEGRO', 5);      // parcial
await stock('POLIOL', 100000);      // suficiente → neto 0
// ISOCIANATO sin registro → todo a comprar
```

> Requisito de la demo: asegurar que al menos un insumo del BOM sea **FABRICADO con su propio BOM** (plantilla PU) para que la explosión multinivel aporte comprados (poliol/isocianato). Si el seed actual ya lo tiene, no hace falta crearlo.

- [ ] **Step 3: Re-sembrar y verificar**

Run:
```bash
cd backend && npm run seed:demo
```
Expected: termina sin error. Verificación rápida:
```bash
npx prisma studio
```
Confirmar visualmente: `Proveedor` (3 filas), `Material.proveedorId` poblado en los COMPRADO elegidos, `InventarioMaterial` con las filas sembradas.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/seed-demo.ts
git commit -m "feat(compras): seed de proveedores, proveedor preferido y stock de insumos"
```

---

## Task 7: Frontend — API + modelos

**Files:**
- Create: `frontend/src/app/core/api/models/compras.models.ts`
- Create: `frontend/src/app/core/api/compras.api.ts`
- Test: `frontend/src/app/core/api/compras.api.spec.ts`

- [ ] **Step 1: Crear los modelos**

Crear `frontend/src/app/core/api/models/compras.models.ts`:

```typescript
export interface LineaRequerimiento {
  materialId: number;
  materialCodigo: string;
  materialNombre: string;
  proveedorId: number | null;
  proveedorNombre: string | null;
  cantNecesaria: number;
  cantDisponible: number;
  cantAComprar: number;
}

export interface GrupoRequerimiento {
  proveedor: { id: number; nombre: string } | null;
  lineas: LineaRequerimiento[];
}

export interface Requerimiento {
  id: number;
  consecutivo: number;
  opId: number;
  fecha: string;
  grupos: GrupoRequerimiento[];
}
```

- [ ] **Step 2: Escribir el test que falla**

Crear `frontend/src/app/core/api/compras.api.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComprasApi } from './compras.api';
import { environment } from '../../../environments/environment';

describe('ComprasApi', () => {
  let api: ComprasApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ComprasApi, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ComprasApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('POST calcula el requerimiento de una OP', () => {
    api.calcular(7).subscribe();
    const req = http.expectOne(`${environment.apiUrl}/ops/7/requerimiento`);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 1, consecutivo: 1, opId: 7, fecha: '', grupos: [] });
  });

  it('GET obtiene un requerimiento por id', () => {
    api.obtener(1).subscribe();
    const req = http.expectOne(`${environment.apiUrl}/requerimientos/1`);
    expect(req.request.method).toBe('GET');
    req.flush({ id: 1, consecutivo: 1, opId: 7, fecha: '', grupos: [] });
  });
});
```

- [ ] **Step 3: Correr el test para verificar que falla**

Run: `cd frontend && npm test -- --watch=false --include='**/compras.api.spec.ts'`
Expected: FAIL — no existe `./compras.api`.

- [ ] **Step 4: Implementar la API**

Crear `frontend/src/app/core/api/compras.api.ts`:

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Requerimiento } from './models/compras.models';

@Injectable({ providedIn: 'root' })
export class ComprasApi {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  calcular(opId: number) {
    return this.http.post<Requerimiento>(`${this.base}/ops/${opId}/requerimiento`, {});
  }
  obtener(id: number) {
    return this.http.get<Requerimiento>(`${this.base}/requerimientos/${id}`);
  }
}
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `cd frontend && npm test -- --watch=false --include='**/compras.api.spec.ts'`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/core/api/compras.api.ts frontend/src/app/core/api/compras.api.spec.ts frontend/src/app/core/api/models/compras.models.ts
git commit -m "feat(compras): ComprasApi + modelos de requerimiento (front)"
```

---

## Task 8: Frontend — Vista del requerimiento (agrupada por proveedor)

**Files:**
- Create: `frontend/src/app/features/compras/requerimiento.component.ts`
- Test: `frontend/src/app/features/compras/requerimiento.component.spec.ts`
- Modify: `frontend/src/app/app.routes.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/app/features/compras/requerimiento.component.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { RequerimientoComponent } from './requerimiento.component';
import { ComprasApi } from '../../core/api/compras.api';
import { Requerimiento } from '../../core/api/models/compras.models';

const datos: Requerimiento = {
  id: 1, consecutivo: 1, opId: 7, fecha: '2026-06-05',
  grupos: [
    { proveedor: { id: 7, nombre: 'Curtiembre Andina' }, lineas: [
      { materialId: 1, materialCodigo: 'CUERO-NEGRO', materialNombre: 'Cuero negro', proveedorId: 7, proveedorNombre: 'Curtiembre Andina', cantNecesaria: 100, cantDisponible: 30, cantAComprar: 70 },
    ] },
    { proveedor: null, lineas: [
      { materialId: 9, materialCodigo: 'PEGANTE', materialNombre: 'Pegante', proveedorId: null, proveedorNombre: null, cantNecesaria: 5, cantDisponible: 0, cantAComprar: 5 },
    ] },
  ],
};

describe('RequerimientoComponent', () => {
  function setup(req: Requerimiento) {
    const api = { obtener: () => of(req) };
    TestBed.configureTestingModule({
      imports: [RequerimientoComponent],
      providers: [
        provideRouter([]),
        { provide: ComprasApi, useValue: api },
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: '1' })) } },
      ],
    });
    const fixture = TestBed.createComponent(RequerimientoComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renderiza un grupo por proveedor y el grupo "Sin proveedor"', () => {
    const el: HTMLElement = setup(datos).nativeElement;
    expect(el.textContent).toContain('Curtiembre Andina');
    expect(el.textContent).toContain('Sin proveedor');
    expect(el.textContent).toContain('CUERO-NEGRO');
    expect(el.textContent).toContain('70'); // a comprar
  });

  it('muestra estado vacío cuando no hay grupos', () => {
    const el: HTMLElement = setup({ ...datos, grupos: [] }).nativeElement;
    expect(el.textContent).toContain('Nada que comprar');
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd frontend && npm test -- --watch=false --include='**/requerimiento.component.spec.ts'`
Expected: FAIL — no existe el componente.

- [ ] **Step 3: Implementar el componente**

Crear `frontend/src/app/features/compras/requerimiento.component.ts` (sigue el patrón denso de `despachos-list.component.ts`, reusando tokens del DS):

```typescript
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ComprasApi } from '../../core/api/compras.api';
import { Requerimiento } from '../../core/api/models/compras.models';

@Component({
  selector: 'app-requerimiento',
  standalone: true,
  imports: [DatePipe, DecimalPipe, RouterLink],
  template: `
    <div class="page page-wide">
      @if (req(); as r) {
        <nav class="breadcrumb" style="margin-bottom:var(--sp-4)">
          <a routerLink="/pedidos/op">Órdenes de Producción</a><span class="sep">/</span>
          <a [routerLink]="['/pedidos/op', r.opId]">OP-{{ r.opId }}</a><span class="sep">/</span>
          <span class="current">Requerimiento REQ-{{ r.consecutivo }}</span>
        </nav>

        <div class="page-header"><div class="ph-title">Requerimiento de compra REQ-{{ r.consecutivo }}</div>
          <div class="cell-sub">Calculado {{ r.fecha | date:'dd MMM y' }}</div>
        </div>

        @if (r.grupos.length) {
          @for (g of r.grupos; track g.proveedor?.id ?? -1) {
            <div class="card" style="margin-bottom:var(--sp-4)">
              <div class="card-head" style="padding:var(--sp-4) var(--sp-5);border-bottom:var(--bw) solid var(--border)">
                <h3 style="font-size:var(--text-h3);font-weight:var(--fw-semibold)">
                  {{ g.proveedor?.nombre ?? 'Sin proveedor' }}
                </h3>
              </div>
              <div class="card-body">
                <table class="tbl">
                  <thead><tr><th>Insumo</th><th class="num">Necesita</th><th class="num">Stock</th><th class="num">A comprar</th></tr></thead>
                  <tbody>
                    @for (l of g.lineas; track l.materialId) {
                      <tr>
                        <td><span class="mono">{{ l.materialCodigo }}</span> · {{ l.materialNombre }}</td>
                        <td class="num">{{ l.cantNecesaria | number:'1.0-2' }}</td>
                        <td class="num">{{ l.cantDisponible | number:'1.0-2' }}</td>
                        <td class="num comprar" [class.cero]="l.cantAComprar === 0">{{ l.cantAComprar | number:'1.0-2' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }
        } @else {
          <div class="card"><div class="card-body"><div class="empty">
            <h4>Nada que comprar</h4>
            <p class="cell-sub">La OP está completamente cubierta por inventario.</p>
          </div></div></div>
        }
      } @else {
        <div class="card"><div class="card-body">Cargando requerimiento…</div></div>
      }
    </div>
  `,
  styles: [`
    .tbl{width:100%;border-collapse:collapse}
    .tbl th{text-align:left;font-size:var(--text-caption);color:var(--text-subtle);font-weight:var(--fw-medium);padding:0 var(--sp-3) var(--sp-2) 0;border-bottom:var(--bw) solid var(--border)}
    .tbl td{padding:var(--sp-3) var(--sp-3) var(--sp-3) 0;border-bottom:var(--bw) solid var(--border);font-size:var(--text-sm)}
    .tbl th.num,.tbl td.num{text-align:right;font-variant-numeric:tabular-nums}
    .mono{font-family:var(--font-mono)}
    .comprar{font-weight:var(--fw-semibold);color:var(--accent)}
    .comprar.cero{color:var(--text-subtle);font-weight:400}
  `],
})
export class RequerimientoComponent implements OnInit {
  private readonly api = inject(ComprasApi);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  req = signal<Requerimiento | null>(null);

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((p) => {
      const id = Number(p.get('id'));
      this.api.obtener(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe((r) => this.req.set(r));
    });
  }
}
```

- [ ] **Step 4: Agregar la ruta**

En `frontend/src/app/app.routes.ts`, dentro de los `children` del shell, después de la línea de `despachos`, agregar:

```typescript
      { path: 'compras/requerimiento/:id', loadComponent: () => import('./features/compras/requerimiento.component').then(m => m.RequerimientoComponent) },
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `cd frontend && npm test -- --watch=false --include='**/requerimiento.component.spec.ts'`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/compras frontend/src/app/app.routes.ts
git commit -m "feat(compras): vista de requerimiento agrupada por proveedor + ruta"
```

---

## Task 9: Frontend — Botón "Calcular requerimientos" en el detalle de OP

**Files:**
- Modify: `frontend/src/app/features/pedidos/op/op-detalle.component.ts`
- Test: `frontend/src/app/features/pedidos/op/op-detalle.component.spec.ts`

- [ ] **Step 1: Escribir el test que falla**

En `frontend/src/app/features/pedidos/op/op-detalle.component.spec.ts`, agregar un test que verifique que al calcular el requerimiento se navega a la vista. Patrón (ajustar a los helpers de setup ya existentes en ese archivo):

```typescript
it('calcular requerimientos: POST y navega al requerimiento', () => {
  const compras = { calcular: jasmine.createSpy('calcular').and.returnValue(of({ id: 99, consecutivo: 1, opId: 1, fecha: '', grupos: [] })) };
  // ...registrar { provide: ComprasApi, useValue: compras } en el TestBed del archivo...
  // con una OP AMARRADA con producir > 0:
  component.requerir();
  expect(compras.calcular).toHaveBeenCalledWith(component.op()!.id);
  expect(router.navigateByUrl).toHaveBeenCalledWith('/compras/requerimiento/99');
});
```

> Si el spec de `op-detalle` ya mockea `Router` y `ComprasApi`, reusar esos mocks. Importar `of` de `rxjs` y `ComprasApi`.

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd frontend && npm test -- --watch=false --include='**/op-detalle.component.spec.ts'`
Expected: FAIL — `requerir` no existe / `ComprasApi` no provisto.

- [ ] **Step 3: Implementar en el componente**

En `op-detalle.component.ts`:

1. Import:
```typescript
import { ComprasApi } from '../../../core/api/compras.api';
```
2. Inyección (junto a los demás `inject`):
```typescript
  private readonly comprasApi = inject(ComprasApi);
```
3. Computed para visibilidad (junto a `despachable`):
```typescript
  requerible = computed(() => {
    const o = this.op();
    return !!o && o.estado !== 'ANULADA' && this.resumen().producir > 0;
  });
```
4. Método (junto a `despachar`):
```typescript
  requerir(): void {
    const o = this.op();
    if (!o || this.accion()) return;
    this.accion.set(true); this.error.set('');
    this.comprasApi.calcular(o.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (r) => { this.accion.set(false); this.router.navigateByUrl('/compras/requerimiento/' + r.id); },
      error: (e) => { this.accion.set(false); this.error.set(this.msg(e)); },
    });
  }
```
5. En el template, dentro del bloque `<div class="page-actions">` (donde están Despachar/Anular), agregar antes de "Anular OP":
```html
              @if (requerible()) {
                <button class="btn btn-secondary" type="button" [class.is-loading]="accion()" [disabled]="accion()" (click)="requerir()">Calcular requerimientos</button>
              }
```

> Nota: el bloque `page-actions` hoy solo se muestra cuando `o.estado === 'AMARRADA' || o.estado === 'CREADA'`. Eso cubre el caso de demo (OP con producción pendiente suele estar `AMARRADA`/`CREADA`). No ampliar la condición externa salvo que la demo lo exija.

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `cd frontend && npm test -- --watch=false --include='**/op-detalle.component.spec.ts'`
Expected: PASS (incluye el nuevo test).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/pedidos/op/op-detalle.component.ts frontend/src/app/features/pedidos/op/op-detalle.component.spec.ts
git commit -m "feat(compras): botón Calcular requerimientos en detalle de OP"
```

---

## Task 10: Suite completa + E2E manual

- [ ] **Step 1: Correr toda la suite de backend**

Run: `cd backend && npm test`
Expected: todos los suites en verde (incluidos los nuevos de `compras`).

- [ ] **Step 2: Correr toda la suite de frontend**

Run: `cd frontend && npm test -- --watch=false`
Expected: todos los specs en verde.

- [ ] **Step 3: E2E manual (Docker + back :3001 + front :4200)**

Levantar: Docker `agro-erp-pg`, `cd backend && npm run start`, `cd frontend && npm start`. Login con un usuario del seed.

Checklist:
- [ ] Abrir una OP con producción pendiente (`A producir > 0`) → aparece el botón **"Calcular requerimientos"**.
- [ ] Click → navega a `/compras/requerimiento/:id` y muestra la tabla **agrupada por proveedor**.
- [ ] Un insumo con stock suficiente sale con **A comprar = 0** (atenuado); uno sin stock sale con todo a comprar.
- [ ] Se ve un grupo **"Sin proveedor"** para el comprado sin proveedor preferido.
- [ ] La explosión **multinivel** se refleja: aparecen comprados que provienen del semielaborado FABRICADO (poliol/isocianato de la plantilla PU).
- [ ] Abrir una OP **100% amarrada** (`A producir = 0`) → el botón no aparece (o el requerimiento sale con estado vacío "Nada que comprar").

- [ ] **Step 4: Commit final / cierre de rama**

```bash
git add -A && git commit -m "test(compras): verificación de suite completa Demo 4" --allow-empty
```
Seguir con la sub-skill `superpowers:finishing-a-development-branch` para decidir merge a `develop`/`master` y tag `demo-4`.

---

## Notas de cierre

- **Reuso**: la explosión multinivel/overrides/merma es de Demo 2 (`bom-resolver.ts`); este módulo solo orquesta y agrega. No duplicar esa lógica.
- **Números**: cálculo en `number` (como el resolver), persistencia en columnas `Decimal`.
- **Fuera de alcance** (futuro): reserva de stock de insumos, orden de compra formal + recepción, consolidado multi-OP, catálogo N:M con precios/lead-time, inventario por bodega. Ver §10 del spec.
