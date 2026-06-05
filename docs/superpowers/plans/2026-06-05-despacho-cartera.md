# Despacho + regla de cartera (Demo 3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Despachar una OP totalmente amarrada (en un acto), descontando el inventario reservado y dejando un documento de Despacho; bloquear el despacho si el cliente tiene cartera VENCIDO/BLOQUEADO salvo autorización de un gerente (1 paso, registrada).

**Architecture:** Módulo backend nuevo `despachos` que reusa la plomería de inventario/reservas del amarre (mismo patrón `prisma.$transaction` + consecutivo por `aggregate _max` que `op.service.ts`). La regla de cartera y el chequeo de rol viven en el servicio. Frontend: acción "Despachar" en el detalle de OP (con banner de cartera + autorización de gerente) + listado de despachos. Sistema de roles ya existe (`@Roles`/`RolesGuard`, `role` en el JWT).

**Tech Stack:** NestJS + Prisma (backend), Angular 19 standalone + signals (frontend), Jest (back, prisma mockeado), Karma/Jasmine headless (front).

**Branch:** `develop` (línea de construcción; ver [[botas-workflow-branches]]). NO se mergea a master hasta mostrar la demo.

**Spec:** `docs/superpowers/specs/2026-06-04-despacho-cartera-design.md`.

---

## ⚠️ Prerequisito (Task 1 y Task 4 lo necesitan)

La generación de la migración (`prisma migrate dev`) y el seed necesitan **Postgres local corriendo**. Antes de Task 1:
```bash
docker start agro-erp-pg     # el contenedor ya existe (:5433); requiere Docker Desktop abierto
```
Verificar: `docker ps | grep agro-erp-pg`. Los tests de servicio (Task 2, 3) usan prisma **mockeado** y NO necesitan DB.

---

## File Structure

**Backend:**
- Modify: `backend/prisma/schema.prisma` — enum `EstadoOP` +`DESPACHADA`; modelos `Despacho`, `DespachoLinea`; relaciones inversas.
- Create: `backend/prisma/migrations/<ts>_modulo3_despacho/migration.sql` (generada por Prisma).
- Create: `backend/src/despachos/despacho-lineas.ts` — helper puro `construirLineasDespacho`.
- Create: `backend/src/despachos/despacho-lineas.spec.ts`.
- Create: `backend/src/despachos/dto/despachar.dto.ts`.
- Create: `backend/src/despachos/despacho.service.ts` + `despacho.service.spec.ts`.
- Create: `backend/src/despachos/despacho.controller.ts`.
- Create: `backend/src/despachos/despacho.module.ts`.
- Modify: `backend/src/app.module.ts` — registrar `DespachoModule`.
- Modify: `backend/prisma/seed-demo.ts` — rol+usuario GERENTE, cliente VENCIDO, 2 OPs totalmente amarradas.

**Frontend:**
- Modify: `frontend/src/app/core/api/models/pedidos.models.ts` — `EstadoOP` +`'DESPACHADA'`.
- Modify: `frontend/src/app/features/pedidos/oc/estado-badge.ts` — `DESPACHADA` en el mapa OP.
- Modify: `frontend/src/app/core/auth/auth.service.ts` — getter `rol()`.
- Create: `frontend/src/app/core/api/despachos.api.ts` + `despachos.api.spec.ts` + modelos.
- Create: `frontend/src/app/features/despachos/despachos-list.component.ts` + `.spec.ts`.
- Modify: `frontend/src/app/app.routes.ts` — ruta `/despachos`.
- Modify: `frontend/src/app/layout/shell/shell.component.ts` — nav "Despachos".
- Modify: `frontend/src/app/features/pedidos/op/op-detalle.component.ts` — acción Despachar + banner cartera + autorizar.

---

## Task 1: Schema + migración

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: migración Prisma.

- [ ] **Step 1: Asegurar DB local arriba**

Run: `docker start agro-erp-pg && docker ps | grep agro-erp-pg`
Expected: el contenedor aparece `Up`. (Si Docker Desktop no está abierto, abrirlo primero.)

- [ ] **Step 2: Editar el enum EstadoOP**

En `schema.prisma`, en `enum EstadoOP { ... }`, agregá `DESPACHADA` antes de `ANULADA`:
```prisma
enum EstadoOP {
  CREADA
  AMARRADA
  EN_PRODUCCION
  DESPACHADA
  ANULADA
}
```

- [ ] **Step 3: Agregar los modelos Despacho y DespachoLinea**

En `schema.prisma`, al final del bloque del Módulo 2 (después de `model ReservaInventarioPT { ... }`), agregá:
```prisma
model Despacho {
  id                 Int             @id @default(autoincrement())
  consecutivo        Int             @unique
  opId               Int             @unique
  op                 OrdenProduccion @relation(fields: [opId], references: [id])
  fecha              DateTime        @default(now())
  autorizadoPorId    Int?
  autorizadoPor      User?           @relation(fields: [autorizadoPorId], references: [id])
  motivoAutorizacion String?
  createdAt          DateTime        @default(now())

  lineas DespachoLinea[]
}

model DespachoLinea {
  id                    Int                 @id @default(autoincrement())
  despachoId            Int
  despacho              Despacho            @relation(fields: [despachoId], references: [id])
  productoConfiguradoId Int
  productoConfigurado   ProductoConfigurado @relation(fields: [productoConfiguradoId], references: [id])
  tallaId               Int
  talla                 Talla               @relation(fields: [tallaId], references: [id])
  bodegaId              Int
  bodega                Bodega              @relation(fields: [bodegaId], references: [id])
  cantidad              Int

  @@index([despachoId])
}
```

- [ ] **Step 4: Agregar las relaciones inversas**

Agregá estas líneas en los modelos existentes (dentro de cada bloque, junto a sus otras relaciones):
- En `model OrdenProduccion`: `despacho        Despacho?`
- En `model User`: `despachosAutorizados Despacho[]`
- En `model ProductoConfigurado`: `lineasDespacho DespachoLinea[]`
- En `model Talla`: `lineasDespacho DespachoLinea[]`
- En `model Bodega`: `lineasDespacho DespachoLinea[]`

- [ ] **Step 5: Crear y aplicar la migración**

Run: `cd backend && npx prisma migrate dev --name modulo3_despacho`
Expected: crea `prisma/migrations/<ts>_modulo3_despacho/` y aplica a la DB local sin errores. Prisma regenera el cliente.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(despacho): schema Despacho + DespachoLinea + EstadoOP.DESPACHADA"
```

---

## Task 2: Helper puro `construirLineasDespacho`

**Files:**
- Create: `backend/src/despachos/despacho-lineas.ts`
- Test: `backend/src/despachos/despacho-lineas.spec.ts`

- [ ] **Step 1: Write the failing test**

Creá `backend/src/despachos/despacho-lineas.spec.ts`:
```ts
import { construirLineasDespacho, ReservaPlana } from './despacho-lineas';

describe('construirLineasDespacho', () => {
  it('agrupa reservas por producto/talla/bodega sumando cantidades', () => {
    const reservas: ReservaPlana[] = [
      { productoConfiguradoId: 1, tallaId: 10, bodegaId: 2, cantidad: 5 },
      { productoConfiguradoId: 1, tallaId: 10, bodegaId: 2, cantidad: 3 }, // misma clave → suma
      { productoConfiguradoId: 1, tallaId: 11, bodegaId: 2, cantidad: 4 }, // otra talla
      { productoConfiguradoId: 2, tallaId: 10, bodegaId: 2, cantidad: 7 }, // otro producto
    ];
    const lineas = construirLineasDespacho(reservas);
    expect(lineas).toEqual([
      { productoConfiguradoId: 1, tallaId: 10, bodegaId: 2, cantidad: 8 },
      { productoConfiguradoId: 1, tallaId: 11, bodegaId: 2, cantidad: 4 },
      { productoConfiguradoId: 2, tallaId: 10, bodegaId: 2, cantidad: 7 },
    ]);
  });

  it('devuelve [] si no hay reservas', () => {
    expect(construirLineasDespacho([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd backend && npx jest despacho-lineas`
Expected: FAIL (cannot find module).

- [ ] **Step 3: Implement**

Creá `backend/src/despachos/despacho-lineas.ts`:
```ts
export interface ReservaPlana {
  productoConfiguradoId: number;
  tallaId: number;
  bodegaId: number;
  cantidad: number;
}

export type LineaDespachoData = ReservaPlana;

/** Agrupa reservas por (producto, talla, bodega) sumando cantidades. Preserva el orden de primera aparición. */
export function construirLineasDespacho(reservas: ReservaPlana[]): LineaDespachoData[] {
  const map = new Map<string, LineaDespachoData>();
  for (const r of reservas) {
    const key = `${r.productoConfiguradoId}|${r.tallaId}|${r.bodegaId}`;
    const ex = map.get(key);
    if (ex) ex.cantidad += r.cantidad;
    else map.set(key, { productoConfiguradoId: r.productoConfiguradoId, tallaId: r.tallaId, bodegaId: r.bodegaId, cantidad: r.cantidad });
  }
  return [...map.values()];
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && npx jest despacho-lineas`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/despachos/despacho-lineas.ts backend/src/despachos/despacho-lineas.spec.ts
git commit -m "feat(despacho): helper puro construirLineasDespacho"
```

---

## Task 3: DespachoService + controller + module

**Files:**
- Create: `backend/src/despachos/dto/despachar.dto.ts`
- Create: `backend/src/despachos/despacho.service.ts` + `despacho.service.spec.ts`
- Create: `backend/src/despachos/despacho.controller.ts`
- Create: `backend/src/despachos/despacho.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Crear el DTO**

Creá `backend/src/despachos/dto/despachar.dto.ts`:
```ts
import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

export class DespacharDto {
  @IsInt()
  opId!: number;

  @IsOptional()
  @IsBoolean()
  autorizar?: boolean;

  @IsOptional()
  @IsString()
  motivo?: string;
}
```

- [ ] **Step 2: Write the failing test**

Creá `backend/src/despachos/despacho.service.spec.ts`:
```ts
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DespachoService } from './despacho.service';

function opBase(over: any = {}) {
  return {
    id: 1, ocId: 9, estado: 'AMARRADA', despacho: null,
    oc: { cliente: { estadoCartera: 'AL_DIA' } },
    lineas: [
      { productoConfiguradoId: 7, tallas: [
        { tallaId: 10, cantAProducir: 0, reservas: [
          { id: 100, inventarioPTId: 50, cantidad: 5, inventarioPT: { bodegaId: 2 } },
        ] },
      ] },
    ],
    ...over,
  };
}

describe('DespachoService', () => {
  const prisma: any = {
    ordenProduccion: { findUnique: jest.fn(), update: jest.fn() },
    despacho: { aggregate: jest.fn(), create: jest.fn() },
    inventarioPT: { update: jest.fn() },
    reservaInventarioPT: { delete: jest.fn() },
    ordenCompra: { update: jest.fn() },
  };
  prisma.$transaction = jest.fn((cb: any) => cb(prisma));
  const service = new DespachoService(prisma);
  const gerente = { sub: 3, role: 'GERENTE' };
  const operario = { sub: 4, role: 'OPERARIO' };
  beforeEach(() => jest.clearAllMocks());

  it('404 si la OP no existe', async () => {
    prisma.ordenProduccion.findUnique.mockResolvedValue(null);
    await expect(service.despachar({ opId: 1 }, operario)).rejects.toThrow(NotFoundException);
  });

  it('409 si la OP ya tiene despacho', async () => {
    prisma.ordenProduccion.findUnique.mockResolvedValue(opBase({ despacho: { id: 1 } }));
    await expect(service.despachar({ opId: 1 }, operario)).rejects.toThrow(BadRequestException);
  });

  it('409 si la OP no está amarrada', async () => {
    prisma.ordenProduccion.findUnique.mockResolvedValue(opBase({ estado: 'CREADA' }));
    await expect(service.despachar({ opId: 1 }, operario)).rejects.toThrow(BadRequestException);
  });

  it('409 si la OP tiene producción pendiente (cantAProducir > 0)', async () => {
    const op = opBase();
    op.lineas[0].tallas[0].cantAProducir = 2;
    prisma.ordenProduccion.findUnique.mockResolvedValue(op);
    await expect(service.despachar({ opId: 1 }, operario)).rejects.toThrow(BadRequestException);
  });

  it('409 si cartera VENCIDO y no se autoriza', async () => {
    prisma.ordenProduccion.findUnique.mockResolvedValue(opBase({ oc: { cliente: { estadoCartera: 'VENCIDO' } } }));
    await expect(service.despachar({ opId: 1 }, operario)).rejects.toThrow(ConflictException);
  });

  it('403 si autoriza pero no es gerente', async () => {
    prisma.ordenProduccion.findUnique.mockResolvedValue(opBase({ oc: { cliente: { estadoCartera: 'VENCIDO' } } }));
    await expect(service.despachar({ opId: 1, autorizar: true }, operario)).rejects.toThrow(ForbiddenException);
  });

  it('AL_DIA: descuenta inventario, borra reservas, crea despacho, cambia estados', async () => {
    prisma.ordenProduccion.findUnique.mockResolvedValue(opBase());
    prisma.despacho.aggregate.mockResolvedValue({ _max: { consecutivo: 4 } });
    prisma.despacho.create.mockResolvedValue({ id: 1, consecutivo: 5 });
    await service.despachar({ opId: 1 }, operario);
    expect(prisma.inventarioPT.update).toHaveBeenCalledWith({ where: { id: 50 }, data: { cantDisponible: { decrement: 5 }, cantReservada: { decrement: 5 } } });
    expect(prisma.reservaInventarioPT.delete).toHaveBeenCalledWith({ where: { id: 100 } });
    const createArg = prisma.despacho.create.mock.calls[0][0];
    expect(createArg.data.consecutivo).toBe(5);
    expect(createArg.data.opId).toBe(1);
    expect(createArg.data.autorizadoPorId).toBeNull();
    expect(createArg.data.lineas.create).toEqual([{ productoConfiguradoId: 7, tallaId: 10, bodegaId: 2, cantidad: 5 }]);
    expect(prisma.ordenProduccion.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { estado: 'DESPACHADA' } });
    expect(prisma.ordenCompra.update).toHaveBeenCalledWith({ where: { id: 9 }, data: { estado: 'CERRADA' } });
  });

  it('VENCIDO + gerente autoriza: registra autorizadoPor y motivo', async () => {
    prisma.ordenProduccion.findUnique.mockResolvedValue(opBase({ oc: { cliente: { estadoCartera: 'VENCIDO' } } }));
    prisma.despacho.aggregate.mockResolvedValue({ _max: { consecutivo: 0 } });
    prisma.despacho.create.mockResolvedValue({ id: 2, consecutivo: 1 });
    await service.despachar({ opId: 1, autorizar: true, motivo: 'urgente' }, gerente);
    const createArg = prisma.despacho.create.mock.calls[0][0];
    expect(createArg.data.autorizadoPorId).toBe(3);
    expect(createArg.data.motivoAutorizacion).toBe('urgente');
  });
});
```

- [ ] **Step 3: Run to verify fail**

Run: `cd backend && npx jest despacho.service`
Expected: FAIL (cannot find module).

- [ ] **Step 4: Implement the service**

Creá `backend/src/despachos/despacho.service.ts`:
```ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DespacharDto } from './dto/despachar.dto';
import { construirLineasDespacho, ReservaPlana } from './despacho-lineas';

interface Usuario {
  sub: number;
  role: string;
}

@Injectable()
export class DespachoService {
  constructor(private readonly prisma: PrismaService) {}

  async despachar(dto: DespacharDto, user: Usuario) {
    const op = await this.prisma.ordenProduccion.findUnique({
      where: { id: dto.opId },
      include: {
        despacho: true,
        oc: { include: { cliente: true } },
        lineas: {
          include: {
            tallas: { include: { reservas: { include: { inventarioPT: true } } } },
          },
        },
      },
    });
    if (!op) throw new NotFoundException(`OP ${dto.opId} no existe`);
    if (op.despacho) throw new BadRequestException('La OP ya fue despachada');
    if (op.estado !== 'AMARRADA')
      throw new BadRequestException('Solo se puede despachar una OP AMARRADA');
    const pendiente = op.lineas.some((l: any) =>
      l.tallas.some((t: any) => t.cantAProducir > 0),
    );
    if (pendiente)
      throw new BadRequestException(
        'OP con producción pendiente; no se puede despachar',
      );

    const estado = op.oc.cliente.estadoCartera;
    const bloqueada = estado === 'VENCIDO' || estado === 'BLOQUEADO';
    if (bloqueada) {
      if (!dto.autorizar)
        throw new ConflictException(
          `Cliente con cartera ${estado} — requiere autorización del gerente`,
        );
      if (user.role !== 'GERENTE' && user.role !== 'ADMIN')
        throw new ForbiddenException(
          'Solo un gerente puede autorizar el despacho',
        );
    }

    const reservas: (ReservaPlana & { inventarioPTId: number; reservaId: number })[] =
      op.lineas.flatMap((l: any) =>
        l.tallas.flatMap((t: any) =>
          t.reservas.map((r: any) => ({
            productoConfiguradoId: l.productoConfiguradoId,
            tallaId: t.tallaId,
            bodegaId: r.inventarioPT.bodegaId,
            cantidad: r.cantidad,
            inventarioPTId: r.inventarioPTId,
            reservaId: r.id,
          })),
        ),
      );
    const lineas = construirLineasDespacho(reservas);

    return this.prisma.$transaction(async (tx) => {
      const agg = await tx.despacho.aggregate({ _max: { consecutivo: true } });
      const consecutivo = (agg._max.consecutivo ?? 0) + 1;

      for (const r of reservas) {
        await tx.inventarioPT.update({
          where: { id: r.inventarioPTId },
          data: {
            cantDisponible: { decrement: r.cantidad },
            cantReservada: { decrement: r.cantidad },
          },
        });
        await tx.reservaInventarioPT.delete({ where: { id: r.reservaId } });
      }

      const despacho = await tx.despacho.create({
        data: {
          consecutivo,
          opId: op.id,
          autorizadoPorId: bloqueada ? user.sub : null,
          motivoAutorizacion: bloqueada ? (dto.motivo ?? null) : null,
          lineas: { create: lineas },
        },
      });

      await tx.ordenProduccion.update({
        where: { id: op.id },
        data: { estado: 'DESPACHADA' },
      });
      await tx.ordenCompra.update({
        where: { id: op.ocId },
        data: { estado: 'CERRADA' },
      });
      return despacho;
    });
  }

  listar() {
    return this.prisma.despacho.findMany({
      orderBy: { consecutivo: 'desc' },
      select: {
        id: true,
        consecutivo: true,
        fecha: true,
        autorizadoPorId: true,
        op: {
          select: {
            consecutivo: true,
            oc: { select: { cliente: { select: { nombre: true } } } },
          },
        },
      },
    });
  }

  async obtener(id: number) {
    const d = await this.prisma.despacho.findUnique({
      where: { id },
      include: {
        op: { select: { consecutivo: true, oc: { select: { cliente: { select: { nombre: true } } } } } },
        autorizadoPor: { select: { username: true } },
        lineas: {
          include: { productoConfigurado: true, talla: true, bodega: true },
        },
      },
    });
    if (!d) throw new NotFoundException(`Despacho ${id} no existe`);
    return d;
  }
}
```

- [ ] **Step 5: Run to verify pass**

Run: `cd backend && npx jest despacho.service`
Expected: PASS (8 tests).

- [ ] **Step 6: Crear controller y module**

Creá `backend/src/despachos/despacho.controller.ts`:
```ts
import { Body, Controller, Get, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { DespachoService } from './despacho.service';
import { DespacharDto } from './dto/despachar.dto';

@UseGuards(JwtAuthGuard)
@Controller('despachos')
export class DespachoController {
  constructor(private readonly service: DespachoService) {}

  @Post()
  crear(@Body() dto: DespacharDto, @Req() req: any) {
    return this.service.despachar(dto, req.user);
  }

  @Get()
  listar() {
    return this.service.listar();
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.service.obtener(id);
  }
}
```

Creá `backend/src/despachos/despacho.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { DespachoController } from './despacho.controller';
import { DespachoService } from './despacho.service';

@Module({
  controllers: [DespachoController],
  providers: [DespachoService],
})
export class DespachoModule {}
```

- [ ] **Step 7: Registrar el módulo**

En `backend/src/app.module.ts`, importá `DespachoModule` y agregalo al array `imports` (junto a los otros módulos de feature como `PedidosModule`/`CatalogModule`):
```ts
import { DespachoModule } from './despachos/despacho.module';
// ... en @Module({ imports: [ ..., DespachoModule ] })
```

- [ ] **Step 8: Compilar y correr toda la suite**

Run: `cd backend && npx nest build && npx jest`
Expected: build exit 0; todas las suites PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/src/despachos backend/src/app.module.ts
git commit -m "feat(despacho): servicio despachar (cartera gate + transaccion) + controller + module"
```

---

## Task 4: Seed — gerente, cliente VENCIDO, 2 OPs totalmente amarradas

Para demostrar ambos caminos (feliz y bloqueado→autorizar) sin pasos manuales.

**Files:**
- Modify: `backend/prisma/seed-demo.ts`

- [ ] **Step 1: Leer el seed actual**

Leé `backend/prisma/seed-demo.ts` completo para conocer los nombres de variables (clientes, productos, bodegas, tallas, stock) y el patrón de upserts antes de editar.

- [ ] **Step 2: Agregar rol + usuario GERENTE**

Cerca de donde el seed crea datos base, agregá (idempotente). El hash de password se genera igual que en `seed.ts` (revisá `seed.ts` para el patrón exacto de argon2/bcrypt usado para `admin`):
```ts
  // Rol + usuario gerente (para autorizar despachos bloqueados por cartera)
  const rolGerente = await prisma.role.upsert({
    where: { name: 'GERENTE' }, update: {}, create: { name: 'GERENTE' },
  });
  const passHashGerente = await hash('gerente123'); // usar el MISMO helper de hash que seed.ts
  await prisma.user.upsert({
    where: { username: 'gerente' },
    update: {},
    create: { username: 'gerente', passwordHash: passHashGerente, roleId: rolGerente.id },
  });
```
(Importá el helper de hash igual que `seed.ts`. Si `seed.ts` usa `argon2.hash`, replicá ese import.)

- [ ] **Step 3: Marcar un cliente como VENCIDO**

Elegí uno de los clientes del seed (p.ej. el segundo) y seteale `estadoCartera: 'VENCIDO'` en su `create`/`update` del upsert (o un update explícito por nit). Dejá al menos otro cliente en `AL_DIA`. Ejemplo de update explícito tras crear los clientes:
```ts
  await prisma.cliente.update({
    where: { nit: '900555666' }, // Constructora Yopal (ajustar al nit real del seed)
    data: { estadoCartera: 'VENCIDO' },
  });
```

- [ ] **Step 4: Crear un helper que arme una OP totalmente amarrada**

Agregá esta función dentro de `seed-demo.ts` (antes de `main`'s cierre). Crea una OC CONFIRMADA + OP AMARRADA con todas las tallas 100% amarradas contra una bodega con stock suficiente. Asume que `prisma`, y que hay una bodega con inventario; usa la primera bodega con stock del producto/talla:
```ts
async function crearOPAmarrada(opts: {
  clienteId: number; productoConfiguradoId: number; bodegaId: number;
  tallas: { tallaId: number; cantidad: number }[];
  consecutivoOC: number; consecutivoOP: number;
}) {
  const oc = await prisma.ordenCompra.create({
    data: {
      consecutivo: opts.consecutivoOC, clienteId: opts.clienteId, estado: 'CONFIRMADA',
      lineas: { create: [{ productoConfiguradoId: opts.productoConfiguradoId,
        tallas: { create: opts.tallas.map(t => ({ tallaId: t.tallaId, cantidad: t.cantidad })) } }] },
    },
  });
  const op = await prisma.ordenProduccion.create({
    data: { consecutivo: opts.consecutivoOP, ocId: oc.id, estado: 'AMARRADA' },
  });
  await prisma.ordenCompra.update({ where: { id: oc.id }, data: { estado: 'EN_PRODUCCION' } });
  const opLinea = await prisma.ordenProduccionLinea.create({
    data: { opId: op.id, productoConfiguradoId: opts.productoConfiguradoId },
  });
  for (const t of opts.tallas) {
    const inv = await prisma.inventarioPT.findUnique({
      where: { productoConfiguradoId_tallaId_bodegaId: {
        productoConfiguradoId: opts.productoConfiguradoId, tallaId: t.tallaId, bodegaId: opts.bodegaId } },
    });
    if (!inv || inv.cantDisponible - inv.cantReservada < t.cantidad)
      throw new Error(`Stock insuficiente para amarrar talla ${t.tallaId}`);
    const olt = await prisma.ordenProduccionLineaTalla.create({
      data: { opLineaId: opLinea.id, tallaId: t.tallaId, cantPedida: t.cantidad, cantAmarrada: t.cantidad, cantAProducir: 0 },
    });
    await prisma.inventarioPT.update({ where: { id: inv.id }, data: { cantReservada: { increment: t.cantidad } } });
    await prisma.reservaInventarioPT.create({
      data: { opLineaTallaId: olt.id, inventarioPTId: inv.id, cantidad: t.cantidad },
    });
  }
  return op;
}
```

- [ ] **Step 5: Asegurar stock suficiente + llamar al helper para 2 OPs**

Antes de llamar al helper, garantizá stock alto en una bodega para el producto/tallas elegidas (subí `cantDisponible` en los upserts de `inventarioPT` del seed, p.ej. 100 por talla en la bodega principal). **Idempotencia del stock:** los upserts de `inventarioPT` deben resetear la reserva en el `update` (`update: { cantDisponible: 100, cantReservada: 0 }`), si no, al re-correr el seed las reservas de corridas previas dejan `cantReservada` inflado y el helper falla por "stock insuficiente". Luego, al final de `main`, creá dos OPs amarradas — una para el cliente AL_DIA y otra para el VENCIDO — con consecutivos que no choquen (usá números altos, p.ej. 9001/9002 OC y 9001/9002 OP, o calculá max+1). Ejemplo:
```ts
  // (clienteAlDia, clienteVencido, productoId, bodegaId, y un par de tallaIds vienen de arriba en el seed)
  await crearOPAmarrada({ clienteId: clienteAlDia.id, productoConfiguradoId: prodId, bodegaId: bodPrincipal.id,
    tallas: [{ tallaId: t40, cantidad: 10 }, { tallaId: t41, cantidad: 8 }], consecutivoOC: 9001, consecutivoOP: 9001 });
  await crearOPAmarrada({ clienteId: clienteVencido.id, productoConfiguradoId: prodId, bodegaId: bodPrincipal.id,
    tallas: [{ tallaId: t40, cantidad: 6 }, { tallaId: t41, cantidad: 6 }], consecutivoOC: 9002, consecutivoOP: 9002 });
```
Ajustá los nombres de variables (`clienteAlDia`, `clienteVencido`, `prodId`, `bodPrincipal`, `t40`, `t41`) a los reales del seed. **IMPORTANTE:** estos inserts NO son idempotentes (usan `create` con consecutivos fijos) → para re-correr el seed sin chocar, al inicio de la sección borrá despachos/OPs/OCs de prueba con esos consecutivos:
```ts
  await prisma.despachoLinea.deleteMany({ where: { despacho: { op: { consecutivo: { in: [9001, 9002] } } } } });
  await prisma.despacho.deleteMany({ where: { op: { consecutivo: { in: [9001, 9002] } } } });
  await prisma.reservaInventarioPT.deleteMany({ where: { opLineaTalla: { opLinea: { op: { consecutivo: { in: [9001, 9002] } } } } } });
  await prisma.ordenProduccionLineaTalla.deleteMany({ where: { opLinea: { op: { consecutivo: { in: [9001, 9002] } } } } });
  await prisma.ordenProduccionLinea.deleteMany({ where: { op: { consecutivo: { in: [9001, 9002] } } } });
  await prisma.ordenProduccion.deleteMany({ where: { consecutivo: { in: [9001, 9002] } } });
  await prisma.ordenCompraLineaTalla.deleteMany({ where: { ocLinea: { oc: { consecutivo: { in: [9001, 9002] } } } } });
  await prisma.ordenCompraLinea.deleteMany({ where: { oc: { consecutivo: { in: [9001, 9002] } } } });
  await prisma.ordenCompra.deleteMany({ where: { consecutivo: { in: [9001, 9002] } } });
```

- [ ] **Step 6: Correr el seed contra la DB local**

Run: `cd backend && npm run seed && npm run seed:catalogo && npm run seed:demo`
Expected: `Seed demo OK` sin errores; las 2 OPs 9001/9002 quedan AMARRADAS y totalmente amarradas.

- [ ] **Step 7: Commit**

```bash
git add backend/prisma/seed-demo.ts
git commit -m "feat(seed): gerente + cliente VENCIDO + 2 OPs totalmente amarradas para demo de despacho"
```

---

## Task 5: Frontend — EstadoOP.DESPACHADA + AuthService.rol()

**Files:**
- Modify: `frontend/src/app/core/api/models/pedidos.models.ts`
- Modify: `frontend/src/app/features/pedidos/oc/estado-badge.ts`
- Modify: `frontend/src/app/core/auth/auth.service.ts`
- Test: `frontend/src/app/core/auth/auth.service.spec.ts` (crear si no existe)

- [ ] **Step 1: Agregar DESPACHADA al tipo y al badge**

En `pedidos.models.ts`, en el tipo/union `EstadoOP`, agregá `'DESPACHADA'`. (Si es `export type EstadoOP = 'CREADA' | 'AMARRADA' | 'EN_PRODUCCION' | 'ANULADA';` → agregá `| 'DESPACHADA'`.)

En `estado-badge.ts`, en el record `OP`, agregá la entrada (antes de `ANULADA`):
```ts
  DESPACHADA:    { clase: 'badge-success', label: 'Despachada' },
```

- [ ] **Step 2: Write the failing test for rol()**

Creá `frontend/src/app/core/auth/auth.service.spec.ts`:
```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';

// JWT de prueba con payload { role: 'GERENTE' } (header.payload.signature, base64url del payload)
function jwtConRol(role: string): string {
  const payload = btoa(JSON.stringify({ sub: 1, username: 'x', role }));
  return `h.${payload}.s`;
}

describe('AuthService.rol', () => {
  let auth: AuthService;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [AuthService, provideHttpClient(), provideHttpClientTesting()] });
    auth = TestBed.inject(AuthService);
    localStorage.clear();
  });
  afterEach(() => localStorage.clear());

  it('devuelve null si no hay token', () => {
    expect(auth.rol()).toBeNull();
  });

  it('decodifica el role del JWT', () => {
    localStorage.setItem('accessToken', jwtConRol('GERENTE'));
    expect(auth.rol()).toBe('GERENTE');
  });

  it('devuelve null si el token es inválido', () => {
    localStorage.setItem('accessToken', 'no-es-un-jwt');
    expect(auth.rol()).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify fail**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='**/auth.service.spec.ts'`
Expected: FAIL (`auth.rol is not a function`).

- [ ] **Step 4: Implement rol()**

En `auth.service.ts`, agregá el método a la clase:
```ts
  rol(): string | null {
    const t = this.accessToken;
    if (!t) return null;
    try {
      const payload = JSON.parse(atob(t.split('.')[1]));
      return payload.role ?? null;
    } catch {
      return null;
    }
  }
```

- [ ] **Step 5: Run to verify pass**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='**/auth.service.spec.ts'`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/core/api/models/pedidos.models.ts frontend/src/app/features/pedidos/oc/estado-badge.ts frontend/src/app/core/auth/auth.service.ts frontend/src/app/core/auth/auth.service.spec.ts
git commit -m "feat(despacho): EstadoOP.DESPACHADA en badge + AuthService.rol() desde el JWT"
```

---

## Task 6: Frontend — DespachosApi + modelos

**Files:**
- Create: `frontend/src/app/core/api/despachos.api.ts` + `despachos.api.spec.ts`
- Modify: `frontend/src/app/core/api/models/pedidos.models.ts` (agregar modelos de despacho al final, o un archivo nuevo `models/despachos.models.ts`)

- [ ] **Step 1: Write the failing test**

Creá `frontend/src/app/core/api/despachos.api.spec.ts`:
```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DespachosApi } from './despachos.api';

describe('DespachosApi', () => {
  let api: DespachosApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [DespachosApi, provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(DespachosApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('listar hace GET /despachos', () => {
    api.listar().subscribe();
    const req = http.expectOne('http://localhost:3001/despachos');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('despachar hace POST /despachos con el body', () => {
    api.despachar({ opId: 1, autorizar: true, motivo: 'x' }).subscribe();
    const req = http.expectOne('http://localhost:3001/despachos');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ opId: 1, autorizar: true, motivo: 'x' });
    req.flush({ id: 1 });
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='**/despachos.api.spec.ts'`
Expected: FAIL (cannot find module).

- [ ] **Step 3: Crear modelos**

Agregá al final de `frontend/src/app/core/api/models/pedidos.models.ts`:
```ts
export interface DespacharParams { opId: number; autorizar?: boolean; motivo?: string; }
export interface DespachoListItem {
  id: number;
  consecutivo: number;
  fecha: string;
  autorizadoPorId: number | null;
  op: { consecutivo: number; oc: { cliente: { nombre: string } } };
}
export interface Despacho { id: number; consecutivo: number; }
```

- [ ] **Step 4: Crear la API**

Creá `frontend/src/app/core/api/despachos.api.ts`:
```ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Despacho, DespachoListItem, DespacharParams } from './models/pedidos.models';

@Injectable({ providedIn: 'root' })
export class DespachosApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/despachos`;

  listar() { return this.http.get<DespachoListItem[]>(this.base); }
  despachar(p: DespacharParams) { return this.http.post<Despacho>(this.base, p); }
}
```

- [ ] **Step 5: Run to verify pass**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='**/despachos.api.spec.ts'`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/core/api/despachos.api.ts frontend/src/app/core/api/despachos.api.spec.ts frontend/src/app/core/api/models/pedidos.models.ts
git commit -m "feat(despacho): DespachosApi (listar + despachar) + modelos"
```

---

## Task 7: Frontend — listado de despachos + ruta + nav

**Files:**
- Create: `frontend/src/app/features/despachos/despachos-list.component.ts` + `.spec.ts`
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/layout/shell/shell.component.ts`

- [ ] **Step 1: Write the failing test**

Creá `frontend/src/app/features/despachos/despachos-list.component.spec.ts`:
```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DespachosListComponent } from './despachos-list.component';

describe('DespachosListComponent', () => {
  let http: HttpTestingController;
  it('lista los despachos al iniciar y los renderiza', () => {
    TestBed.configureTestingModule({
      imports: [DespachosListComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(DespachosListComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('http://localhost:3001/despachos').flush([
      { id: 1, consecutivo: 5, fecha: '2026-06-05', autorizadoPorId: null, op: { consecutivo: 12, oc: { cliente: { nombre: 'Minera El Roble' } } } },
    ]);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('DSP-5');
    expect(text).toContain('Minera El Roble');
    http.verify();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='**/despachos-list.component.spec.ts'`
Expected: FAIL (cannot find module).

- [ ] **Step 3: Implement the component**

Creá `frontend/src/app/features/despachos/despachos-list.component.ts`:
```ts
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DespachosApi } from '../../core/api/despachos.api';
import { DespachoListItem } from '../../core/api/models/pedidos.models';

@Component({
  selector: 'app-despachos-list',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div class="page">
      <div class="page-header"><div class="ph-title">Despachos</div></div>
      <div class="card"><div class="card-body">
        @if (despachos().length) {
          <table class="tbl">
            <thead><tr><th>Despacho</th><th>OP</th><th>Cliente</th><th>Fecha</th><th>Autorizado</th></tr></thead>
            <tbody>
              @for (d of despachos(); track d.id) {
                <tr>
                  <td class="mono">DSP-{{ d.consecutivo }}</td>
                  <td class="mono">OP-{{ d.op.consecutivo }}</td>
                  <td>{{ d.op.oc.cliente.nombre }}</td>
                  <td>{{ d.fecha | date:'dd MMM y' }}</td>
                  <td>@if (d.autorizadoPorId) { <span class="badge badge-accent">autorizado</span> } @else { <span class="cell-sub">—</span> }</td>
                </tr>
              }
            </tbody>
          </table>
        } @else {
          <div class="empty"><h4>Sin despachos todavía</h4><p class="cell-sub">Los despachos aparecerán acá cuando se despache una OP.</p></div>
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
export class DespachosListComponent implements OnInit {
  private readonly api = inject(DespachosApi);
  private readonly destroyRef = inject(DestroyRef);
  despachos = signal<DespachoListItem[]>([]);

  ngOnInit(): void {
    this.api.listar().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((d) => this.despachos.set(d));
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='**/despachos-list.component.spec.ts'`
Expected: PASS.

- [ ] **Step 5: Ruta + nav**

En `app.routes.ts`, dentro de `children`, antes del redirect final:
```ts
      { path: 'despachos', loadComponent: () => import('./features/despachos/despachos-list.component').then(m => m.DespachosListComponent) },
```
En `shell.component.ts`, dentro del `nav-group` "Operación" (después del link de "Órdenes de Producción"), agregá:
```html
          <a class="nav-item" routerLink="/despachos" routerLinkActive="is-active">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h13v10H3zM16 10h3l2 3v4h-5zM7 17a2 2 0 1 0 4 0M16 17a2 2 0 1 0 4 0"/></svg></span>
            <span class="nav-label">Despachos</span>
          </a>
```

- [ ] **Step 6: Build**

Run: `cd frontend && npx ng build`
Expected: `Application bundle generation complete.` con un chunk `despachos-list-component`.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/features/despachos frontend/src/app/app.routes.ts frontend/src/app/layout/shell/shell.component.ts
git commit -m "feat(despacho): listado de despachos + ruta + nav"
```

---

## Task 8: Frontend — acción "Despachar" en OP detalle (con cartera + autorizar)

**Files:**
- Modify: `frontend/src/app/features/pedidos/op/op-detalle.component.ts`

- [ ] **Step 1: Write the failing test**

Creá/append `frontend/src/app/features/pedidos/op/op-detalle.component.spec.ts` con un test que verifique la lógica de despacho. Si el archivo no existe, crealo con este contenido; si existe, agregá el `describe` interno. Mínimo:
```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { OpDetalleComponent } from './op-detalle.component';

describe('OpDetalleComponent — despacho', () => {
  let http: HttpTestingController;
  function crear() {
    TestBed.configureTestingModule({
      imports: [OpDetalleComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(OpDetalleComponent);
    http = TestBed.inject(HttpTestingController);
    return fixture;
  }
  afterEach(() => { localStorage.clear(); });

  it('despachar POSTea a /despachos con el opId', () => {
    const fixture = crear();
    const cmp = fixture.componentInstance;
    cmp.op.set({ id: 7, consecutivo: 12, estado: 'AMARRADA', ocId: 9 } as any);
    cmp.despachar();
    const req = http.expectOne('http://localhost:3001/despachos');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ opId: 7 });
    req.flush({ id: 1, consecutivo: 1 });
    http.verify();
  });

  it('un 409 de cartera activa el banner de bloqueo', () => {
    const fixture = crear();
    const cmp = fixture.componentInstance;
    cmp.op.set({ id: 7, consecutivo: 12, estado: 'AMARRADA', ocId: 9 } as any);
    cmp.despachar();
    const req = http.expectOne('http://localhost:3001/despachos');
    req.flush({ message: 'Cliente con cartera VENCIDO — requiere autorización del gerente' }, { status: 409, statusText: 'Conflict' });
    expect(cmp.carteraBloqueada()).toBe(true);
    http.verify();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='**/op-detalle.component.spec.ts'`
Expected: FAIL (`cmp.despachar is not a function`).

- [ ] **Step 3: Implement — inyectar deps y agregar estado/métodos**

En `op-detalle.component.ts`:

(a) Imports (arriba):
```ts
import { Router } from '@angular/router';
import { DespachosApi } from '../../../core/api/despachos.api';
import { AuthService } from '../../../core/auth/auth.service';
import { FormsModule } from '@angular/forms';
```
Agregá `FormsModule` al array `imports` del `@Component`.

(b) En la clase, junto a las otras inyecciones/signals:
```ts
  private readonly despachosApi = inject(DespachosApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  carteraBloqueada = signal(false);
  motivo = signal('');
  puedeAutorizar = computed(() => { const r = this.auth.rol(); return r === 'GERENTE' || r === 'ADMIN'; });
```

(c) Métodos:
```ts
  despachable(): boolean {
    const o = this.op();
    return !!o && o.estado === 'AMARRADA' && this.resumen().producir === 0;
  }

  despachar(autorizar = false) {
    const o = this.op();
    if (!o || this.accion()) return;
    this.accion.set(true); this.error.set('');
    const body = autorizar ? { opId: o.id, autorizar: true, motivo: this.motivo() } : { opId: o.id };
    this.despachosApi.despachar(body).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.accion.set(false); this.router.navigateByUrl('/despachos'); },
      error: (e) => {
        this.accion.set(false);
        if (e?.status === 409) { this.carteraBloqueada.set(true); this.error.set(this.msg(e)); }
        else { this.error.set(this.msg(e)); }
      },
    });
  }

  private msg(e: any): string {
    const m = e?.error?.message;
    return Array.isArray(m) ? m.join(' ') : (m ?? 'No se pudo despachar la OP');
  }
```

- [ ] **Step 4: Implement — botón + banner en el template**

En el `.page-actions` del hero, agregá el botón Despachar cuando aplique (junto a "Anular OP"):
```html
          @if (despachable()) {
            <button class="btn btn-primary" type="button" [class.is-loading]="accion()" [disabled]="accion()" (click)="despachar()">Despachar</button>
          }
```
Y un banner de cartera (poné este bloque justo después del `</div>` que cierra `.op-hero`):
```html
        @if (carteraBloqueada()) {
          <div class="card cartera-banner"><div class="card-body">
            <p style="color:var(--error);font-weight:var(--fw-medium)">⚠ {{ error() }}</p>
            @if (puedeAutorizar()) {
              <div style="display:flex;gap:var(--sp-3);align-items:center;margin-top:var(--sp-3)">
                <input class="input" style="flex:1" placeholder="Motivo de la autorización" [ngModel]="motivo()" (ngModelChange)="motivo.set($event)" />
                <button class="btn btn-primary" type="button" [class.is-loading]="accion()" [disabled]="accion()" (click)="despachar(true)">Autorizar y despachar</button>
              </div>
            } @else {
              <p class="cell-sub" style="margin-top:var(--sp-2)">Solo un gerente puede autorizar este despacho.</p>
            }
          </div></div>
        }
```
Agregá al `styles`:
```css
    .cartera-banner{border-color:color-mix(in oklch,var(--error) 40%,var(--border));margin-bottom:var(--sp-5)}
    .input{width:100%;padding:var(--sp-2) var(--sp-3);border:var(--bw) solid var(--border);border-radius:var(--r-sm);background:var(--surface);color:var(--text)}
```

- [ ] **Step 5: Run to verify pass**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='**/op-detalle.component.spec.ts'`
Expected: PASS (2 tests).

- [ ] **Step 6: Build**

Run: `cd frontend && npx ng build`
Expected: `Application bundle generation complete.`

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/features/pedidos/op/op-detalle.component.ts frontend/src/app/features/pedidos/op/op-detalle.component.spec.ts
git commit -m "feat(despacho): accion Despachar en OP detalle + banner cartera + autorizar gerente"
```

---

## Task 9: Verificación integral

- [ ] **Step 1: Suite backend completa**

Run: `cd backend && npx jest`
Expected: PASS, todas las suites (incluye despacho-lineas + despacho.service).

- [ ] **Step 2: Suite frontend completa**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless`
Expected: PASS, todos los specs.

- [ ] **Step 3: Build de producción frontend**

Run: `cd frontend && npx ng build --configuration production`
Expected: `Application bundle generation complete.`

- [ ] **Step 4: E2E manual (DB local + backend + front)**

1. DB local arriba + seeds corridos (Tasks 1/4).
2. `cd backend && npm run build && npm run start:prod`; `cd frontend && npm start`.
3. **Camino feliz:** login admin/admin123 → OP del cliente AL_DIA (consecutivo 9001) → "Despachar" → redirige a /despachos, aparece DSP-N; la OP queda DESPACHADA y la OC CERRADA; inventario descontado.
4. **Camino bloqueado:** OP del cliente VENCIDO (9002) → "Despachar" → banner de cartera; como admin (rol ADMIN) → escribir motivo → "Autorizar y despachar" → procede; el despacho queda con `autorizadoPorId`.

- [ ] **Step 5: Push de develop (NO mergear a master)**

```bash
git push origin develop
```
Demo 3 queda en `develop` hasta mostrarse (ver [[botas-workflow-branches]]).

---

## Notas de alcance (de la spec)

- Despacho **total por OP** (no parcial); gate por `estadoCartera` (cupo fuera de alcance); override de gerente en 1 paso.
- Precondición: OP totalmente amarrada (`cantAProducir == 0`); la porción a producir llega con el MES.
- Sin facturación (el Despacho es el gancho futuro).
