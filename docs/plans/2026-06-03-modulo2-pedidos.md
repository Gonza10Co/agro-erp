# Módulo 2 — Pedidos (OC → OP → amarre PT) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el tramo OC → OP del ciclo de pedido, donde la OP cruza el inventario de Producto Terminado y "amarra" (reserva) lo disponible, calculando lo que falta producir por talla y bodega.

**Architecture:** NestJS + Prisma sobre PostgreSQL. La lógica de amarre vive en una **función pura** (`amarre.ts`, testeable sin DB, como `bom-resolver.ts` del Módulo 1). Los services orquestan Prisma; el amarre y la anulación corren en **transacción única**. Tests unitarios con mocks de Prisma (el repo no usa DB en jest).

**Tech Stack:** NestJS 11, Prisma 7.8 (`prisma migrate dev`), class-validator/class-transformer, Jest + ts-jest.

**Spec:** `docs/specs/2026-06-03-modulo2-pedidos-oc-op-design.md`

---

## File Structure

```
backend/prisma/schema.prisma                      (modificar: enums + 10 modelos + fix Marca.clienteId)
backend/src/
  clientes/
    clientes.module.ts                            (crear)
    clientes.service.ts                           (crear)
    clientes.service.spec.ts                      (crear)
    clientes.controller.ts                        (crear)
    dto/crear-cliente.dto.ts                      (crear)
  inventario/
    inventario.module.ts                          (crear)
    inventario.service.ts                         (crear)
    inventario.service.spec.ts                    (crear)
    inventario.controller.ts                      (crear)
    dto/crear-bodega.dto.ts                       (crear)
    dto/registrar-stock.dto.ts                    (crear)
  pedidos/
    oc/
      oc.module.ts                                (crear)
      oc.service.ts                               (crear)
      oc.service.spec.ts                          (crear)
      oc.controller.ts                            (crear)
      oc-validacion.ts                            (crear: validación pura de confirmación)
      oc-validacion.spec.ts                       (crear)
      dto/crear-oc.dto.ts                         (crear)
    op/
      op.module.ts                                (crear)
      op.service.ts                               (crear)
      op.service.spec.ts                          (crear)
      op.controller.ts                            (crear)
      amarre.ts                                   (crear: lógica pura de amarre)
      amarre.spec.ts                              (crear)
  app.module.ts                                   (modificar: registrar 4 módulos nuevos)
```

Responsabilidades:
- `amarre.ts` — lógica pura: repartir lo pedido contra disponibilidades por bodega (sin DB).
- `oc-validacion.ts` — lógica pura: reglas de confirmación de una OC (sin DB).
- `*.service.ts` — orquestación Prisma + transacciones.
- `*.controller.ts` — endpoints REST con `JwtAuthGuard`.

---

## Task 1: Schema Prisma — maestros, pedidos, reservas, enums

**Files:**
- Modify: `backend/prisma/schema.prisma` (append modelos + enums; modificar `Marca`)

- [ ] **Step 1: Agregar enums nuevos al final de `schema.prisma`**

```prisma
// ───────────────────────── Módulo 2: Pedidos (OC → OP) ─────────────────────────

enum TipoCredito {
  CONTADO
  D30
  D60
  D90
}

enum EstadoCartera {
  AL_DIA
  VENCIDO
  BLOQUEADO
}

enum TipoBodega {
  PROPIA
  HERMANA
}

enum EstadoOC {
  BORRADOR
  CONFIRMADA
  EN_PRODUCCION
  CERRADA
  ANULADA
}

enum EstadoOP {
  CREADA
  AMARRADA
  EN_PRODUCCION
  ANULADA
}
```

- [ ] **Step 2: Agregar modelos maestros (Cliente, Bodega) y enlazar Cliente↔Marca**

```prisma
model Cliente {
  id            Int           @id @default(autoincrement())
  nit           String        @unique
  nombre        String
  ciudad        String?
  tipoCredito   TipoCredito   @default(CONTADO)
  cupo          Decimal?      @db.Decimal(14, 2)
  estadoCartera EstadoCartera @default(AL_DIA)
  activo        Boolean       @default(true)
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  marcas       Marca[]
  ordenesCompra OrdenCompra[]
}

model Bodega {
  id        Int        @id @default(autoincrement())
  codigo    String     @unique
  nombre    String
  tipo      TipoBodega @default(PROPIA)
  prioridad Int        @default(100)
  activo    Boolean    @default(true)

  inventarioPT InventarioPT[]
}
```

- [ ] **Step 3: Modificar el modelo `Marca` para enlazar la relación con `Cliente`**

Buscar el modelo `Marca` existente. Tiene `clienteId Int?` sin relación. Agregar la relación (no cambiar el campo):

```prisma
// dentro de model Marca, junto a los demás campos:
  cliente   Cliente? @relation(fields: [clienteId], references: [id])
```

- [ ] **Step 4: Agregar modelos de pedido (OC) e inventario PT**

```prisma
model OrdenCompra {
  id           Int       @id @default(autoincrement())
  consecutivo  Int       @unique
  ocCliente    String?
  clienteId    Int
  cliente      Cliente   @relation(fields: [clienteId], references: [id])
  fecha        DateTime  @default(now())
  estado       EstadoOC  @default(BORRADOR)
  observaciones String?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  lineas          OrdenCompraLinea[]
  ordenProduccion OrdenProduccion?

  @@index([clienteId])
}

model OrdenCompraLinea {
  id                    Int                 @id @default(autoincrement())
  ocId                  Int
  oc                    OrdenCompra         @relation(fields: [ocId], references: [id])
  productoConfiguradoId Int
  productoConfigurado   ProductoConfigurado @relation(fields: [productoConfiguradoId], references: [id])

  tallas OrdenCompraLineaTalla[]

  @@index([ocId])
}

model OrdenCompraLineaTalla {
  id        Int              @id @default(autoincrement())
  ocLineaId Int
  ocLinea   OrdenCompraLinea @relation(fields: [ocLineaId], references: [id])
  tallaId   Int
  talla     Talla            @relation(fields: [tallaId], references: [id])
  cantidad  Int

  @@unique([ocLineaId, tallaId])
}

model InventarioPT {
  id                    Int                 @id @default(autoincrement())
  productoConfiguradoId Int
  productoConfigurado   ProductoConfigurado @relation(fields: [productoConfiguradoId], references: [id])
  tallaId               Int
  talla                 Talla               @relation(fields: [tallaId], references: [id])
  bodegaId              Int
  bodega                Bodega              @relation(fields: [bodegaId], references: [id])
  cantDisponible        Int                 @default(0)
  cantReservada         Int                 @default(0)

  reservas ReservaInventarioPT[]

  @@unique([productoConfiguradoId, tallaId, bodegaId])
  @@index([productoConfiguradoId, tallaId])
}
```

- [ ] **Step 5: Agregar modelos de OP y reservas**

```prisma
model OrdenProduccion {
  id          Int         @id @default(autoincrement())
  consecutivo Int         @unique
  ocId        Int         @unique
  oc          OrdenCompra @relation(fields: [ocId], references: [id])
  fecha       DateTime    @default(now())
  estado      EstadoOP    @default(CREADA)
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  lineas OrdenProduccionLinea[]
}

model OrdenProduccionLinea {
  id                    Int                 @id @default(autoincrement())
  opId                  Int
  op                    OrdenProduccion     @relation(fields: [opId], references: [id])
  productoConfiguradoId Int
  productoConfigurado   ProductoConfigurado @relation(fields: [productoConfiguradoId], references: [id])

  tallas OrdenProduccionLineaTalla[]

  @@index([opId])
}

model OrdenProduccionLineaTalla {
  id            Int                  @id @default(autoincrement())
  opLineaId     Int
  opLinea       OrdenProduccionLinea @relation(fields: [opLineaId], references: [id])
  tallaId       Int
  talla         Talla                @relation(fields: [tallaId], references: [id])
  cantPedida    Int
  cantAmarrada  Int                  @default(0)
  cantAProducir Int                  @default(0)

  reservas ReservaInventarioPT[]

  @@unique([opLineaId, tallaId])
}

model ReservaInventarioPT {
  id             Int                       @id @default(autoincrement())
  opLineaTallaId Int
  opLineaTalla   OrdenProduccionLineaTalla @relation(fields: [opLineaTallaId], references: [id])
  inventarioPTId Int
  inventarioPT   InventarioPT              @relation(fields: [inventarioPTId], references: [id])
  cantidad       Int

  @@index([opLineaTallaId])
  @@index([inventarioPTId])
}
```

Nota: `ProductoConfigurado` y `Talla` ganan relaciones inversas. Agregar a `model ProductoConfigurado`:
```prisma
  lineasOC      OrdenCompraLinea[]
  lineasOP      OrdenProduccionLinea[]
  inventarioPT  InventarioPT[]
```
Agregar a `model Talla`:
```prisma
  ocLineasTalla OrdenCompraLineaTalla[]
  opLineasTalla OrdenProduccionLineaTalla[]
  inventarioPT  InventarioPT[]
```

- [ ] **Step 6: Generar la migración y el cliente Prisma**

Run: `npx prisma migrate dev --name modulo2_pedidos`
Expected: crea `prisma/migrations/<timestamp>_modulo2_pedidos/` y regenera el client sin errores.

Run: `npx prisma generate`
Expected: "Generated Prisma Client" sin errores.

- [ ] **Step 7: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(pedidos): schema Modulo 2 (Cliente, Bodega, OC, OP, InventarioPT, reservas)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Lógica pura de amarre (`amarre.ts`)

**Files:**
- Create: `backend/src/pedidos/op/amarre.ts`
- Test: `backend/src/pedidos/op/amarre.spec.ts`

- [ ] **Step 1: Escribir el test que falla**

```typescript
// backend/src/pedidos/op/amarre.spec.ts
import { amarrarTalla, DisponibilidadBodega } from './amarre';

describe('amarrarTalla', () => {
  it('sin stock: amarra 0, todo a producir, sin reservas', () => {
    const r = amarrarTalla({ tallaId: 42, cantPedida: 100 }, []);
    expect(r).toEqual({
      tallaId: 42, cantPedida: 100, cantAmarrada: 0, cantAProducir: 100, reservas: [],
    });
  });

  it('stock suficiente en una bodega: amarra todo lo pedido', () => {
    const disp: DisponibilidadBodega[] = [{ bodegaId: 1, inventarioPTId: 10, disponible: 100, prioridad: 1 }];
    const r = amarrarTalla({ tallaId: 42, cantPedida: 30 }, disp);
    expect(r.cantAmarrada).toBe(30);
    expect(r.cantAProducir).toBe(0);
    expect(r.reservas).toEqual([{ inventarioPTId: 10, cantidad: 30 }]);
  });

  it('stock parcial: amarra lo disponible y deja el resto a producir', () => {
    const disp: DisponibilidadBodega[] = [{ bodegaId: 1, inventarioPTId: 10, disponible: 20, prioridad: 1 }];
    const r = amarrarTalla({ tallaId: 42, cantPedida: 50 }, disp);
    expect(r.cantAmarrada).toBe(20);
    expect(r.cantAProducir).toBe(30);
    expect(r.reservas).toEqual([{ inventarioPTId: 10, cantidad: 20 }]);
  });

  it('multi-bodega: consume por prioridad (menor primero) y reparte', () => {
    const disp: DisponibilidadBodega[] = [
      { bodegaId: 2, inventarioPTId: 22, disponible: 40, prioridad: 200 }, // HERMANA
      { bodegaId: 1, inventarioPTId: 11, disponible: 30, prioridad: 100 }, // PROPIA
    ];
    const r = amarrarTalla({ tallaId: 42, cantPedida: 50 }, disp);
    expect(r.cantAmarrada).toBe(50);
    expect(r.cantAProducir).toBe(0);
    // primero la de prioridad 100 (30), luego la 200 (20)
    expect(r.reservas).toEqual([
      { inventarioPTId: 11, cantidad: 30 },
      { inventarioPTId: 22, cantidad: 20 },
    ]);
  });

  it('ignora bodegas sin disponibilidad', () => {
    const disp: DisponibilidadBodega[] = [{ bodegaId: 1, inventarioPTId: 10, disponible: 0, prioridad: 1 }];
    const r = amarrarTalla({ tallaId: 42, cantPedida: 10 }, disp);
    expect(r.cantAmarrada).toBe(0);
    expect(r.reservas).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test para verificar que falla**

Run: `npx jest src/pedidos/op/amarre.spec.ts`
Expected: FAIL — "Cannot find module './amarre'".

- [ ] **Step 3: Implementar `amarre.ts`**

```typescript
// backend/src/pedidos/op/amarre.ts
export interface DisponibilidadBodega {
  bodegaId: number;
  inventarioPTId: number;
  disponible: number; // cantDisponible - cantReservada
  prioridad: number;  // menor = se consume primero
}

export interface SolicitudTalla {
  tallaId: number;
  cantPedida: number;
}

export interface ReservaCalculada {
  inventarioPTId: number;
  cantidad: number;
}

export interface ResultadoAmarreTalla {
  tallaId: number;
  cantPedida: number;
  cantAmarrada: number;
  cantAProducir: number;
  reservas: ReservaCalculada[];
}

export function amarrarTalla(
  solicitud: SolicitudTalla,
  disponibilidades: DisponibilidadBodega[],
): ResultadoAmarreTalla {
  const ordenadas = [...disponibilidades].sort((a, b) => a.prioridad - b.prioridad);
  let restante = solicitud.cantPedida;
  const reservas: ReservaCalculada[] = [];

  for (const d of ordenadas) {
    if (restante <= 0) break;
    const tomar = Math.min(restante, d.disponible);
    if (tomar > 0) {
      reservas.push({ inventarioPTId: d.inventarioPTId, cantidad: tomar });
      restante -= tomar;
    }
  }

  const cantAmarrada = solicitud.cantPedida - restante;
  return {
    tallaId: solicitud.tallaId,
    cantPedida: solicitud.cantPedida,
    cantAmarrada,
    cantAProducir: restante,
    reservas,
  };
}
```

- [ ] **Step 4: Run test para verificar que pasa**

Run: `npx jest src/pedidos/op/amarre.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/pedidos/op/amarre.ts backend/src/pedidos/op/amarre.spec.ts
git commit -m "feat(pedidos): logica pura de amarre por talla y bodega

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Módulo Clientes (CRUD mínimo)

**Files:**
- Create: `backend/src/clientes/dto/crear-cliente.dto.ts`, `clientes.service.ts`, `clientes.service.spec.ts`, `clientes.controller.ts`, `clientes.module.ts`

- [ ] **Step 1: Escribir el DTO**

```typescript
// backend/src/clientes/dto/crear-cliente.dto.ts
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum TipoCreditoDto { CONTADO = 'CONTADO', D30 = 'D30', D60 = 'D60', D90 = 'D90' }

export class CrearClienteDto {
  @IsString() nit!: string;
  @IsString() nombre!: string;
  @IsOptional() @IsString() ciudad?: string;
  @IsOptional() @IsEnum(TipoCreditoDto) tipoCredito?: TipoCreditoDto;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) cupo?: number;
}
```

- [ ] **Step 2: Escribir el test que falla**

```typescript
// backend/src/clientes/clientes.service.spec.ts
import { ConflictException } from '@nestjs/common';
import { ClientesService } from './clientes.service';

describe('ClientesService', () => {
  const prisma = { cliente: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() } } as any;
  const service = new ClientesService(prisma);
  beforeEach(() => jest.clearAllMocks());

  it('crea un cliente con los datos provistos', async () => {
    prisma.cliente.findUnique.mockResolvedValue(null);
    prisma.cliente.create.mockResolvedValue({ id: 1, nit: '900', nombre: 'ACME' });
    const r = await service.crear({ nit: '900', nombre: 'ACME' });
    expect(prisma.cliente.create).toHaveBeenCalledWith({
      data: { nit: '900', nombre: 'ACME', ciudad: undefined, tipoCredito: undefined, cupo: undefined },
    });
    expect(r).toMatchObject({ id: 1, nit: '900' });
  });

  it('rechaza NIT duplicado', async () => {
    prisma.cliente.findUnique.mockResolvedValue({ id: 1, nit: '900' });
    await expect(service.crear({ nit: '900', nombre: 'X' })).rejects.toBeInstanceOf(ConflictException);
  });
});
```

- [ ] **Step 3: Run test para verificar que falla**

Run: `npx jest src/clientes/clientes.service.spec.ts`
Expected: FAIL — "Cannot find module './clientes.service'".

- [ ] **Step 4: Implementar el service**

```typescript
// backend/src/clientes/clientes.service.ts
import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CrearClienteDto } from './dto/crear-cliente.dto';

@Injectable()
export class ClientesService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(dto: CrearClienteDto) {
    const existe = await this.prisma.cliente.findUnique({ where: { nit: dto.nit } });
    if (existe) throw new ConflictException(`Ya existe un cliente con NIT ${dto.nit}`);
    return this.prisma.cliente.create({
      data: {
        nit: dto.nit,
        nombre: dto.nombre,
        ciudad: dto.ciudad,
        tipoCredito: dto.tipoCredito,
        cupo: dto.cupo,
      },
    });
  }

  listar() {
    return this.prisma.cliente.findMany({ orderBy: { nombre: 'asc' } });
  }

  obtener(id: number) {
    return this.prisma.cliente.findUnique({ where: { id } });
  }
}
```

- [ ] **Step 5: Run test para verificar que pasa**

Run: `npx jest src/clientes/clientes.service.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Implementar controller y módulo**

```typescript
// backend/src/clientes/clientes.controller.ts
import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ClientesService } from './clientes.service';
import { CrearClienteDto } from './dto/crear-cliente.dto';

@UseGuards(JwtAuthGuard)
@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientes: ClientesService) {}

  @Post() crear(@Body() dto: CrearClienteDto) { return this.clientes.crear(dto); }
  @Get() listar() { return this.clientes.listar(); }
  @Get(':id') obtener(@Param('id', ParseIntPipe) id: number) { return this.clientes.obtener(id); }
}
```

```typescript
// backend/src/clientes/clientes.module.ts
import { Module } from '@nestjs/common';
import { ClientesController } from './clientes.controller';
import { ClientesService } from './clientes.service';

@Module({
  controllers: [ClientesController],
  providers: [ClientesService],
  exports: [ClientesService],
})
export class ClientesModule {}
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/clientes
git commit -m "feat(clientes): CRUD minimo de Cliente (crear/listar/obtener)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Módulo Inventario (Bodega + InventarioPT)

**Files:**
- Create: `backend/src/inventario/dto/crear-bodega.dto.ts`, `dto/registrar-stock.dto.ts`, `inventario.service.ts`, `inventario.service.spec.ts`, `inventario.controller.ts`, `inventario.module.ts`

- [ ] **Step 1: Escribir los DTOs**

```typescript
// backend/src/inventario/dto/crear-bodega.dto.ts
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum TipoBodegaDto { PROPIA = 'PROPIA', HERMANA = 'HERMANA' }

export class CrearBodegaDto {
  @IsString() codigo!: string;
  @IsString() nombre!: string;
  @IsOptional() @IsEnum(TipoBodegaDto) tipo?: TipoBodegaDto;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) prioridad?: number;
}
```

```typescript
// backend/src/inventario/dto/registrar-stock.dto.ts
import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class RegistrarStockDto {
  @Type(() => Number) @IsInt() productoConfiguradoId!: number;
  @Type(() => Number) @IsInt() tallaId!: number;
  @Type(() => Number) @IsInt() bodegaId!: number;
  @Type(() => Number) @IsInt() @Min(0) cantidad!: number;
}
```

- [ ] **Step 2: Escribir el test que falla**

```typescript
// backend/src/inventario/inventario.service.spec.ts
import { InventarioService } from './inventario.service';

describe('InventarioService', () => {
  const prisma = {
    bodega: { create: jest.fn() },
    inventarioPT: { upsert: jest.fn() },
  } as any;
  const service = new InventarioService(prisma);
  beforeEach(() => jest.clearAllMocks());

  it('crea una bodega', async () => {
    prisma.bodega.create.mockResolvedValue({ id: 1, codigo: 'IBG' });
    const r = await service.crearBodega({ codigo: 'IBG', nombre: 'Ibagué' });
    expect(prisma.bodega.create).toHaveBeenCalledWith({
      data: { codigo: 'IBG', nombre: 'Ibagué', tipo: undefined, prioridad: undefined },
    });
    expect(r).toMatchObject({ id: 1 });
  });

  it('registra stock con upsert (suma a lo disponible si ya existe)', async () => {
    prisma.inventarioPT.upsert.mockResolvedValue({ id: 9, cantDisponible: 50 });
    await service.registrarStock({ productoConfiguradoId: 1, tallaId: 42, bodegaId: 1, cantidad: 50 });
    expect(prisma.inventarioPT.upsert).toHaveBeenCalledWith({
      where: { productoConfiguradoId_tallaId_bodegaId: { productoConfiguradoId: 1, tallaId: 42, bodegaId: 1 } },
      create: { productoConfiguradoId: 1, tallaId: 42, bodegaId: 1, cantDisponible: 50 },
      update: { cantDisponible: { increment: 50 } },
    });
  });
});
```

- [ ] **Step 3: Run test para verificar que falla**

Run: `npx jest src/inventario/inventario.service.spec.ts`
Expected: FAIL — "Cannot find module './inventario.service'".

- [ ] **Step 4: Implementar el service**

```typescript
// backend/src/inventario/inventario.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CrearBodegaDto } from './dto/crear-bodega.dto';
import { RegistrarStockDto } from './dto/registrar-stock.dto';

@Injectable()
export class InventarioService {
  constructor(private readonly prisma: PrismaService) {}

  crearBodega(dto: CrearBodegaDto) {
    return this.prisma.bodega.create({
      data: { codigo: dto.codigo, nombre: dto.nombre, tipo: dto.tipo, prioridad: dto.prioridad },
    });
  }

  registrarStock(dto: RegistrarStockDto) {
    const { productoConfiguradoId, tallaId, bodegaId, cantidad } = dto;
    return this.prisma.inventarioPT.upsert({
      where: { productoConfiguradoId_tallaId_bodegaId: { productoConfiguradoId, tallaId, bodegaId } },
      create: { productoConfiguradoId, tallaId, bodegaId, cantDisponible: cantidad },
      update: { cantDisponible: { increment: cantidad } },
    });
  }
}
```

- [ ] **Step 5: Run test para verificar que pasa**

Run: `npx jest src/inventario/inventario.service.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Implementar controller y módulo**

```typescript
// backend/src/inventario/inventario.controller.ts
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { InventarioService } from './inventario.service';
import { CrearBodegaDto } from './dto/crear-bodega.dto';
import { RegistrarStockDto } from './dto/registrar-stock.dto';

@UseGuards(JwtAuthGuard)
@Controller('inventario')
export class InventarioController {
  constructor(private readonly inventario: InventarioService) {}

  @Post('bodegas') crearBodega(@Body() dto: CrearBodegaDto) { return this.inventario.crearBodega(dto); }
  @Post('pt') registrarStock(@Body() dto: RegistrarStockDto) { return this.inventario.registrarStock(dto); }
}
```

```typescript
// backend/src/inventario/inventario.module.ts
import { Module } from '@nestjs/common';
import { InventarioController } from './inventario.controller';
import { InventarioService } from './inventario.service';

@Module({
  controllers: [InventarioController],
  providers: [InventarioService],
  exports: [InventarioService],
})
export class InventarioModule {}
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/inventario
git commit -m "feat(inventario): Bodega + InventarioPT (crear bodega, registrar stock)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Módulo OC (crear + confirmar con validación pura)

**Files:**
- Create: `backend/src/pedidos/oc/oc-validacion.ts`, `oc-validacion.spec.ts`, `dto/crear-oc.dto.ts`, `oc.service.ts`, `oc.service.spec.ts`, `oc.controller.ts`, `oc.module.ts`

- [ ] **Step 1: Escribir el test de la validación pura**

```typescript
// backend/src/pedidos/oc/oc-validacion.spec.ts
import { validarConfirmacionOC, OCParaValidar } from './oc-validacion';

const base: OCParaValidar = {
  estado: 'BORRADOR',
  clienteActivo: true,
  lineas: [{ tallas: [{ tallaValor: 40, cantidad: 10, refTallaMin: 34, refTallaMax: 46 }] }],
};

describe('validarConfirmacionOC', () => {
  it('OC válida no produce errores', () => {
    expect(validarConfirmacionOC(base)).toEqual([]);
  });

  it('rechaza si la OC no está en BORRADOR', () => {
    expect(validarConfirmacionOC({ ...base, estado: 'CONFIRMADA' }))
      .toContain('La OC solo puede confirmarse desde BORRADOR');
  });

  it('rechaza cliente inactivo', () => {
    expect(validarConfirmacionOC({ ...base, clienteActivo: false }))
      .toContain('El cliente no está activo');
  });

  it('rechaza OC sin líneas', () => {
    expect(validarConfirmacionOC({ ...base, lineas: [] }))
      .toContain('La OC debe tener al menos una línea');
  });

  it('rechaza talla fuera del rango de la referencia', () => {
    const oc: OCParaValidar = {
      ...base,
      lineas: [{ tallas: [{ tallaValor: 50, cantidad: 5, refTallaMin: 34, refTallaMax: 46 }] }],
    };
    expect(validarConfirmacionOC(oc)).toContain('Talla 50 fuera del rango 34-46');
  });

  it('rechaza cantidad no positiva', () => {
    const oc: OCParaValidar = {
      ...base,
      lineas: [{ tallas: [{ tallaValor: 40, cantidad: 0, refTallaMin: 34, refTallaMax: 46 }] }],
    };
    expect(validarConfirmacionOC(oc)).toContain('La cantidad de la talla 40 debe ser mayor a 0');
  });
});
```

- [ ] **Step 2: Run test para verificar que falla**

Run: `npx jest src/pedidos/oc/oc-validacion.spec.ts`
Expected: FAIL — "Cannot find module './oc-validacion'".

- [ ] **Step 3: Implementar la validación pura**

```typescript
// backend/src/pedidos/oc/oc-validacion.ts
export interface TallaParaValidar {
  tallaValor: number;
  cantidad: number;
  refTallaMin: number;
  refTallaMax: number;
}
export interface LineaParaValidar {
  tallas: TallaParaValidar[];
}
export interface OCParaValidar {
  estado: string;
  clienteActivo: boolean;
  lineas: LineaParaValidar[];
}

export function validarConfirmacionOC(oc: OCParaValidar): string[] {
  const errores: string[] = [];
  if (oc.estado !== 'BORRADOR') errores.push('La OC solo puede confirmarse desde BORRADOR');
  if (!oc.clienteActivo) errores.push('El cliente no está activo');
  if (oc.lineas.length === 0) errores.push('La OC debe tener al menos una línea');

  for (const linea of oc.lineas) {
    for (const t of linea.tallas) {
      if (t.tallaValor < t.refTallaMin || t.tallaValor > t.refTallaMax) {
        errores.push(`Talla ${t.tallaValor} fuera del rango ${t.refTallaMin}-${t.refTallaMax}`);
      }
      if (t.cantidad <= 0) {
        errores.push(`La cantidad de la talla ${t.tallaValor} debe ser mayor a 0`);
      }
    }
  }
  return errores;
}
```

- [ ] **Step 4: Run test para verificar que pasa**

Run: `npx jest src/pedidos/oc/oc-validacion.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Escribir el DTO de creación de OC**

```typescript
// backend/src/pedidos/oc/dto/crear-oc.dto.ts
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class CrearOCTallaDto {
  @Type(() => Number) @IsInt() tallaId!: number;
  @Type(() => Number) @IsInt() @Min(1) cantidad!: number;
}

export class CrearOCLineaDto {
  @Type(() => Number) @IsInt() productoConfiguradoId!: number;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => CrearOCTallaDto)
  tallas!: CrearOCTallaDto[];
}

export class CrearOCDto {
  @Type(() => Number) @IsInt() clienteId!: number;
  @IsOptional() @IsString() ocCliente?: string;
  @IsOptional() @IsString() observaciones?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => CrearOCLineaDto)
  lineas!: CrearOCLineaDto[];
}
```

- [ ] **Step 6: Escribir el test del service (crear asigna consecutivo; confirmar valida)**

```typescript
// backend/src/pedidos/oc/oc.service.spec.ts
import { BadRequestException } from '@nestjs/common';
import { OcService } from './oc.service';

describe('OcService', () => {
  const prisma = {
    ordenCompra: { aggregate: jest.fn(), create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  } as any;
  const service = new OcService(prisma);
  beforeEach(() => jest.clearAllMocks());

  it('crear asigna consecutivo = max+1 y estado BORRADOR', async () => {
    prisma.ordenCompra.aggregate.mockResolvedValue({ _max: { consecutivo: 3900 } });
    prisma.ordenCompra.create.mockResolvedValue({ id: 1, consecutivo: 3901 });
    await service.crear({ clienteId: 7, lineas: [{ productoConfiguradoId: 2, tallas: [{ tallaId: 5, cantidad: 10 }] }] });
    expect(prisma.ordenCompra.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ consecutivo: 3901, clienteId: 7, estado: 'BORRADOR' }),
    }));
  });

  it('primer consecutivo es 1 cuando no hay OCs', async () => {
    prisma.ordenCompra.aggregate.mockResolvedValue({ _max: { consecutivo: null } });
    prisma.ordenCompra.create.mockResolvedValue({ id: 1, consecutivo: 1 });
    await service.crear({ clienteId: 7, lineas: [{ productoConfiguradoId: 2, tallas: [{ tallaId: 5, cantidad: 10 }] }] });
    expect(prisma.ordenCompra.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ consecutivo: 1 }),
    }));
  });

  it('confirmar lanza BadRequest con los errores de validación', async () => {
    prisma.ordenCompra.findUnique.mockResolvedValue({
      id: 1, estado: 'BORRADOR',
      cliente: { activo: false },
      lineas: [{ tallas: [{ cantidad: 10, talla: { valor: 40 }, ocLinea: null }] }],
      // referencia rango viene del productoConfigurado.referencia
    });
    // se fuerza error por cliente inactivo
    await expect(service.confirmar(1)).rejects.toBeInstanceOf(BadRequestException);
  });
});
```

- [ ] **Step 7: Run test para verificar que falla**

Run: `npx jest src/pedidos/oc/oc.service.spec.ts`
Expected: FAIL — "Cannot find module './oc.service'".

- [ ] **Step 8: Implementar el service**

```typescript
// backend/src/pedidos/oc/oc.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CrearOCDto } from './dto/crear-oc.dto';
import { validarConfirmacionOC, OCParaValidar } from './oc-validacion';

@Injectable()
export class OcService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(dto: CrearOCDto) {
    const agg = await this.prisma.ordenCompra.aggregate({ _max: { consecutivo: true } });
    const consecutivo = (agg._max.consecutivo ?? 0) + 1;
    return this.prisma.ordenCompra.create({
      data: {
        consecutivo,
        clienteId: dto.clienteId,
        ocCliente: dto.ocCliente,
        observaciones: dto.observaciones,
        estado: 'BORRADOR',
        lineas: {
          create: dto.lineas.map((l) => ({
            productoConfiguradoId: l.productoConfiguradoId,
            tallas: { create: l.tallas.map((t) => ({ tallaId: t.tallaId, cantidad: t.cantidad })) },
          })),
        },
      },
      include: { lineas: { include: { tallas: true } } },
    });
  }

  async confirmar(id: number) {
    const oc = await this.prisma.ordenCompra.findUnique({
      where: { id },
      include: {
        cliente: true,
        lineas: {
          include: {
            productoConfigurado: { include: { referencia: { include: { tallaMin: true, tallaMax: true } } } },
            tallas: { include: { talla: true } },
          },
        },
      },
    });
    if (!oc) throw new NotFoundException(`OC ${id} no existe`);

    const paraValidar: OCParaValidar = {
      estado: oc.estado,
      clienteActivo: oc.cliente.activo,
      lineas: oc.lineas.map((l) => ({
        tallas: l.tallas.map((t) => ({
          tallaValor: t.talla.valor,
          cantidad: t.cantidad,
          refTallaMin: l.productoConfigurado.referencia.tallaMin.valor,
          refTallaMax: l.productoConfigurado.referencia.tallaMax.valor,
        })),
      })),
    };

    const errores = validarConfirmacionOC(paraValidar);
    if (errores.length > 0) throw new BadRequestException(errores);

    return this.prisma.ordenCompra.update({ where: { id }, data: { estado: 'CONFIRMADA' } });
  }
}
```

- [ ] **Step 9: Run test para verificar que pasa**

Run: `npx jest src/pedidos/oc/oc.service.spec.ts`
Expected: PASS (3 tests).

Nota: ajustar el mock de `findUnique` en el tercer test para que incluya `lineas[].productoConfigurado.referencia.tallaMin/Max` con `valor` (ej. `{ valor: 34 }` / `{ valor: 46 }`) y `tallas[].talla.valor`. El error se dispara por `cliente.activo === false`.

- [ ] **Step 10: Implementar controller y módulo**

```typescript
// backend/src/pedidos/oc/oc.controller.ts
import { Body, Controller, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OcService } from './oc.service';
import { CrearOCDto } from './dto/crear-oc.dto';

@UseGuards(JwtAuthGuard)
@Controller('pedidos/oc')
export class OcController {
  constructor(private readonly oc: OcService) {}

  @Post() crear(@Body() dto: CrearOCDto) { return this.oc.crear(dto); }
  @Post(':id/confirmar') confirmar(@Param('id', ParseIntPipe) id: number) { return this.oc.confirmar(id); }
}
```

```typescript
// backend/src/pedidos/oc/oc.module.ts
import { Module } from '@nestjs/common';
import { OcController } from './oc.controller';
import { OcService } from './oc.service';

@Module({
  controllers: [OcController],
  providers: [OcService],
  exports: [OcService],
})
export class OcModule {}
```

- [ ] **Step 11: Commit**

```bash
git add backend/src/pedidos/oc
git commit -m "feat(pedidos): OC crear + confirmar con validacion pura

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Módulo OP (generar desde OC con amarre + anular)

**Files:**
- Create: `backend/src/pedidos/op/op.service.ts`, `op.service.spec.ts`, `op.controller.ts`, `op.module.ts`
- (usa `amarre.ts` de Task 2)

- [ ] **Step 1: Escribir el test del service**

El service usa una transacción. En el test mockeamos `prisma.$transaction(cb)` para que ejecute el callback con un `tx` mock.

```typescript
// backend/src/pedidos/op/op.service.spec.ts
import { BadRequestException } from '@nestjs/common';
import { OpService } from './op.service';

function makeTx() {
  return {
    ordenProduccion: { aggregate: jest.fn(), create: jest.fn(), update: jest.fn() },
    ordenProduccionLinea: { create: jest.fn() },
    ordenProduccionLineaTalla: { create: jest.fn() },
    inventarioPT: { findMany: jest.fn(), update: jest.fn() },
    reservaInventarioPT: { create: jest.fn() },
    ordenCompra: { update: jest.fn() },
  };
}

describe('OpService.generarDesdeOC', () => {
  let prisma: any;
  let tx: ReturnType<typeof makeTx>;
  beforeEach(() => {
    tx = makeTx();
    prisma = {
      ordenCompra: { findUnique: jest.fn() },
      $transaction: jest.fn((cb: any) => cb(tx)),
    };
  });

  it('rechaza si la OC no está CONFIRMADA', async () => {
    prisma.ordenCompra.findUnique.mockResolvedValue({ id: 1, estado: 'BORRADOR', lineas: [] });
    const service = new OpService(prisma);
    await expect(service.generarDesdeOC(1)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('amarra stock disponible y reserva; calcula a producir', async () => {
    prisma.ordenCompra.findUnique.mockResolvedValue({
      id: 1, estado: 'CONFIRMADA',
      lineas: [{
        id: 11, productoConfiguradoId: 2,
        tallas: [{ tallaId: 5, cantidad: 100 }],
      }],
    });
    tx.ordenProduccion.aggregate.mockResolvedValue({ _max: { consecutivo: 800 } });
    tx.ordenProduccion.create.mockResolvedValue({ id: 50 });
    tx.ordenProduccionLinea.create.mockResolvedValue({ id: 60 });
    // stock: bodega prioridad 100 con 30 disponibles
    tx.inventarioPT.findMany.mockResolvedValue([
      { id: 70, bodegaId: 1, cantDisponible: 30, cantReservada: 0, bodega: { prioridad: 100 } },
    ]);
    tx.ordenProduccionLineaTalla.create.mockResolvedValue({ id: 80 });

    const service = new OpService(prisma);
    await service.generarDesdeOC(1);

    // crea OP con consecutivo 801
    expect(tx.ordenProduccion.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ consecutivo: 801, ocId: 1, estado: 'CREADA' }),
    }));
    // crea la talla con 30 amarrados y 70 a producir
    expect(tx.ordenProduccionLineaTalla.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tallaId: 5, cantPedida: 100, cantAmarrada: 30, cantAProducir: 70 }),
    }));
    // reserva 30 en el inventario 70
    expect(tx.inventarioPT.update).toHaveBeenCalledWith({
      where: { id: 70 }, data: { cantReservada: { increment: 30 } },
    });
    expect(tx.reservaInventarioPT.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ inventarioPTId: 70, cantidad: 30 }),
    }));
    // OP pasa a AMARRADA y OC a EN_PRODUCCION
    expect(tx.ordenProduccion.update).toHaveBeenCalledWith({ where: { id: 50 }, data: { estado: 'AMARRADA' } });
    expect(tx.ordenCompra.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { estado: 'EN_PRODUCCION' } });
  });
});
```

- [ ] **Step 2: Run test para verificar que falla**

Run: `npx jest src/pedidos/op/op.service.spec.ts`
Expected: FAIL — "Cannot find module './op.service'".

- [ ] **Step 3: Implementar el service**

```typescript
// backend/src/pedidos/op/op.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { amarrarTalla, DisponibilidadBodega } from './amarre';

@Injectable()
export class OpService {
  constructor(private readonly prisma: PrismaService) {}

  async generarDesdeOC(ocId: number) {
    const oc = await this.prisma.ordenCompra.findUnique({
      where: { id: ocId },
      include: { lineas: { include: { tallas: true } } },
    });
    if (!oc) throw new NotFoundException(`OC ${ocId} no existe`);
    if (oc.estado !== 'CONFIRMADA') {
      throw new BadRequestException('Solo se puede generar OP de una OC CONFIRMADA');
    }

    return this.prisma.$transaction(async (tx) => {
      const agg = await tx.ordenProduccion.aggregate({ _max: { consecutivo: true } });
      const consecutivo = (agg._max.consecutivo ?? 0) + 1;
      const op = await tx.ordenProduccion.create({
        data: { consecutivo, ocId, estado: 'CREADA' },
      });

      for (const linea of oc.lineas) {
        const opLinea = await tx.ordenProduccionLinea.create({
          data: { opId: op.id, productoConfiguradoId: linea.productoConfiguradoId },
        });

        for (const t of linea.tallas) {
          const stock = await tx.inventarioPT.findMany({
            where: { productoConfiguradoId: linea.productoConfiguradoId, tallaId: t.tallaId },
            include: { bodega: true },
          });
          const disponibilidades: DisponibilidadBodega[] = stock.map((s) => ({
            bodegaId: s.bodegaId,
            inventarioPTId: s.id,
            disponible: s.cantDisponible - s.cantReservada,
            prioridad: s.bodega.prioridad,
          }));

          const res = amarrarTalla({ tallaId: t.tallaId, cantPedida: t.cantidad }, disponibilidades);

          const opLineaTalla = await tx.ordenProduccionLineaTalla.create({
            data: {
              opLineaId: opLinea.id,
              tallaId: t.tallaId,
              cantPedida: res.cantPedida,
              cantAmarrada: res.cantAmarrada,
              cantAProducir: res.cantAProducir,
            },
          });

          for (const r of res.reservas) {
            await tx.inventarioPT.update({
              where: { id: r.inventarioPTId },
              data: { cantReservada: { increment: r.cantidad } },
            });
            await tx.reservaInventarioPT.create({
              data: { opLineaTallaId: opLineaTalla.id, inventarioPTId: r.inventarioPTId, cantidad: r.cantidad },
            });
          }
        }
      }

      await tx.ordenProduccion.update({ where: { id: op.id }, data: { estado: 'AMARRADA' } });
      await tx.ordenCompra.update({ where: { id: ocId }, data: { estado: 'EN_PRODUCCION' } });
      return tx.ordenProduccion.findUnique({
        where: { id: op.id },
        include: { lineas: { include: { tallas: true } } },
      });
    });
  }

  async anular(opId: number) {
    const op = await this.prisma.ordenProduccion.findUnique({
      where: { id: opId },
      include: { lineas: { include: { tallas: { include: { reservas: true } } } } },
    });
    if (!op) throw new NotFoundException(`OP ${opId} no existe`);
    if (op.estado === 'ANULADA') throw new BadRequestException('La OP ya está anulada');

    return this.prisma.$transaction(async (tx) => {
      for (const linea of op.lineas) {
        for (const t of linea.tallas) {
          for (const r of t.reservas) {
            await tx.inventarioPT.update({
              where: { id: r.inventarioPTId },
              data: { cantReservada: { decrement: r.cantidad } },
            });
          }
          await tx.reservaInventarioPT.deleteMany({ where: { opLineaTallaId: t.id } });
        }
      }
      await tx.ordenProduccion.update({ where: { id: opId }, data: { estado: 'ANULADA' } });
      return tx.ordenCompra.update({ where: { id: op.ocId }, data: { estado: 'CONFIRMADA' } });
    });
  }
}
```

- [ ] **Step 4: Run test para verificar que pasa**

Run: `npx jest src/pedidos/op/op.service.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Agregar test de anulación (devuelve reservas) y verificar**

```typescript
// añadir al final de op.service.spec.ts
describe('OpService.anular', () => {
  it('devuelve las reservas al inventario y deja la OC CONFIRMADA', async () => {
    const tx = {
      inventarioPT: { update: jest.fn() },
      reservaInventarioPT: { deleteMany: jest.fn() },
      ordenProduccion: { update: jest.fn() },
      ordenCompra: { update: jest.fn() },
    };
    const prisma: any = {
      ordenProduccion: { findUnique: jest.fn().mockResolvedValue({
        id: 50, ocId: 1, estado: 'AMARRADA',
        lineas: [{ tallas: [{ id: 80, reservas: [{ inventarioPTId: 70, cantidad: 30 }] }] }],
      }) },
      $transaction: jest.fn((cb: any) => cb(tx)),
    };
    const service = new OpService(prisma);
    await service.anular(50);
    expect(tx.inventarioPT.update).toHaveBeenCalledWith({
      where: { id: 70 }, data: { cantReservada: { decrement: 30 } },
    });
    expect(tx.reservaInventarioPT.deleteMany).toHaveBeenCalledWith({ where: { opLineaTallaId: 80 } });
    expect(tx.ordenProduccion.update).toHaveBeenCalledWith({ where: { id: 50 }, data: { estado: 'ANULADA' } });
    expect(tx.ordenCompra.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { estado: 'CONFIRMADA' } });
  });
});
```

Run: `npx jest src/pedidos/op/op.service.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Implementar controller y módulo**

```typescript
// backend/src/pedidos/op/op.controller.ts
import { Controller, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OpService } from './op.service';

@UseGuards(JwtAuthGuard)
@Controller('pedidos/op')
export class OpController {
  constructor(private readonly op: OpService) {}

  @Post('desde-oc/:ocId') generar(@Param('ocId', ParseIntPipe) ocId: number) {
    return this.op.generarDesdeOC(ocId);
  }
  @Post(':id/anular') anular(@Param('id', ParseIntPipe) id: number) {
    return this.op.anular(id);
  }
}
```

```typescript
// backend/src/pedidos/op/op.module.ts
import { Module } from '@nestjs/common';
import { OpController } from './op.controller';
import { OpService } from './op.service';

@Module({
  controllers: [OpController],
  providers: [OpService],
  exports: [OpService],
})
export class OpModule {}
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/pedidos/op
git commit -m "feat(pedidos): OP generar desde OC con amarre transaccional + anular

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Wiring en AppModule + verificación global

**Files:**
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Registrar los 4 módulos nuevos**

Editar `backend/src/app.module.ts` para importar y registrar `ClientesModule`, `InventarioModule`, `OcModule`, `OpModule`:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { ClientesModule } from './clientes/clientes.module';
import { InventarioModule } from './inventario/inventario.module';
import { OcModule } from './pedidos/oc/oc.module';
import { OpModule } from './pedidos/op/op.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    CatalogModule,
    ClientesModule,
    InventarioModule,
    OcModule,
    OpModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
```

- [ ] **Step 2: Verificar build, lint y suite completa**

Run: `npm run build`
Expected: compila sin errores de TypeScript.

Run: `npx jest`
Expected: PASS — todos los specs (Módulo 1 + los nuevos de amarre, validación, clientes, inventario, OC, OP).

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add backend/src/app.module.ts
git commit -m "feat(pedidos): registrar Clientes, Inventario, OC y OP en AppModule

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notas de cierre

- **Refinamiento del spec:** se agregó `ReservaInventarioPT` (no estaba en el spec original) para poder devolver reservas con precisión al anular una OP. El spec se actualiza para reflejarlo.
- **Consecutivos:** se implementa con `aggregate _max + 1` (simple y suficiente para esta fase). Si JP confirma que se necesita continuidad con el Drive (~3900) o reinicio anual con prefijo, se reemplaza por la tabla `Consecutivo` descrita en el spec §7.
- **Fuera de alcance (próximos módulos):** generación de OF por célula, explosión de BOM contra insumos, inventario por etapas intermedias, integración Galago/cartera, bloqueo de despacho.
