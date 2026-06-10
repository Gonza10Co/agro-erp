# Calidad MES (Demo 6) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Daños/reprocesos tipificados con imputación al centro de costo causante, acta digital de baja con reposición automática del par, y dashboard de indicadores de calidad.

**Architecture:** Módulo backend nuevo `calidad` (controller delgado + service Prisma + lógica pura en `calidad-core.ts`), dos modelos nuevos (`TipoDano`, `IncidenciaCalidad`), `EstadoPar += DADO_DE_BAJA` y autorrelación de reposición en `Par`. Front: API client nuevo, panel de reporte en pantalla-operario, dashboard nuevo, y visibilidad de bajas/cancelados en tablero y par-detalle. Spec: `docs/superpowers/specs/2026-06-10-calidad-mes-design.md`.

**Tech Stack:** NestJS + Prisma + PostgreSQL (backend :3001), Angular 19 standalone + signals (frontend :4200), Jest (back), Karma (front).

**Convenciones del repo (obligatorias):** TDD; commits en español; migraciones con `npx prisma migrate dev` (nunca `db push`); consecutivos solo vía secuencias PG (acá NO se necesita: el código de reposición deriva del código del par). Comandos desde la raíz del repo salvo indicación.

---

### Task 0: Branch de trabajo

**Files:** ninguno (git)

- [ ] **Step 1: Crear branch desde develop**

```bash
git checkout develop
git pull
git checkout -b feat/calidad-mes
```

Expected: `Switched to a new branch 'feat/calidad-mes'`

---

### Task 1: Schema Prisma + migración

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Agregar enum `ClaseDano` y valor `DADO_DE_BAJA` a `EstadoPar`**

En `backend/prisma/schema.prisma`, el enum `EstadoPar` queda:

```prisma
enum EstadoPar {
  EN_PROCESO
  TERMINADO
  CANCELADO
  DADO_DE_BAJA
}
```

Y justo después agregar:

```prisma
enum ClaseDano {
  BAJA        // daño total: acta + reposición automática
  REPROCESO   // recuperable: solo registro
}
```

- [ ] **Step 2: Agregar modelos `TipoDano` e `IncidenciaCalidad`**

Al final del bloque MES del schema (después de `model Maquina`):

```prisma
model TipoDano {
  id             Int       @id @default(autoincrement())
  codigo         String    @unique
  nombre         String
  celulaCausante Celula    // centro de costo al que se imputa
  clase          ClaseDano
  activo         Boolean   @default(true)

  incidencias IncidenciaCalidad[]
}

model IncidenciaCalidad {
  id              Int      @id @default(autoincrement())
  parId           Int
  par             Par      @relation("incidencias", fields: [parId], references: [id])
  tipoDanoId      Int
  tipoDano        TipoDano @relation(fields: [tipoDanoId], references: [id])
  celulaDeteccion Celula   // dónde se detectó (puede ≠ causante)
  operarioId      Int
  operario        Operario @relation(fields: [operarioId], references: [id])
  descripcion     String?  // obligatoria en BAJA (acta) — se valida en el service
  autorizadoPorId Int?     // solo BAJA: user GERENTE/ADMIN del JWT
  autorizadoPor   User?    @relation(fields: [autorizadoPorId], references: [id])
  parReposicionId Int?     @unique // solo BAJA: el par creado para reponer
  parReposicion   Par?     @relation("reposicionDeIncidencia", fields: [parReposicionId], references: [id])
  timestamp       DateTime @default(now())

  @@index([parId])
  @@index([tipoDanoId])
}
```

- [ ] **Step 3: Inversas y autorrelación en modelos existentes**

En `model Par`, agregar estos campos (después de `estado`):

```prisma
  reponeAParId Int? // si este par es una reposición, el par dado de baja que repone

  reponeA     Par?  @relation("reposicion", fields: [reponeAParId], references: [id])
  repuestoPor Par[] @relation("reposicion")

  incidencias            IncidenciaCalidad[] @relation("incidencias")
  reposicionDeIncidencia IncidenciaCalidad?  @relation("reposicionDeIncidencia")
```

y agregar `@@index([reponeAParId])` junto a los índices existentes de `Par`.

En `model Operario`, agregar: `incidencias IncidenciaCalidad[]`.
En `model User`, agregar: `incidenciasAutorizadas IncidenciaCalidad[]`.

- [ ] **Step 4: Generar la migración**

```bash
cd backend
npx prisma migrate dev --name calidad_mes
```

Expected: `Your database is now in sync with your schema.` y carpeta nueva `backend/prisma/migrations/*_calidad_mes/`. (Requiere Docker `agro-erp-pg` arriba: `docker start agro-erp-pg`.)

- [ ] **Step 5: Verificar que la suite back sigue verde**

```bash
npm run test:back
```

Expected: 115 tests PASS (nada roto por el schema).

- [ ] **Step 6: Commit**

```bash
git add backend/prisma
git commit -m "feat(calidad): schema TipoDano + IncidenciaCalidad + DADO_DE_BAJA + reposición en Par"
```

---

### Task 2: Lógica pura — `codigoReposicion` y `validarReporte`

**Files:**
- Create: `backend/src/calidad/calidad-core.ts`
- Test: `backend/src/calidad/calidad-core.spec.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `backend/src/calidad/calidad-core.spec.ts`:

```ts
import { codigoReposicion, validarReporte } from './calidad-core';

describe('codigoReposicion', () => {
  it('par base → -R1', () => {
    expect(codigoReposicion('OF12-0003')).toBe('OF12-0003-R1');
  });
  it('reposición -R1 → -R2 (cadena continua)', () => {
    expect(codigoReposicion('OF12-0003-R1')).toBe('OF12-0003-R2');
  });
  it('-R9 → -R10 (números de más de un dígito)', () => {
    expect(codigoReposicion('OF12-0003-R9')).toBe('OF12-0003-R10');
  });
  it('no confunde el sufijo numérico del código base con una reposición', () => {
    // termina en dígitos pero sin "-R": es un código base normal
    expect(codigoReposicion('OF5-0001')).toBe('OF5-0001-R1');
  });
});

describe('validarReporte', () => {
  it('REPROCESO no exige nada', () => {
    expect(validarReporte('REPROCESO', undefined, 'VENTAS')).toBeNull();
  });
  it('BAJA con rol insuficiente → ROL_INSUFICIENTE', () => {
    expect(validarReporte('BAJA', 'robot dañó capellada', 'VENTAS')).toBe('ROL_INSUFICIENTE');
  });
  it('BAJA sin descripción → SIN_DESCRIPCION (gerente)', () => {
    expect(validarReporte('BAJA', undefined, 'GERENTE')).toBe('SIN_DESCRIPCION');
    expect(validarReporte('BAJA', '   ', 'GERENTE')).toBe('SIN_DESCRIPCION');
  });
  it('BAJA válida con GERENTE y con ADMIN → null', () => {
    expect(validarReporte('BAJA', 'acta x', 'GERENTE')).toBeNull();
    expect(validarReporte('BAJA', 'acta x', 'ADMIN')).toBeNull();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
npm run test:back -- calidad-core
```

Expected: FAIL — `Cannot find module './calidad-core'`.

- [ ] **Step 3: Implementación mínima**

Crear `backend/src/calidad/calidad-core.ts`:

```ts
import { ClaseDano } from '@prisma/client';

const RE_REPOSICION = /^(?<base>.+)-R(?<n>\d+)$/;

/** Código del par de reposición: `OF12-0003` → `-R1`; `-R1` → `-R2`. */
export function codigoReposicion(codigo: string): string {
  const m = RE_REPOSICION.exec(codigo);
  if (!m?.groups) return `${codigo}-R1`;
  return `${m.groups['base']}-R${Number(m.groups['n']) + 1}`;
}

export type ErrorReporte = 'SIN_DESCRIPCION' | 'ROL_INSUFICIENTE' | null;

/** Reglas del acta de baja: rol GERENTE/ADMIN + descripción obligatoria. REPROCESO no exige nada. */
export function validarReporte(
  clase: ClaseDano,
  descripcion: string | undefined,
  rol: string,
): ErrorReporte {
  if (clase !== 'BAJA') return null;
  if (rol !== 'GERENTE' && rol !== 'ADMIN') return 'ROL_INSUFICIENTE';
  if (!descripcion?.trim()) return 'SIN_DESCRIPCION';
  return null;
}
```

- [ ] **Step 4: Correr y verificar que pasa**

```bash
npm run test:back -- calidad-core
```

Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/calidad
git commit -m "feat(calidad): codigoReposicion y validarReporte (lógica pura TDD)"
```

---

### Task 3: Lógica pura — `agruparIndicadores`

**Files:**
- Modify: `backend/src/calidad/calidad-core.ts`
- Test: `backend/src/calidad/calidad-core.spec.ts`

- [ ] **Step 1: Tests que fallan (agregar al spec existente)**

Agregar a `backend/src/calidad/calidad-core.spec.ts` (ajustar el import a `{ codigoReposicion, validarReporte, agruparIndicadores }`):

```ts
describe('agruparIndicadores', () => {
  const inc = (codigo: string, nombre: string, celulaCausante: any, clase: any) => ({
    tipoDano: { codigo, nombre, celulaCausante, clase },
  });

  it('agrupa por célula CAUSANTE (no por detección) y separa bajas de reprocesos', () => {
    const incidencias = [
      inc('STROBEL-RASGADO', 'Strobel rasgado', 'GUARNICION', 'REPROCESO'),
      inc('STROBEL-RASGADO', 'Strobel rasgado', 'GUARNICION', 'REPROCESO'),
      inc('DANO-ROBOT', 'Daño de robot', 'INYECCION', 'BAJA'),
    ];
    const { centros } = agruparIndicadores(incidencias, { GUARNICION: 10, INYECCION: 4 });
    const guar = centros.find((c) => c.celula === 'GUARNICION')!;
    expect(guar).toMatchObject({ total: 2, bajas: 0, reprocesos: 2, paresProcesados: 10, pctDano: 0.2 });
    const iny = centros.find((c) => c.celula === 'INYECCION')!;
    expect(iny).toMatchObject({ total: 1, bajas: 1, reprocesos: 0, pctDano: 0.25 });
  });

  it('siempre devuelve los 4 centros de costo, con pctDano null si no hubo pares procesados', () => {
    const { centros } = agruparIndicadores([], {});
    expect(centros.map((c) => c.celula)).toEqual(['CORTE', 'GUARNICION', 'ALMACEN', 'INYECCION']);
    expect(centros.every((c) => c.total === 0 && c.pctDano === null)).toBe(true);
  });

  it('topDanos ordena por frecuencia y corta en 5', () => {
    const incidencias = [
      ...Array(3).fill(inc('A', 'A', 'CORTE', 'BAJA')),
      ...Array(5).fill(inc('B', 'B', 'CORTE', 'REPROCESO')),
      inc('C', 'C', 'GUARNICION', 'REPROCESO'),
      inc('D', 'D', 'GUARNICION', 'REPROCESO'),
      inc('E', 'E', 'INYECCION', 'BAJA'),
      inc('F', 'F', 'INYECCION', 'BAJA'),
    ];
    const { topDanos } = agruparIndicadores(incidencias, {});
    expect(topDanos).toHaveLength(5);
    expect(topDanos[0]).toMatchObject({ codigo: 'B', total: 5 });
    expect(topDanos[1]).toMatchObject({ codigo: 'A', total: 3 });
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
npm run test:back -- calidad-core
```

Expected: FAIL — `agruparIndicadores is not a function`.

- [ ] **Step 3: Implementación**

Agregar al final de `backend/src/calidad/calidad-core.ts`:

```ts
import { Celula } from '@prisma/client'; // ← agregar al import existente de @prisma/client

/** Células que son centro de costo imputable (PT no causa daños en el catálogo). */
export const CENTROS_DE_COSTO: Celula[] = ['CORTE', 'GUARNICION', 'ALMACEN', 'INYECCION'];

export interface IncidenciaConTipo {
  tipoDano: { codigo: string; nombre: string; celulaCausante: Celula; clase: ClaseDano };
}

export interface CentroIndicador {
  celula: Celula;
  total: number;
  bajas: number;
  reprocesos: number;
  paresProcesados: number;
  pctDano: number | null; // null si no hay denominador
}

export interface TopDano {
  codigo: string;
  nombre: string;
  celulaCausante: Celula;
  clase: ClaseDano;
  total: number;
}

/** Imputación por centro de costo + top 5 tipos de daño. Puro. */
export function agruparIndicadores(
  incidencias: IncidenciaConTipo[],
  eventosPorCelula: Partial<Record<Celula, number>>,
): { centros: CentroIndicador[]; topDanos: TopDano[] } {
  const centros = CENTROS_DE_COSTO.map((celula) => {
    const deCelula = incidencias.filter((i) => i.tipoDano.celulaCausante === celula);
    const bajas = deCelula.filter((i) => i.tipoDano.clase === 'BAJA').length;
    const paresProcesados = eventosPorCelula[celula] ?? 0;
    return {
      celula,
      total: deCelula.length,
      bajas,
      reprocesos: deCelula.length - bajas,
      paresProcesados,
      pctDano: paresProcesados > 0 ? deCelula.length / paresProcesados : null,
    };
  });

  const porTipo = new Map<string, TopDano>();
  for (const i of incidencias) {
    const t = porTipo.get(i.tipoDano.codigo) ?? { ...i.tipoDano, total: 0 };
    t.total++;
    porTipo.set(i.tipoDano.codigo, t);
  }
  const topDanos = [...porTipo.values()].sort((a, b) => b.total - a.total).slice(0, 5);

  return { centros, topDanos };
}
```

(Unificar el import: `import { Celula, ClaseDano } from '@prisma/client';` al tope del archivo.)

- [ ] **Step 4: Correr y verificar que pasa**

```bash
npm run test:back -- calidad-core
```

Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/calidad
git commit -m "feat(calidad): agruparIndicadores por centro de costo + top daños (puro, TDD)"
```

---

### Task 4: `CalidadService` — tipos de daño y reporte REPROCESO

**Files:**
- Create: `backend/src/calidad/dto/reportar-incidencia.dto.ts`
- Create: `backend/src/calidad/calidad.service.ts`
- Test: `backend/src/calidad/calidad.service.spec.ts`

- [ ] **Step 1: DTO (sin test propio: lo valida el ValidationPipe global)**

Crear `backend/src/calidad/dto/reportar-incidencia.dto.ts`:

```ts
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class ReportarIncidenciaDto {
  @IsInt() @Min(1) tipoDanoId!: number;
  @IsInt() @Min(1) operarioId!: number;
  @IsOptional() @IsString() @MaxLength(500) descripcion?: string;
}
```

- [ ] **Step 2: Tests que fallan (mock Prisma, patrón `fabricacion.service.spec.ts`)**

Crear `backend/src/calidad/calidad.service.spec.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CalidadService } from './calidad.service';

const gerente = { sub: 3, role: 'GERENTE' };
const ventas = { sub: 7, role: 'VENTAS' };

function makePrisma(overrides: any = {}) {
  const tx = {
    par: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({ id: 99, codigo: 'OF1-0001-R1' }),
    },
    incidenciaCalidad: { create: jest.fn().mockResolvedValue({ id: 1 }) },
    ...overrides.tx,
  };
  const prisma: any = {
    par: { findUnique: jest.fn() },
    tipoDano: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    incidenciaCalidad: {
      create: jest.fn().mockResolvedValue({ id: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    eventoTrazabilidad: { groupBy: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
    ...overrides.root,
  };
  return { prisma, tx };
}

const parEnProceso = {
  id: 50, codigo: 'OF1-0001', ofId: 1, productoConfiguradoId: 10, tallaId: 2,
  celulaActual: 'INYECCION', estado: 'EN_PROCESO',
};
const tipoReproceso = {
  id: 4, codigo: 'STROBEL-RASGADO', nombre: 'Strobel rasgado',
  celulaCausante: 'GUARNICION', clase: 'REPROCESO', activo: true,
};
const dto = { tipoDanoId: 4, operarioId: 9 };

describe('CalidadService.listarTiposDano', () => {
  it('lista solo tipos activos', async () => {
    const { prisma } = makePrisma();
    await new CalidadService(prisma).listarTiposDano();
    expect(prisma.tipoDano.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { activo: true } }),
    );
  });
});

describe('CalidadService.reportar — REPROCESO', () => {
  it('crea la incidencia con célula de detección y NO toca el par', async () => {
    const { prisma } = makePrisma();
    prisma.par.findUnique.mockResolvedValue(parEnProceso);
    prisma.tipoDano.findUnique.mockResolvedValue(tipoReproceso);

    const res = await new CalidadService(prisma).reportar('OF1-0001', dto, ventas);

    expect(prisma.incidenciaCalidad.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parId: 50, tipoDanoId: 4, celulaDeteccion: 'INYECCION', operarioId: 9,
        }),
      }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(res.parReposicion).toBeNull();
  });

  it('404 si el par no existe', async () => {
    const { prisma } = makePrisma();
    prisma.par.findUnique.mockResolvedValue(null);
    await expect(new CalidadService(prisma).reportar('X', dto, ventas))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('404 si el tipo de daño no existe o está inactivo', async () => {
    const { prisma } = makePrisma();
    prisma.par.findUnique.mockResolvedValue(parEnProceso);
    prisma.tipoDano.findUnique.mockResolvedValue({ ...tipoReproceso, activo: false });
    await expect(new CalidadService(prisma).reportar('OF1-0001', dto, ventas))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('409 si el par no está EN_PROCESO (terminado / cancelado / dado de baja)', async () => {
    for (const estado of ['TERMINADO', 'CANCELADO', 'DADO_DE_BAJA']) {
      const { prisma } = makePrisma();
      prisma.par.findUnique.mockResolvedValue({ ...parEnProceso, estado });
      prisma.tipoDano.findUnique.mockResolvedValue(tipoReproceso);
      await expect(new CalidadService(prisma).reportar('OF1-0001', dto, ventas))
        .rejects.toBeInstanceOf(ConflictException);
    }
  });

  it('400 con campo concreto si el operario no existe (P2003)', async () => {
    const { prisma } = makePrisma();
    prisma.par.findUnique.mockResolvedValue(parEnProceso);
    prisma.tipoDano.findUnique.mockResolvedValue(tipoReproceso);
    prisma.incidenciaCalidad.create.mockRejectedValue({ code: 'P2003' });
    await expect(new CalidadService(prisma).reportar('OF1-0001', dto, ventas))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});
```

- [ ] **Step 3: Correr y verificar que falla**

```bash
npm run test:back -- calidad.service
```

Expected: FAIL — `Cannot find module './calidad.service'`.

- [ ] **Step 4: Implementación (REPROCESO; la rama BAJA queda para Task 5)**

Crear `backend/src/calidad/calidad.service.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { agruparIndicadores, codigoReposicion, validarReporte } from './calidad-core';
import { ReportarIncidenciaDto } from './dto/reportar-incidencia.dto';

interface Usuario {
  sub: number;
  role: string;
}

const MSG_ESTADO: Record<string, string> = {
  TERMINADO: 'El par ya está terminado',
  CANCELADO: 'El par está cancelado (OP anulada)',
  DADO_DE_BAJA: 'El par ya fue dado de baja',
};

@Injectable()
export class CalidadService {
  constructor(private readonly prisma: PrismaService) {}

  listarTiposDano() {
    return this.prisma.tipoDano.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
    });
  }

  async reportar(codigo: string, dto: ReportarIncidenciaDto, user: Usuario) {
    const par = await this.prisma.par.findUnique({ where: { codigo } });
    if (!par) throw new NotFoundException(`Par ${codigo} no existe`);
    const tipo = await this.prisma.tipoDano.findUnique({ where: { id: dto.tipoDanoId } });
    if (!tipo || !tipo.activo)
      throw new NotFoundException('Tipo de daño inexistente o inactivo');
    if (par.estado !== 'EN_PROCESO')
      throw new ConflictException(MSG_ESTADO[par.estado] ?? 'El par no está en proceso');

    const err = validarReporte(tipo.clase, dto.descripcion, user.role);
    if (err === 'ROL_INSUFICIENTE')
      throw new ForbiddenException('Solo un gerente puede autorizar una baja');
    if (err === 'SIN_DESCRIPCION')
      throw new BadRequestException('La baja requiere descripción (acta)');

    try {
      if (tipo.clase === 'REPROCESO') {
        const incidencia = await this.prisma.incidenciaCalidad.create({
          data: {
            parId: par.id,
            tipoDanoId: tipo.id,
            celulaDeteccion: par.celulaActual,
            operarioId: dto.operarioId,
            descripcion: dto.descripcion ?? null,
          },
          include: { tipoDano: true },
        });
        return { incidencia, parReposicion: null };
      }
      return await this.darDeBaja(par, tipo.id, dto, user);
    } catch (e: unknown) {
      // FK inválida del reporte → 400; cualquier otra cosa se relanza (patrón fabricacion).
      if ((e as { code?: string })?.code === 'P2003')
        throw new BadRequestException('Operario inexistente');
      throw e;
    }
  }

  // La rama BAJA se implementa en la Task 5; por ahora lanzar para que compile:
  private darDeBaja(
    par: { id: number; codigo: string; ofId: number; productoConfiguradoId: number; tallaId: number; celulaActual: any },
    tipoDanoId: number,
    dto: ReportarIncidenciaDto,
    user: Usuario,
  ): Promise<never> {
    throw new Error('BAJA: pendiente (Task 5)');
  }
}
```

- [ ] **Step 5: Correr y verificar que pasa**

```bash
npm run test:back -- calidad.service
```

Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/calidad
git commit -m "feat(calidad): CalidadService — tipos de daño y reporte de reproceso (TDD)"
```

---

### Task 5: `CalidadService` — flujo BAJA transaccional

**Files:**
- Modify: `backend/src/calidad/calidad.service.ts`
- Test: `backend/src/calidad/calidad.service.spec.ts`

- [ ] **Step 1: Tests que fallan (agregar al spec)**

Agregar a `backend/src/calidad/calidad.service.spec.ts`:

```ts
const tipoBaja = {
  id: 8, codigo: 'DANO-ROBOT', nombre: 'Daño de robot en capellada',
  celulaCausante: 'INYECCION', clase: 'BAJA', activo: true,
};
const dtoBaja = { tipoDanoId: 8, operarioId: 9, descripcion: 'Robot rasgó la capellada' };

describe('CalidadService.reportar — BAJA', () => {
  it('transacción completa: baja condicionada + par de reposición + acta', async () => {
    const { prisma, tx } = makePrisma();
    prisma.par.findUnique.mockResolvedValue(parEnProceso);
    prisma.tipoDano.findUnique.mockResolvedValue(tipoBaja);
    tx.incidenciaCalidad.create.mockResolvedValue({ id: 1, parReposicionId: 99 });

    const res = await new CalidadService(prisma).reportar('OF1-0001', dtoBaja, gerente);

    expect(tx.par.updateMany).toHaveBeenCalledWith({
      where: { id: 50, estado: 'EN_PROCESO' },
      data: { estado: 'DADO_DE_BAJA' },
    });
    expect(tx.par.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          codigo: 'OF1-0001-R1', ofId: 1, productoConfiguradoId: 10, tallaId: 2,
          celulaActual: 'CORTE', reponeAParId: 50,
        }),
      }),
    );
    expect(tx.incidenciaCalidad.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parId: 50, tipoDanoId: 8, autorizadoPorId: 3, parReposicionId: 99,
          descripcion: 'Robot rasgó la capellada',
        }),
      }),
    );
    expect(res.parReposicion).toMatchObject({ codigo: 'OF1-0001-R1' });
  });

  it('403 si la sesión no es GERENTE/ADMIN', async () => {
    const { prisma } = makePrisma();
    prisma.par.findUnique.mockResolvedValue(parEnProceso);
    prisma.tipoDano.findUnique.mockResolvedValue(tipoBaja);
    await expect(new CalidadService(prisma).reportar('OF1-0001', dtoBaja, ventas))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('400 si la baja viene sin descripción', async () => {
    const { prisma } = makePrisma();
    prisma.par.findUnique.mockResolvedValue(parEnProceso);
    prisma.tipoDano.findUnique.mockResolvedValue(tipoBaja);
    await expect(
      new CalidadService(prisma).reportar('OF1-0001', { tipoDanoId: 8, operarioId: 9 }, gerente),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('409 si otro proceso movió el par entre la lectura y la baja (race)', async () => {
    const { prisma, tx } = makePrisma();
    prisma.par.findUnique.mockResolvedValue(parEnProceso);
    prisma.tipoDano.findUnique.mockResolvedValue(tipoBaja);
    tx.par.updateMany.mockResolvedValue({ count: 0 });
    await expect(new CalidadService(prisma).reportar('OF1-0001', dtoBaja, gerente))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('la reposición de una reposición continúa la cadena (-R1 → -R2)', async () => {
    const { prisma, tx } = makePrisma();
    prisma.par.findUnique.mockResolvedValue({ ...parEnProceso, codigo: 'OF1-0001-R1' });
    prisma.tipoDano.findUnique.mockResolvedValue(tipoBaja);
    await new CalidadService(prisma).reportar('OF1-0001-R1', dtoBaja, gerente);
    expect(tx.par.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ codigo: 'OF1-0001-R2' }) }),
    );
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
npm run test:back -- calidad.service
```

Expected: FAIL — `BAJA: pendiente (Task 5)`.

- [ ] **Step 3: Implementar `darDeBaja` (reemplazar el stub)**

En `backend/src/calidad/calidad.service.ts`, reemplazar el método `darDeBaja` completo por:

```ts
  private darDeBaja(
    par: {
      id: number;
      codigo: string;
      ofId: number;
      productoConfiguradoId: number;
      tallaId: number;
      celulaActual: any;
    },
    tipoDanoId: number,
    dto: ReportarIncidenciaDto,
    user: Usuario,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Condición sobre el estado para no pisar un par que otra tx acaba de
      // terminar/cancelar (mismo patrón que el cierre de OF en fabricacion).
      const res = await tx.par.updateMany({
        where: { id: par.id, estado: 'EN_PROCESO' },
        data: { estado: 'DADO_DE_BAJA' },
      });
      if (res.count === 0)
        throw new ConflictException(
          'El par cambió de estado durante la baja — recargalo e intentá de nuevo',
        );

      const parReposicion = await tx.par.create({
        data: {
          codigo: codigoReposicion(par.codigo),
          ofId: par.ofId,
          productoConfiguradoId: par.productoConfiguradoId,
          tallaId: par.tallaId,
          celulaActual: 'CORTE',
          reponeAParId: par.id,
        },
      });

      const incidencia = await tx.incidenciaCalidad.create({
        data: {
          parId: par.id,
          tipoDanoId,
          celulaDeteccion: par.celulaActual,
          operarioId: dto.operarioId,
          descripcion: dto.descripcion,
          autorizadoPorId: user.sub,
          parReposicionId: parReposicion.id,
        },
        include: { tipoDano: true },
      });

      return { incidencia, parReposicion };
    });
  }
```

- [ ] **Step 4: Correr y verificar que pasa**

```bash
npm run test:back -- calidad.service
```

Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/calidad
git commit -m "feat(calidad): baja transaccional con acta y par de reposición automático (TDD)"
```

---

### Task 6: `indicadores` + controller + module + registro en AppModule

**Files:**
- Modify: `backend/src/calidad/calidad.service.ts`
- Create: `backend/src/calidad/calidad.controller.ts`
- Create: `backend/src/calidad/calidad.module.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/src/calidad/calidad.service.spec.ts`

- [ ] **Step 1: Test que falla para `indicadores`**

Agregar a `backend/src/calidad/calidad.service.spec.ts`:

```ts
describe('CalidadService.indicadores', () => {
  it('arma denominadores desde eventos por célula y delega en agruparIndicadores', async () => {
    const { prisma } = makePrisma();
    prisma.incidenciaCalidad.findMany.mockResolvedValue([
      { tipoDano: { codigo: 'X', nombre: 'X', celulaCausante: 'CORTE', clase: 'BAJA' } },
    ]);
    prisma.eventoTrazabilidad.groupBy.mockResolvedValue([
      { celula: 'CORTE', _count: { _all: 4 } },
    ]);

    const res = await new CalidadService(prisma).indicadores();

    expect(prisma.eventoTrazabilidad.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ['celula'] }),
    );
    const corte = res.centros.find((c: any) => c.celula === 'CORTE')!;
    expect(corte).toMatchObject({ total: 1, bajas: 1, paresProcesados: 4, pctDano: 0.25 });
    expect(res.topDanos[0]).toMatchObject({ codigo: 'X', total: 1 });
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
npm run test:back -- calidad.service
```

Expected: FAIL — `indicadores is not a function`.

- [ ] **Step 3: Implementar `indicadores` en el service**

Agregar al final de la clase `CalidadService`:

```ts
  async indicadores() {
    const [incidencias, eventos] = await Promise.all([
      this.prisma.incidenciaCalidad.findMany({ include: { tipoDano: true } }),
      this.prisma.eventoTrazabilidad.groupBy({ by: ['celula'], _count: { _all: true } }),
    ]);
    const eventosPorCelula = Object.fromEntries(
      eventos.map((e: { celula: string; _count: { _all: number } }) => [e.celula, e._count._all]),
    );
    return agruparIndicadores(incidencias, eventosPorCelula);
  }
```

- [ ] **Step 4: Correr y verificar que pasa**

```bash
npm run test:back -- calidad.service
```

Expected: PASS (12 tests).

- [ ] **Step 5: Controller y module (delgados, sin spec propio — patrón del repo)**

Crear `backend/src/calidad/calidad.controller.ts`:

```ts
import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CalidadService } from './calidad.service';
import { ReportarIncidenciaDto } from './dto/reportar-incidencia.dto';

@UseGuards(JwtAuthGuard)
@Controller('calidad')
export class CalidadController {
  constructor(private readonly service: CalidadService) {}

  @Get('tipos-dano')
  tiposDano() {
    return this.service.listarTiposDano();
  }

  @Post('pares/:codigo/incidencias')
  reportar(
    @Param('codigo') codigo: string,
    @Body() dto: ReportarIncidenciaDto,
    @Req() req: any,
  ) {
    return this.service.reportar(codigo, dto, req.user);
  }

  @Get('indicadores')
  indicadores() {
    return this.service.indicadores();
  }
}
```

Crear `backend/src/calidad/calidad.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { CalidadController } from './calidad.controller';
import { CalidadService } from './calidad.service';

@Module({
  controllers: [CalidadController],
  providers: [CalidadService],
})
export class CalidadModule {}
```

En `backend/src/app.module.ts`: agregar `import { CalidadModule } from './calidad/calidad.module';` y `CalidadModule,` en `imports` (después de `FabricacionModule,`).

- [ ] **Step 6: Suite back completa verde + commit**

```bash
npm run test:back
git add backend/src
git commit -m "feat(calidad): endpoint de indicadores + controller y módulo registrados"
```

Expected: todos los tests back PASS (132 = 115 + 17 nuevos).

---

### Task 7: Fabricación — mensaje de baja en `avanzar`, incidencias en `obtenerPar`, regresión de anular

**Files:**
- Modify: `backend/src/fabricacion/fabricacion.service.ts`
- Test: `backend/src/fabricacion/fabricacion.service.spec.ts`
- Test: `backend/src/pedidos/op/op.service.spec.ts`

- [ ] **Step 1: Tests que fallan**

En `backend/src/fabricacion/fabricacion.service.spec.ts`, agregar dentro del `describe('FabricacionService.avanzar', ...)`:

```ts
  it('409 con mensaje específico si el par fue dado de baja', async () => {
    const { prisma } = makePrisma();
    prisma.par.findUnique.mockResolvedValue({
      id: 1, codigo: 'OF5-0001', estado: 'DADO_DE_BAJA', celulaActual: 'CORTE',
      of: { estado: 'EN_PROCESO' },
    });
    await expect(new FabricacionService(prisma).avanzar('OF5-0001', dto))
      .rejects.toMatchObject({ message: 'El par fue dado de baja' });
  });
```

En `backend/src/pedidos/op/op.service.spec.ts`, dentro del `describe('OpService.anular', ...)`, agregar (regresión documental del spec D6 §7 — la cláusula `estado: 'EN_PROCESO'` ya excluye a los dados de baja):

```ts
  it('al anular NO toca pares DADO_DE_BAJA (solo cancela EN_PROCESO)', async () => {
    // (usar el mismo arrange del test "al anular cancela los pares en proceso..."
    //  de este describe — copiar su setup de prisma/tx tal cual)
    // y verificar la cláusula exacta:
    expect(tx.par.updateMany).toHaveBeenCalledWith({
      where: { of: { opId: 50 }, estado: 'EN_PROCESO' },
      data: { estado: 'CANCELADO' },
    });
  });
```

> Nota para el ejecutor: el test de anular existente (`op.service.spec.ts:189`) ya tiene el arrange completo; duplicarlo y cambiar solo el assert por el de arriba (ajustando `opId` al valor que use ese arrange).

- [ ] **Step 2: Correr y verificar el rojo del primero**

```bash
npm run test:back -- fabricacion.service
```

Expected: FAIL — el mensaje actual es `'El par está cancelado (OP anulada)'` para todo estado ≠ TERMINADO.

- [ ] **Step 3: Implementar el mensaje por estado en `avanzar`**

En `backend/src/fabricacion/fabricacion.service.ts`, reemplazar:

```ts
    if (par.estado !== 'EN_PROCESO')
      throw new ConflictException(
        par.estado === 'TERMINADO'
          ? 'El par ya está terminado'
          : 'El par está cancelado (OP anulada)',
      );
```

por:

```ts
    if (par.estado !== 'EN_PROCESO')
      throw new ConflictException(
        {
          TERMINADO: 'El par ya está terminado',
          CANCELADO: 'El par está cancelado (OP anulada)',
          DADO_DE_BAJA: 'El par fue dado de baja',
        }[par.estado] ?? 'El par no está en proceso',
      );
```

- [ ] **Step 4: Incluir incidencias y cadena de reposición en `obtenerPar`**

En `FabricacionService.obtenerPar`, dentro del `include` existente, agregar después de `eventos: {...}`:

```ts
        incidencias: {
          orderBy: { timestamp: 'asc' },
          include: {
            tipoDano: true,
            operario: { select: { nombre: true } },
            autorizadoPor: { select: { username: true } },
            parReposicion: { select: { codigo: true } },
          },
        },
        reponeA: { select: { codigo: true } },
        repuestoPor: { select: { codigo: true } },
```

(Sin test unitario nuevo: es un `include` declarativo; lo cubre el spec front de par-detalle y el E2E.)

- [ ] **Step 5: Suite back verde + commit**

```bash
npm run test:back
git add backend/src
git commit -m "feat(fabricacion): mensaje de par dado de baja + incidencias y cadena de reposición en el detalle del par"
```

Expected: PASS (134 tests).

---

### Task 8: Seed — catálogo de tipos de daño + limpieza idempotente

**Files:**
- Modify: `backend/prisma/seed-demo.ts`

- [ ] **Step 1: Limpieza de incidencias ANTES de borrar pares**

En `backend/prisma/seed-demo.ts`, en el bloque `── Limpieza MES (idempotente) ──`, agregar como PRIMERA línea del bloque (antes de `eventoTrazabilidad.deleteMany`):

```ts
  await prisma.incidenciaCalidad.deleteMany({
    where: { par: { of: { op: { consecutivo: { in: [9001, 9002, 9003, 9005] } } } } },
  });
```

(Las incidencias referencian pares por `parId` y `parReposicionId`; ambos pares pertenecen a la misma OF, así que este delete cubre las dos FKs.)

- [ ] **Step 2: Catálogo de tipos de daño (upsert por código, idempotente)**

Agregar después del bloque `── MES: operarios y máquinas ──`:

```ts
  // ── Calidad: catálogo de tipos de daño (briefing §5 / §Inyección) ──
  const tiposDano = [
    { codigo: 'CORTE-PEQUENO', nombre: 'Corte muy pequeño', celulaCausante: 'CORTE', clase: 'BAJA' },
    { codigo: 'CORTE-GRANDE', nombre: 'Corte muy grande', celulaCausante: 'CORTE', clase: 'REPROCESO' },
    { codigo: 'PIEZA-DANADA', nombre: 'Pieza dañada en corte', celulaCausante: 'CORTE', clase: 'BAJA' },
    { codigo: 'COSTURA-DEFECTUOSA', nombre: 'Costura defectuosa', celulaCausante: 'GUARNICION', clase: 'REPROCESO' },
    { codigo: 'STROBEL-RASGADO', nombre: 'Strobel rasgado', celulaCausante: 'GUARNICION', clase: 'REPROCESO' },
    { codigo: 'STROBEL-TORCIDO', nombre: 'Strobel torcido', celulaCausante: 'GUARNICION', clase: 'REPROCESO' },
    { codigo: 'ECONOMIZADOR-RASGADO', nombre: 'Economizador rasgado', celulaCausante: 'INYECCION', clase: 'REPROCESO' },
    { codigo: 'DANO-ROBOT', nombre: 'Daño de robot en capellada', celulaCausante: 'INYECCION', clase: 'BAJA' },
  ] as const;
  for (const t of tiposDano) {
    await prisma.tipoDano.upsert({
      where: { codigo: t.codigo },
      update: { nombre: t.nombre, celulaCausante: t.celulaCausante, clase: t.clase },
      create: t,
    });
  }
```

Y en el `console.log('Seed demo OK', {...})` final agregar la línea: `tiposDano: tiposDano.length,`.

- [ ] **Step 3: Correr el seed dos veces (idempotencia)**

```bash
cd backend
npx prisma db seed
npx prisma db seed
```

Expected: ambas corridas terminan con `Seed demo OK` y `tiposDano: 8`, sin errores de FK ni duplicados.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/seed-demo.ts
git commit -m "feat(calidad): seed del catálogo de tipos de daño + limpieza idempotente de incidencias"
```

---

### Task 9: Front — modelos + `CalidadApi`

**Files:**
- Create: `frontend/src/app/core/api/models/calidad.models.ts`
- Modify: `frontend/src/app/core/api/models/fabricacion.models.ts`
- Create: `frontend/src/app/core/api/calidad.api.ts`
- Test: `frontend/src/app/core/api/calidad.api.spec.ts`

- [ ] **Step 1: Modelos**

Crear `frontend/src/app/core/api/models/calidad.models.ts`:

```ts
import { Celula } from './fabricacion.models';

export type ClaseDano = 'BAJA' | 'REPROCESO';

export interface TipoDano {
  id: number;
  codigo: string;
  nombre: string;
  celulaCausante: Celula;
  clase: ClaseDano;
}

export interface IncidenciaPar {
  id: number;
  timestamp: string;
  celulaDeteccion: Celula;
  descripcion: string | null;
  tipoDano: TipoDano;
  operario: { nombre: string };
  autorizadoPor: { username: string } | null;
  parReposicion: { codigo: string } | null;
}

export interface ReporteResultado {
  incidencia: { id: number; tipoDano: TipoDano };
  parReposicion: { codigo: string } | null;
}

export interface CentroIndicador {
  celula: Celula;
  total: number;
  bajas: number;
  reprocesos: number;
  paresProcesados: number;
  pctDano: number | null;
}

export interface TopDano {
  codigo: string;
  nombre: string;
  celulaCausante: Celula;
  clase: ClaseDano;
  total: number;
}

export interface IndicadoresCalidad {
  centros: CentroIndicador[];
  topDanos: TopDano[];
}
```

En `frontend/src/app/core/api/models/fabricacion.models.ts`:

1. `export type EstadoPar = 'EN_PROCESO' | 'TERMINADO' | 'CANCELADO' | 'DADO_DE_BAJA';`
2. Al tope: `import { IncidenciaPar } from './calidad.models';`
3. En `interface ParDetalle` agregar:

```ts
  incidencias: IncidenciaPar[];
  reponeA: { codigo: string } | null;
  repuestoPor: { codigo: string }[];
```

4. Al final del archivo:

```ts
export const LABEL_ESTADO_PAR: Record<EstadoPar, string> = {
  EN_PROCESO: 'en proceso',
  TERMINADO: 'terminado',
  CANCELADO: 'cancelado',
  DADO_DE_BAJA: 'dado de baja',
};
```

> Ojo: los specs front existentes que construyen `ParDetalle` de prueba van a exigir los campos nuevos — agregar `incidencias: [], reponeA: null, repuestoPor: []` a esos objetos mock donde TypeScript lo pida (los señala `ng test` al compilar).

- [ ] **Step 2: Spec de `CalidadApi` que falla**

Crear `frontend/src/app/core/api/calidad.api.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CalidadApi } from './calidad.api';

describe('CalidadApi', () => {
  let api: CalidadApi;
  let http: HttpTestingController;
  const base = 'http://localhost:3001';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(CalidadApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('tiposDano hace GET /calidad/tipos-dano', () => {
    api.tiposDano().subscribe();
    http.expectOne(`${base}/calidad/tipos-dano`).flush([]);
  });

  it('reportar hace POST /calidad/pares/:codigo/incidencias con el body', () => {
    api.reportar('OF1-0001', { tipoDanoId: 8, operarioId: 9, descripcion: 'acta' }).subscribe();
    const req = http.expectOne(`${base}/calidad/pares/OF1-0001/incidencias`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ tipoDanoId: 8, operarioId: 9, descripcion: 'acta' });
    req.flush({ incidencia: { id: 1 }, parReposicion: null });
  });

  it('indicadores hace GET /calidad/indicadores', () => {
    api.indicadores().subscribe();
    http.expectOne(`${base}/calidad/indicadores`).flush({ centros: [], topDanos: [] });
  });
});
```

- [ ] **Step 3: Correr y ver el rojo**

```bash
npm run test:front
```

Expected: FAIL de compilación — `calidad.api` no existe.

- [ ] **Step 4: Implementar `CalidadApi`**

Crear `frontend/src/app/core/api/calidad.api.ts`:

```ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { IndicadoresCalidad, ReporteResultado, TipoDano } from './models/calidad.models';

@Injectable({ providedIn: 'root' })
export class CalidadApi {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  tiposDano() {
    return this.http.get<TipoDano[]>(`${this.base}/calidad/tipos-dano`);
  }
  reportar(codigo: string, body: { tipoDanoId: number; operarioId: number; descripcion?: string }) {
    return this.http.post<ReporteResultado>(
      `${this.base}/calidad/pares/${codigo}/incidencias`,
      body,
    );
  }
  indicadores() {
    return this.http.get<IndicadoresCalidad>(`${this.base}/calidad/indicadores`);
  }
}
```

- [ ] **Step 5: Suite front verde + commit**

```bash
npm run test:front
git add frontend/src/app/core/api
git commit -m "feat(front/calidad): modelos y CalidadApi (TDD)"
```

Expected: PASS (109 = 106 + 3 nuevos; más los mocks de ParDetalle ajustados si hizo falta).

---

### Task 10: Front — reporte de daño en pantalla-operario

**Files:**
- Modify: `frontend/src/app/features/fabricacion/pantalla-operario.component.ts`
- Test: `frontend/src/app/features/fabricacion/pantalla-operario.component.spec.ts`

- [ ] **Step 1: Tests que fallan**

Agregar a `pantalla-operario.component.spec.ts` (siguiendo el estilo de los tests existentes del archivo — `HttpTestingController` + fixture; reusar sus helpers de setup y flush de catálogos):

```ts
  describe('reporte de daño', () => {
    // helper local: deja un par EN_PROCESO en pantalla y abre el panel de reporte,
    // flusheando GET /fabricacion/par/:codigo y GET /calidad/tipos-dano
    const TIPOS = [
      { id: 4, codigo: 'STROBEL-RASGADO', nombre: 'Strobel rasgado', celulaCausante: 'GUARNICION', clase: 'REPROCESO' },
      { id: 8, codigo: 'DANO-ROBOT', nombre: 'Daño de robot en capellada', celulaCausante: 'INYECCION', clase: 'BAJA' },
    ];

    it('el botón "Reportar daño" solo aparece con par EN_PROCESO', ...);
    it('REPROCESO: postea el reporte y muestra confirmación sin pedir descripción', ...);
    it('BAJA: deshabilita el envío sin descripción y muestra el código de reposición al éxito', ...);
    it('BAJA con rol no gerente: botón deshabilitado y aviso visible', ...);
  });
```

Implementarlos con asserts concretos:

1. **Botón visible:** buscar `OF1-0001` (flush de `GET /fabricacion/par/OF1-0001` con `estado: 'EN_PROCESO'`, `incidencias: [], reponeA: null, repuestoPor: []`), `fixture.detectChanges()`, y assert de que existe un botón cuyo texto incluye `Reportar daño`. Con `estado: 'TERMINADO'` el botón NO existe.
2. **REPROCESO:** abrir el panel (click en Reportar daño → flush `GET /calidad/tipos-dano` con `TIPOS`), setear `component.tipoDanoId = 4`, click en el botón de envío → expectOne `POST /calidad/pares/OF1-0001/incidencias`, flush `{ incidencia: { id: 1, tipoDano: TIPOS[0] }, parReposicion: null }` → el mensaje (`component.msg()`) contiene `Reproceso registrado`.
3. **BAJA:** con `tipoDanoId = 8` y `descripcion = ''`, el botón de envío está `disabled`; con `descripcion = 'robot dañó capellada'`, click → flush `{ incidencia: {...}, parReposicion: { codigo: 'OF1-0001-R1' } }` → `component.msg()` contiene `OF1-0001-R1`. (Para que `puedeBaja` sea true, mockear `AuthService.rol` con `spyOn`/provider que devuelva `'GERENTE'`.)
4. **Rol insuficiente:** provider de `AuthService` cuyo `rol()` devuelve `'VENTAS'` → con `tipoDanoId = 8` el botón de envío está `disabled` y el template muestra `Solo un gerente`.

- [ ] **Step 2: Correr y ver el rojo**

```bash
npm run test:front
```

Expected: FAIL — no existe el botón ni el panel.

- [ ] **Step 3: Implementar en el componente**

En `pantalla-operario.component.ts`:

**Imports nuevos:**

```ts
import { CalidadApi } from '../../core/api/calidad.api';
import { AuthService } from '../../core/auth/auth.service';
import { TipoDano } from '../../core/api/models/calidad.models';
import { LABEL_ESTADO_PAR } from '../../core/api/models/fabricacion.models'; // sumar al import existente
```

**Estado nuevo en la clase:**

```ts
  private readonly calidadApi = inject(CalidadApi);
  private readonly auth = inject(AuthService);

  tiposDano = signal<TipoDano[]>([]);
  reportando = signal(false);
  tipoDanoId?: number;
  descripcion = '';
  readonly puedeBaja = ['GERENTE', 'ADMIN'].includes(this.auth.rol() ?? '');

  estadoLabel = (e: ParDetalle['estado']) => LABEL_ESTADO_PAR[e];
  tipoSel(): TipoDano | undefined {
    return this.tiposDano().find((t) => t.id === this.tipoDanoId);
  }

  toggleReporte(): void {
    this.msg.set(null);
    if (!this.reportando() && this.tiposDano().length === 0) {
      this.calidadApi.tiposDano().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (t) => { this.tiposDano.set(t); this.tipoDanoId = t[0]?.id; },
        error: () => { this.esError.set(true); this.msg.set('No se pudo cargar el catálogo de daños.'); },
      });
    }
    this.reportando.update((v) => !v);
  }

  reportar(p: ParDetalle, t: TipoDano): void {
    if (this.operarioId == null) {
      this.esError.set(true);
      this.msg.set('Seleccioná operario');
      return;
    }
    this.calidadApi
      .reportar(p.codigo, {
        tipoDanoId: t.id,
        operarioId: this.operarioId,
        descripcion: this.descripcion.trim() || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.esError.set(false);
          this.msg.set(
            r.parReposicion
              ? `Par ${p.codigo} dado de baja ✖ — repuesto por ${r.parReposicion.codigo} (en Corte)`
              : `Reproceso registrado en ${p.codigo} ⚠`,
          );
          this.par.set(null);
          this.codigo = '';
          this.descripcion = '';
          this.reportando.set(false);
          this.enfocarScan();
        },
        error: (e) => {
          this.esError.set(true);
          this.msg.set(this.msgError(e, e?.error?.message ?? 'No se pudo registrar la incidencia'));
          this.enfocarScan();
        },
      });
  }
```

**Template — reemplazar el bloque del `par-card`:**

```html
        @if (par(); as p) {
          <div class="par-card">
            <div class="mono big">{{ p.codigo }}</div>
            <div class="cell-sub">OF-{{ p.of.consecutivo }} · Talla {{ p.talla.valor }} · en {{ label(p.celulaActual) }}</div>
            @if (p.estado !== 'EN_PROCESO') {
              <span class="badge badge-accent">{{ estadoLabel(p.estado) }}</span>
            } @else {
              <div class="acciones">
                @if (siguiente(p)) {
                  <button class="btn btn-primary" (click)="avanzar(p)">Avanzar a {{ siguiente(p) }} →</button>
                } @else {
                  <button class="btn btn-primary" (click)="avanzar(p)">Terminar (cargar a PT) ✓</button>
                }
                <button class="btn" (click)="toggleReporte()">
                  {{ reportando() ? 'Cancelar reporte' : 'Reportar daño ⚠' }}
                </button>
              </div>
              @if (reportando()) {
                <div class="reporte">
                  <label>Tipo de daño
                    <select [(ngModel)]="tipoDanoId">
                      @for (t of tiposDano(); track t.id) { <option [ngValue]="t.id">{{ t.nombre }}</option> }
                    </select>
                  </label>
                  @if (tipoSel(); as t) {
                    <div class="cell-sub">
                      {{ t.clase === 'BAJA' ? 'Daño total: da de baja el par y crea una reposición.' : 'Reproceso: solo registro, el par sigue su flujo.' }}
                      Se imputa a {{ label(t.celulaCausante) }}.
                    </div>
                    <label>Descripción {{ t.clase === 'BAJA' ? '(acta, obligatoria)' : '(opcional)' }}
                      <textarea [(ngModel)]="descripcion" rows="2" maxlength="500"></textarea>
                    </label>
                    @if (t.clase === 'BAJA' && !puedeBaja) {
                      <div class="msg err">Solo un gerente puede autorizar una baja.</div>
                    }
                    <button class="btn btn-primary"
                            [disabled]="t.clase === 'BAJA' && (!puedeBaja || !descripcion.trim())"
                            (click)="reportar(p, t)">
                      {{ t.clase === 'BAJA' ? 'Dar de baja (acta) ✖' : 'Registrar reproceso ⚠' }}
                    </button>
                  }
                </div>
              }
            }
          </div>
        }
```

**Estilos — agregar a `styles`:**

```css
    .acciones{display:flex;gap:var(--sp-2);flex-wrap:wrap}
    .reporte{margin-top:var(--sp-3);padding:var(--sp-3);border:var(--bw) solid var(--border);border-radius:var(--radius-sm);display:flex;flex-direction:column;gap:var(--sp-2);min-width:320px}
    textarea{padding:var(--sp-2);border:var(--bw) solid var(--border);border-radius:var(--radius-sm);font:inherit}
```

- [ ] **Step 4: Suite front verde + commit**

```bash
npm run test:front
git add frontend/src/app/features/fabricacion frontend/src/app/core
git commit -m "feat(front/calidad): reporte de daño desde pantalla operario (reproceso y baja con acta, TDD)"
```

---

### Task 11: Front — tablero con franja "Fuera de flujo"

**Files:**
- Modify: `frontend/src/app/features/fabricacion/tablero.component.ts`
- Test: `frontend/src/app/features/fabricacion/tablero.component.spec.ts`

- [ ] **Step 1: Test que falla**

Agregar al spec del tablero (mismo estilo del archivo: flush del `GET /fabricacion/tablero`):

```ts
  it('muestra los pares DADO_DE_BAJA y CANCELADO en la franja "Fuera de flujo"', () => {
    // flush del tablero con 3 pares:
    //  { id:1, codigo:'OF1-0001', celulaActual:'CORTE', estado:'EN_PROCESO', talla:{valor:'38'}, of:{consecutivo:1} }
    //  { id:2, codigo:'OF1-0002', celulaActual:'INYECCION', estado:'DADO_DE_BAJA', talla:{valor:'38'}, of:{consecutivo:1} }
    //  { id:3, codigo:'OF1-0003', celulaActual:'CORTE', estado:'CANCELADO', talla:{valor:'40'}, of:{consecutivo:1} }
    // asserts:
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Fuera de flujo');
    expect(el.textContent).toContain('OF1-0002');
    expect(el.textContent).toContain('baja');
    expect(el.textContent).toContain('OF1-0003');
    expect(el.textContent).toContain('cancelado');
    // y OF1-0002 NO aparece dentro de la columna Inyección (sigue solo OF1-0001 en Corte)
  });
```

- [ ] **Step 2: Rojo**

```bash
npm run test:front
```

Expected: FAIL — no existe "Fuera de flujo".

- [ ] **Step 3: Implementar**

En `tablero.component.ts`:

**Computed nuevo (junto a `terminados`):**

```ts
  fueraDeFlujo = computed(() =>
    this.pares().filter((p) => p.estado === 'DADO_DE_BAJA' || p.estado === 'CANCELADO'),
  );
```

**Template — después del cierre del `div.kanban`:**

```html
      @if (fueraDeFlujo().length) {
        <div class="fuera">
          <div class="col-h"><span>Fuera de flujo</span><span class="badge">{{ fueraDeFlujo().length }}</span></div>
          <div class="fuera-body">
            @for (p of fueraDeFlujo(); track p.id) {
              <a class="par-chip" [class.chip-baja]="p.estado === 'DADO_DE_BAJA'"
                 [routerLink]="['/fabricacion/par', p.codigo]">
                <span class="mono">{{ p.codigo }}</span>
                <span class="cell-sub">T{{ p.talla.valor }}</span>
                <span class="estado">{{ p.estado === 'DADO_DE_BAJA' ? 'baja ✖' : 'cancelado' }}</span>
              </a>
            }
          </div>
        </div>
      }
```

**Estilos — agregar:**

```css
    .fuera{margin-top:var(--sp-4);background:var(--surface);border:var(--bw) solid var(--border);border-radius:var(--radius)}
    .fuera-body{padding:var(--sp-2);display:flex;flex-wrap:wrap;gap:var(--sp-2)}
    .chip-baja{border-color:var(--danger)}
    .chip-baja .estado{color:var(--danger)}
```

(El `porCelula` existente ya filtra `estado === 'EN_PROCESO'`, así que las columnas no cambian.)

- [ ] **Step 4: Verde + commit**

```bash
npm run test:front
git add frontend/src/app/features/fabricacion
git commit -m "feat(front/calidad): franja Fuera de flujo en el tablero (bajas y cancelados visibles)"
```

---

### Task 12: Front — par-detalle con incidencias en la timeline y cadena de reposición

**Files:**
- Modify: `frontend/src/app/features/fabricacion/par-detalle.component.ts`
- Test: `frontend/src/app/features/fabricacion/par-detalle.component.spec.ts`

- [ ] **Step 1: Tests que fallan**

Agregar al spec de par-detalle (flush del `GET /fabricacion/par/:codigo` con el shape nuevo):

```ts
  it('intercala incidencias con eventos en la timeline por timestamp', () => {
    // flush con:
    //  eventos: [{ id:1, celula:'CORTE', timestamp:'2026-06-10T08:00:00Z', operario:{nombre:'Carlos'}, maquina:{nombre:'CNC'} }]
    //  incidencias: [{ id:1, timestamp:'2026-06-10T09:00:00Z', celulaDeteccion:'GUARNICION', descripcion:null,
    //    tipoDano:{ id:4, codigo:'STROBEL-RASGADO', nombre:'Strobel rasgado', celulaCausante:'GUARNICION', clase:'REPROCESO' },
    //    operario:{nombre:'Gloria'}, autorizadoPor:null, parReposicion:null }]
    //  reponeA: null, repuestoPor: []
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Strobel rasgado');
    expect(el.textContent).toContain('⚠');
    // el evento de CORTE aparece antes que la incidencia (orden por timestamp)
  });

  it('muestra la cadena de reposición y el badge de baja', () => {
    // flush con estado:'DADO_DE_BAJA', repuestoPor:[{codigo:'OF1-0001-R1'}], y una incidencia BAJA
    //  con autorizadoPor:{username:'gerente'} y parReposicion:{codigo:'OF1-0001-R1'}
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('dado de baja');
    expect(el.textContent).toContain('OF1-0001-R1');
    expect(el.textContent).toContain('gerente');
  });
```

- [ ] **Step 2: Rojo**

```bash
npm run test:front
```

- [ ] **Step 3: Implementar — reemplazar el componente completo**

`par-detalle.component.ts` queda:

```ts
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { QRCodeComponent } from 'angularx-qrcode';
import { FabricacionApi } from '../../core/api/fabricacion.api';
import { ParDetalle, EventoTrazabilidad, LABEL_CELULA, LABEL_ESTADO_PAR } from '../../core/api/models/fabricacion.models';
import { IncidenciaPar } from '../../core/api/models/calidad.models';

type ItemTimeline =
  | { kind: 'evento'; ts: string; evento: EventoTrazabilidad }
  | { kind: 'incidencia'; ts: string; incidencia: IncidenciaPar };

@Component({
  selector: 'app-par-detalle',
  standalone: true,
  imports: [DatePipe, QRCodeComponent, RouterLink],
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
              @if (p.estado === 'EN_PROCESO') {
                <span class="badge">en {{ label(p.celulaActual) }}</span>
              } @else {
                <span class="badge" [class.badge-accent]="p.estado === 'TERMINADO'">{{ estadoLabel(p.estado) }}</span>
              }
            </div>
            @if (p.reponeA; as r) {
              <div class="cell-sub">Repone a
                <a class="mono" [routerLink]="['/fabricacion/par', r.codigo]">{{ r.codigo }}</a>
              </div>
            }
            @for (r of p.repuestoPor; track r.codigo) {
              <div class="cell-sub">Repuesto por
                <a class="mono" [routerLink]="['/fabricacion/par', r.codigo]">{{ r.codigo }}</a>
              </div>
            }
          </div></div>
          <div class="card"><div class="card-body">
            <h4>Recorrido</h4>
            @if (timeline().length) {
              <ul class="timeline">
                @for (item of timeline(); track item.kind + '-' + ts(item)) {
                  @if (item.kind === 'evento') {
                    <li>
                      <span class="tl-cel">{{ label(item.evento.celula) }}</span>
                      <span class="cell-sub">{{ item.evento.operario.nombre }} · {{ item.evento.maquina.nombre }}</span>
                      <span class="cell-sub mono">{{ item.evento.timestamp | date:'dd MMM HH:mm' }}</span>
                    </li>
                  } @else {
                    <li class="incidencia" [class.baja]="item.incidencia.tipoDano.clase === 'BAJA'">
                      <span class="tl-cel">
                        {{ item.incidencia.tipoDano.clase === 'BAJA' ? '✖' : '⚠' }}
                        {{ item.incidencia.tipoDano.nombre }}
                        <small>(imputado a {{ label(item.incidencia.tipoDano.celulaCausante) }})</small>
                      </span>
                      <span class="cell-sub">
                        Detectado en {{ label(item.incidencia.celulaDeteccion) }} por {{ item.incidencia.operario.nombre }}
                        @if (item.incidencia.autorizadoPor; as a) { · acta: {{ a.username }} }
                      </span>
                      @if (item.incidencia.descripcion) { <span class="cell-sub">"{{ item.incidencia.descripcion }}"</span> }
                      @if (item.incidencia.parReposicion; as rep) {
                        <span class="cell-sub">Reposición:
                          <a class="mono" [routerLink]="['/fabricacion/par', rep.codigo]">{{ rep.codigo }}</a>
                        </span>
                      }
                      <span class="cell-sub mono">{{ item.incidencia.timestamp | date:'dd MMM HH:mm' }}</span>
                    </li>
                  }
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
    .incidencia .tl-cel{color:var(--accent)}
    .incidencia.baja .tl-cel{color:var(--danger)}
  `],
})
export class ParDetalleComponent implements OnInit {
  private readonly api = inject(FabricacionApi);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  par = signal<ParDetalle | null>(null);
  error = signal<string | null>(null);
  label = (c: ParDetalle['celulaActual']) => LABEL_CELULA[c];
  estadoLabel = (e: ParDetalle['estado']) => LABEL_ESTADO_PAR[e];
  ts = (i: ItemTimeline) => i.ts;

  timeline = computed<ItemTimeline[]>(() => {
    const p = this.par();
    if (!p) return [];
    const eventos = p.eventos.map((e) => ({ kind: 'evento' as const, ts: e.timestamp, evento: e }));
    const incidencias = (p.incidencias ?? []).map((i) => ({
      kind: 'incidencia' as const, ts: i.timestamp, incidencia: i,
    }));
    return [...eventos, ...incidencias].sort((a, b) => a.ts.localeCompare(b.ts));
  });

  ngOnInit(): void {
    const codigo = this.route.snapshot.paramMap.get('codigo')!;
    this.api.par(codigo).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (p) => this.par.set(p),
      error: () => this.error.set('Par no encontrado'),
    });
  }
}
```

> Nota: al navegar entre pares de la cadena (`routerLink` al mismo componente) Angular reusa la instancia; si el spec lo evidencia, mover la carga a `this.route.paramMap.subscribe(...)`. Si no, dejar `snapshot` como está hoy.

- [ ] **Step 4: Verde + commit**

```bash
npm run test:front
git add frontend/src/app/features/fabricacion
git commit -m "feat(front/calidad): incidencias en la timeline del par + cadena de reposición"
```

---

### Task 13: Front — dashboard de calidad + ruta + nav

**Files:**
- Create: `frontend/src/app/features/calidad/dashboard-calidad.component.ts`
- Test: `frontend/src/app/features/calidad/dashboard-calidad.component.spec.ts`
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/layout/shell/shell.component.ts`

- [ ] **Step 1: Spec que falla**

Crear `dashboard-calidad.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DashboardCalidadComponent } from './dashboard-calidad.component';

describe('DashboardCalidadComponent', () => {
  let http: HttpTestingController;
  const base = 'http://localhost:3001';

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DashboardCalidadComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function crear() {
    const fixture = TestBed.createComponent(DashboardCalidadComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renderiza una tarjeta por centro de costo con sus conteos', () => {
    const fixture = crear();
    http.expectOne(`${base}/calidad/indicadores`).flush({
      centros: [
        { celula: 'CORTE', total: 0, bajas: 0, reprocesos: 0, paresProcesados: 0, pctDano: null },
        { celula: 'GUARNICION', total: 3, bajas: 1, reprocesos: 2, paresProcesados: 10, pctDano: 0.3 },
        { celula: 'ALMACEN', total: 0, bajas: 0, reprocesos: 0, paresProcesados: 0, pctDano: null },
        { celula: 'INYECCION', total: 1, bajas: 1, reprocesos: 0, paresProcesados: 4, pctDano: 0.25 },
      ],
      topDanos: [
        { codigo: 'STROBEL-RASGADO', nombre: 'Strobel rasgado', celulaCausante: 'GUARNICION', clase: 'REPROCESO', total: 2 },
      ],
    });
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Guarnición');
    expect(el.textContent).toContain('30');           // 30 % de daño
    expect(el.textContent).toContain('—');            // pctDano null
    expect(el.textContent).toContain('Strobel rasgado');
  });

  it('muestra el error si el endpoint falla', () => {
    const fixture = crear();
    http.expectOne(`${base}/calidad/indicadores`).flush('x', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No se pudieron cargar');
  });
});
```

- [ ] **Step 2: Rojo**

```bash
npm run test:front
```

- [ ] **Step 3: Implementar el componente**

Crear `frontend/src/app/features/calidad/dashboard-calidad.component.ts`:

```ts
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { PercentPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CalidadApi } from '../../core/api/calidad.api';
import { IndicadoresCalidad } from '../../core/api/models/calidad.models';
import { Celula, LABEL_CELULA } from '../../core/api/models/fabricacion.models';

@Component({
  selector: 'app-dashboard-calidad',
  standalone: true,
  imports: [PercentPipe],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="ph-title">Calidad · centros de costo</div>
        <button class="btn" (click)="cargar()">Actualizar</button>
      </div>
      @if (error()) {
        <div class="empty"><h4>No se pudieron cargar los indicadores</h4><p class="cell-sub">{{ error() }}</p></div>
      } @else if (data(); as d) {
        <div class="cards">
          @for (c of d.centros; track c.celula) {
            <div class="card"><div class="card-body centro">
              <div class="centro-h">{{ label(c.celula) }}</div>
              <div class="kpi-row">
                <div class="kpi"><b>{{ c.total }}</b><small>incidencias</small></div>
                <div class="kpi baja"><b>{{ c.bajas }}</b><small>bajas</small></div>
                <div class="kpi"><b>{{ c.reprocesos }}</b><small>reprocesos</small></div>
              </div>
              <div class="cell-sub">
                % daño:
                @if (c.pctDano !== null) { <b>{{ c.pctDano | percent:'1.0-1' }}</b> de {{ c.paresProcesados }} pares }
                @else { <b>—</b> }
              </div>
            </div></div>
          }
        </div>
        <div class="card top"><div class="card-body">
          <h4>Top tipos de daño</h4>
          @if (d.topDanos.length) {
            <table class="tabla">
              <thead><tr><th>Daño</th><th>Imputa a</th><th>Clase</th><th class="num">Total</th></tr></thead>
              <tbody>
                @for (t of d.topDanos; track t.codigo) {
                  <tr>
                    <td>{{ t.nombre }}</td>
                    <td>{{ label(t.celulaCausante) }}</td>
                    <td><span class="badge" [class.b-baja]="t.clase === 'BAJA'">{{ t.clase === 'BAJA' ? 'baja' : 'reproceso' }}</span></td>
                    <td class="num">{{ t.total }}</td>
                  </tr>
                }
              </tbody>
            </table>
          } @else {
            <p class="cell-sub">Sin incidencias registradas todavía.</p>
          }
        </div></div>
      }
    </div>
  `,
  styles: [`
    .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:var(--sp-3)}
    .centro{display:flex;flex-direction:column;gap:var(--sp-2)}
    .centro-h{font-weight:var(--fw-medium)}
    .kpi-row{display:flex;gap:var(--sp-4)}
    .kpi{display:flex;flex-direction:column}
    .kpi b{font-size:var(--text-xl)}
    .kpi small{color:var(--text-subtle);font-size:var(--text-caption)}
    .kpi.baja b{color:var(--danger)}
    .top{margin-top:var(--sp-4)}
    .tabla{width:100%;border-collapse:collapse}
    .tabla th,.tabla td{text-align:left;padding:var(--sp-2);border-bottom:var(--bw) solid var(--border)}
    .num{text-align:right}
    .b-baja{color:var(--danger);border-color:var(--danger)}
  `],
})
export class DashboardCalidadComponent implements OnInit {
  private readonly api = inject(CalidadApi);
  private readonly destroyRef = inject(DestroyRef);
  data = signal<IndicadoresCalidad | null>(null);
  error = signal<string | null>(null);
  label = (c: Celula) => LABEL_CELULA[c];

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.error.set(null);
    this.api.indicadores().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (d) => this.data.set(d),
      error: () => this.error.set('Intentá de nuevo.'),
    });
  }
}
```

- [ ] **Step 4: Ruta y navegación**

En `frontend/src/app/app.routes.ts`, agregar después de la ruta `fabricacion/par/:codigo`:

```ts
      { path: 'calidad', loadComponent: () => import('./features/calidad/dashboard-calidad.component').then(m => m.DashboardCalidadComponent) },
```

En `frontend/src/app/layout/shell/shell.component.ts`, agregar en el grupo "Operación" (después del nav-item "Puesto de operario"):

```html
          <a class="nav-item" routerLink="/calidad" routerLinkActive="is-active">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 4v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V7z"/><path d="M9 12l2 2 4-4"/></svg></span>
            <span class="nav-label">Calidad</span>
          </a>
```

- [ ] **Step 5: Verde + commit**

```bash
npm run test:front
git add frontend/src/app
git commit -m "feat(front/calidad): dashboard de calidad por centro de costo + ruta y navegación"
```

---

### Task 14: Verificación final + E2E manual

**Files:** ninguno nuevo

- [ ] **Step 1: Suites completas**

```bash
npm test
```

Expected: back ≥ 134 y front ≥ 115, todo PASS.

- [ ] **Step 2: Build de ambos**

```bash
npm run build
```

Expected: sin errores. (Gotcha conocido: si `nest build` no emite `dist`, borrar `backend/tsbuildinfo` viejo y `dist/` y rebuildear.)

- [ ] **Step 3: E2E manual en navegador (checklist del spec §8)**

Levantar: `docker start agro-erp-pg` → `cd backend && npx prisma db seed` → `npm run dev:back` → `npm run dev:front`. Login `gerente`/`gerente123`.

1. OP-9005 → generar OF (si no existe) → tablero con 12 pares en Corte.
2. Pantalla operario: avanzar un par hasta GUARNICION → reportar **Strobel rasgado** (REPROCESO) → mensaje "Reproceso registrado", el par sigue en su célula.
3. Avanzar OTRO par hasta INYECCION → reportar **Daño de robot** (BAJA) → exige descripción → al confirmar: "dado de baja — repuesto por OF{n}-XXXX-R1 (en Corte)".
4. Tablero: el par dañado aparece en "Fuera de flujo" con badge "baja"; la reposición `-R1` está en la columna Corte.
5. Par-detalle del dañado: badge "dado de baja", incidencia ✖ con acta (gerente) y link a la reposición; el detalle de la reposición muestra "Repone a …".
6. Dashboard Calidad: GUARNICION = 1 reproceso; INYECCION = 1 baja; top daños con ambos tipos.
7. Avanzar la reposición las 5 células → TERMINADO → InventarioPT suma normal (verificar contra el detalle de la OP o la DB).

- [ ] **Step 4: Merge a develop**

Al terminar y con el E2E verificado, usar la skill superpowers:finishing-a-development-branch (merge `--no-ff` a `develop`, borrar feat branch).
