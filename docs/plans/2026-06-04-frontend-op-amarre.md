# F7 — Detalle OP / Amarre Implementation Plan ⭐

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la pantalla estrella del flujo: el detalle de una Orden de Producción con el amarre (pedido vs. en stock vs. a producir) por talla y por bodega, alimentado 100% por el endpoint real `obtenerOP`.

**Architecture:** Componente standalone en ruta `/pedidos/op/:id` (no drawer — es pantalla completa, ver spec §6). Toda la lógica de agregación vive en funciones **puras** y testeables (`amarre-view.ts`), espejo del patrón del backend (`amarre.ts`). El componente solo carga la OP, deriva las vistas con las funciones puras y renderiza. Estilos específicos de la pantalla (hero, summary, ring, barras, tabs) van **encapsulados en el `styles` del componente** reusando los tokens globales del DS "Acero" — NO se toca `components.css` global.

**Tech Stack:** Angular 19.2 (standalone + signals), `@angular/router`, Plain CSS con tokens "Acero", Karma/Jasmine.

**Alcance fijado con Gonza (2026-06-04): "Fiel pero honesto".** Se construye solo lo que `obtenerOP` alimenta de verdad:
- ✅ Hero (OP #, badge estado, OC enlazada, cliente, fecha de generación)
- ✅ Summary (pedido total / amarrado en stock / a producir / # bodegas)
- ✅ Ring de cumplimiento + stack-bar
- ✅ Amarre por talla (barras stock/prod vs. pedido) con tab "Por bodega"
- ✅ Acción real: **Anular OP**
- ❌ NO se incluye: timeline de trazabilidad, detalle modelo/color/puntera/suela, botones "Exportar"/"Generar OF"/"Autorizar despacho" (son features de fases posteriores sin datos en el backend actual).

**Simplificación documentada:** el amarre por talla **agrega todas las líneas** (suma por `tallaId` across productos). El mockup asume un solo producto; si una OP real trae varios productos configurados, las tallas se suman. Si más adelante se necesita desglose por producto, se extiende `filasPorTalla` para agrupar por línea — no rehacer.

---

## File Structure

```
frontend/src/app/features/pedidos/op/
  amarre-view.ts            ← CREAR: funciones puras de agregación (resumen, por talla, por bodega)
  amarre-view.spec.ts       ← CREAR: tests de las funciones puras
  op-detalle.component.ts   ← CREAR: pantalla (template + styles encapsulados + wiring)
  op-detalle.component.spec.ts ← CREAR: smoke test (renderiza con OP mock)

frontend/src/app/app.routes.ts                              ← MODIFICAR: agregar ruta /pedidos/op/:id
frontend/src/app/features/pedidos/oc/oc-detalle.component.ts ← MODIFICAR: "OP #N" pasa a routerLink → /pedidos/op/:id
```

Datos que ya existen y se reusan sin tocar:
- Modelos: `OrdenProduccion`, `OPLinea`, `OPLineaTalla`, `ReservaInventarioPT` en `core/api/models/pedidos.models.ts` (ya completos, incluyen `cantPedida/cantAmarrada/cantAProducir`, `talla` y `reservas[].inventarioPT.bodega`).
- `PedidosApi.obtenerOP(id)` y `PedidosApi.anularOP(id)` (ya existen en `core/api/pedidos.api.ts`).
- `badgeOP` en `features/pedidos/oc/estado-badge.ts`.

---

## Forma del JSON real de `obtenerOP` (referencia, NO modificar backend)

`GET /pedidos/op/:id` devuelve (de `backend/src/pedidos/op/op.service.ts` `obtener()`):

```jsonc
{
  "id": 12, "consecutivo": 1187, "ocId": 41, "estado": "AMARRADA", "fecha": "2026-05-28T...",
  "oc": { "id": 41, "consecutivo": 2041, "cliente": { "id": 3, "nit": "900123", "nombre": "Minera El Roble" } },
  "lineas": [{
    "id": 100, "productoConfiguradoId": 7,
    "productoConfigurado": { "id": 7, "codigo": "BD-PU-NEG", "nombreComercial": "Bota Dieléctrica PU Negro" },
    "tallas": [{
      "id": 500, "tallaId": 36, "cantPedida": 60, "cantAmarrada": 60, "cantAProducir": 0,
      "talla": { "id": 36, "valor": 36, "orden": 4 },
      "reservas": [{ "id": 9, "cantidad": 60, "inventarioPT": { "id": 1, "bodegaId": 1, "bodega": { "id": 1, "codigo": "IBG", "nombre": "Ibagué" } } }]
    }]
  }]
}
```

---

## Task 1: Funciones puras de agregación (`amarre-view.ts`)

**Files:**
- Create: `frontend/src/app/features/pedidos/op/amarre-view.ts`
- Test: `frontend/src/app/features/pedidos/op/amarre-view.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/features/pedidos/op/amarre-view.spec.ts`:

```typescript
import { OrdenProduccion } from '../../../core/api/models/pedidos.models';
import { resumenAmarre, filasPorTalla, filasPorBodega, bodegasDeOP } from './amarre-view';

// OP mock: 1 producto, 2 tallas. T36 completa en stock (Ibagué). T39 mitad stock (Ibagué+Bogotá), mitad a producir.
const OP: OrdenProduccion = {
  id: 12, consecutivo: 1187, ocId: 41, fecha: '2026-05-28T00:00:00.000Z', estado: 'AMARRADA',
  oc: { id: 41, consecutivo: 2041, clienteId: 3, fecha: '2026-05-28T00:00:00.000Z', estado: 'EN_PRODUCCION',
        cliente: { id: 3, nit: '900123', nombre: 'Minera El Roble', tipoCredito: 'D30', estadoCartera: 'AL_DIA', activo: true } },
  lineas: [{
    id: 100, productoConfiguradoId: 7,
    productoConfigurado: { id: 7, codigo: 'BD-PU-NEG', nombreComercial: 'Bota Dieléctrica PU Negro', referenciaId: 1, marcaId: 1 },
    tallas: [
      { id: 500, tallaId: 36, cantPedida: 60, cantAmarrada: 60, cantAProducir: 0,
        talla: { id: 36, valor: 36, orden: 4 },
        reservas: [{ id: 9, inventarioPTId: 1, cantidad: 60,
          inventarioPT: { id: 1, bodegaId: 1, bodega: { id: 1, codigo: 'IBG', nombre: 'Ibagué' } } }] },
      { id: 501, tallaId: 39, cantPedida: 240, cantAmarrada: 120, cantAProducir: 120,
        talla: { id: 39, valor: 39, orden: 7 },
        reservas: [
          { id: 10, inventarioPTId: 1, cantidad: 90, inventarioPT: { id: 1, bodegaId: 1, bodega: { id: 1, codigo: 'IBG', nombre: 'Ibagué' } } },
          { id: 11, inventarioPTId: 2, cantidad: 30, inventarioPT: { id: 2, bodegaId: 2, bodega: { id: 2, codigo: 'BOG', nombre: 'Bogotá' } } },
        ] },
    ],
  }],
};

describe('amarre-view', () => {
  it('resumenAmarre suma pedido/stock/producir y calcula pctStock', () => {
    const r = resumenAmarre(OP);
    expect(r.pedido).toBe(300);
    expect(r.stock).toBe(180);
    expect(r.producir).toBe(120);
    expect(r.pctStock).toBe(60); // 180/300
  });

  it('resumenAmarre con pedido 0 no divide por cero', () => {
    const vacia: OrdenProduccion = { ...OP, lineas: [] };
    expect(resumenAmarre(vacia).pctStock).toBe(0);
  });

  it('bodegasDeOP devuelve bodegas distintas ordenadas por id', () => {
    const b = bodegasDeOP(OP);
    expect(b.map(x => x.codigo)).toEqual(['IBG', 'BOG']);
  });

  it('filasPorTalla agrega por talla, ordena por valor y marca completo', () => {
    const f = filasPorTalla(OP);
    expect(f.map(x => x.valor)).toEqual([36, 39]);
    expect(f[0].completo).toBe(true);   // T36 producir 0
    expect(f[1].completo).toBe(false);  // T39 producir 120
    expect(f[1].stock).toBe(120);
    expect(f[1].producir).toBe(120);
  });

  it('filasPorTalla calcula anchos relativos al pedido máximo', () => {
    const f = filasPorTalla(OP);
    // pedido máximo = 240 (T39) → su barra ocupa 100%
    expect(f[1].wBar).toBe(100);
    // T36: 60/240 = 25% de ancho de barra
    expect(f[0].wBar).toBe(25);
    // dentro de T39: stock 120/240 del ancho de celda = 50, prod 50
    expect(f[1].wStock).toBe(50);
    expect(f[1].wProd).toBe(50);
  });

  it('filasPorBodega desglosa stock por bodega y conserva producir', () => {
    const f = filasPorBodega(OP);
    expect(f[1].porBodega[1]).toBe(90); // T39 Ibagué
    expect(f[1].porBodega[2]).toBe(30); // T39 Bogotá
    expect(f[1].stock).toBe(120);
    expect(f[1].producir).toBe(120);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watch=false --browsers=ChromeHeadless`
Expected: FAIL — `Cannot find module './amarre-view'` / funciones indefinidas.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/app/features/pedidos/op/amarre-view.ts`:

```typescript
import { OrdenProduccion } from '../../../core/api/models/pedidos.models';

export interface BodegaRef { id: number; codigo: string; nombre: string; }

export interface ResumenAmarre {
  pedido: number;
  stock: number;
  producir: number;
  pctStock: number; // 0..100 redondeado
  bodegas: BodegaRef[];
}

export interface TallaFila {
  tallaId: number;
  valor: number;
  pedido: number;
  stock: number;
  producir: number;
  completo: boolean;
  wBar: number;   // ancho total de la barra = pedido/maxPedido*100
  wStock: number; // % del ancho de celda ocupado por stock
  wProd: number;  // % del ancho de celda ocupado por producir
}

export interface BodegaFila {
  tallaId: number;
  valor: number;
  pedido: number;
  porBodega: Record<number, number>; // bodegaId -> stock reservado
  stock: number;
  producir: number;
}

function tallas(op: OrdenProduccion) {
  return (op.lineas ?? []).flatMap(l => l.tallas ?? []);
}

export function bodegasDeOP(op: OrdenProduccion): BodegaRef[] {
  const map = new Map<number, BodegaRef>();
  for (const t of tallas(op)) {
    for (const r of t.reservas ?? []) {
      const b = r.inventarioPT?.bodega;
      if (b && !map.has(b.id)) map.set(b.id, { id: b.id, codigo: b.codigo, nombre: b.nombre });
    }
  }
  return [...map.values()].sort((a, b) => a.id - b.id);
}

export function resumenAmarre(op: OrdenProduccion): ResumenAmarre {
  let pedido = 0, stock = 0, producir = 0;
  for (const t of tallas(op)) {
    pedido += t.cantPedida;
    stock += t.cantAmarrada;
    producir += t.cantAProducir;
  }
  const pctStock = pedido > 0 ? Math.round((stock / pedido) * 100) : 0;
  return { pedido, stock, producir, pctStock, bodegas: bodegasDeOP(op) };
}

function agregarPorTalla(op: OrdenProduccion) {
  const map = new Map<number, { valor: number; pedido: number; stock: number; producir: number }>();
  for (const t of tallas(op)) {
    const prev = map.get(t.tallaId) ?? { valor: t.talla?.valor ?? t.tallaId, pedido: 0, stock: 0, producir: 0 };
    prev.pedido += t.cantPedida;
    prev.stock += t.cantAmarrada;
    prev.producir += t.cantAProducir;
    map.set(t.tallaId, prev);
  }
  return [...map.entries()]
    .map(([tallaId, v]) => ({ tallaId, ...v }))
    .sort((a, b) => a.valor - b.valor);
}

export function filasPorTalla(op: OrdenProduccion): TallaFila[] {
  const base = agregarPorTalla(op);
  const maxPedido = Math.max(1, ...base.map(b => b.pedido));
  return base.map(b => ({
    tallaId: b.tallaId,
    valor: b.valor,
    pedido: b.pedido,
    stock: b.stock,
    producir: b.producir,
    completo: b.producir === 0,
    wBar: Math.round((b.pedido / maxPedido) * 100),
    wStock: b.pedido > 0 ? Math.round((b.stock / b.pedido) * 100) : 0,
    wProd: b.pedido > 0 ? Math.round((b.producir / b.pedido) * 100) : 0,
  }));
}

export function filasPorBodega(op: OrdenProduccion): BodegaFila[] {
  const map = new Map<number, BodegaFila>();
  for (const t of tallas(op)) {
    const fila = map.get(t.tallaId) ?? {
      tallaId: t.tallaId, valor: t.talla?.valor ?? t.tallaId,
      pedido: 0, porBodega: {}, stock: 0, producir: 0,
    };
    fila.pedido += t.cantPedida;
    fila.stock += t.cantAmarrada;
    fila.producir += t.cantAProducir;
    for (const r of t.reservas ?? []) {
      const id = r.inventarioPT?.bodega?.id;
      if (id != null) fila.porBodega[id] = (fila.porBodega[id] ?? 0) + r.cantidad;
    }
    map.set(t.tallaId, fila);
  }
  return [...map.values()].sort((a, b) => a.valor - b.valor);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watch=false --browsers=ChromeHeadless`
Expected: PASS — los 6 specs de `amarre-view` verdes.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/pedidos/op/amarre-view.ts frontend/src/app/features/pedidos/op/amarre-view.spec.ts
git commit -m "feat(pedidos): funciones puras de amarre (resumen/por talla/por bodega) + tests"
```

---

## Task 2: Componente `op-detalle` — carga + hero + summary

**Files:**
- Create: `frontend/src/app/features/pedidos/op/op-detalle.component.ts`
- Test: `frontend/src/app/features/pedidos/op/op-detalle.component.spec.ts`

- [ ] **Step 1: Write the failing smoke test**

Create `frontend/src/app/features/pedidos/op/op-detalle.component.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { OpDetalleComponent } from './op-detalle.component';

describe('OpDetalleComponent', () => {
  function setup(opId = '12') {
    TestBed.configureTestingModule({
      imports: [OpDetalleComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: of({ get: () => opId }) } },
      ],
    });
    const fixture = TestBed.createComponent(OpDetalleComponent);
    const http = TestBed.inject(HttpTestingController);
    return { fixture, http };
  }

  it('carga la OP por id y muestra el consecutivo en el hero', () => {
    const { fixture, http } = setup('12');
    fixture.detectChanges();
    const req = http.expectOne('http://localhost:3001/pedidos/op/12');
    expect(req.request.method).toBe('GET');
    req.flush({
      id: 12, consecutivo: 1187, ocId: 41, fecha: '2026-05-28T00:00:00.000Z', estado: 'AMARRADA',
      oc: { id: 41, consecutivo: 2041, clienteId: 3, fecha: '2026-05-28T00:00:00.000Z', estado: 'EN_PRODUCCION',
            cliente: { id: 3, nit: '900', nombre: 'Minera El Roble', tipoCredito: 'D30', estadoCartera: 'AL_DIA', activo: true } },
      lineas: [],
    });
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('OP-1187');
    expect(text).toContain('Minera El Roble');
    http.verify();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watch=false --browsers=ChromeHeadless`
Expected: FAIL — `Cannot find module './op-detalle.component'`.

- [ ] **Step 3: Write minimal implementation (hero + summary, sin amarre todavía)**

Create `frontend/src/app/features/pedidos/op/op-detalle.component.ts`:

```typescript
import { Component, OnInit, inject, signal, computed, DestroyRef } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PedidosApi } from '../../../core/api/pedidos.api';
import { OrdenProduccion } from '../../../core/api/models/pedidos.models';
import { badgeOP } from '../oc/estado-badge';
import { resumenAmarre } from './amarre-view';

@Component({
  selector: 'app-op-detalle',
  standalone: true,
  imports: [DatePipe, DecimalPipe, RouterLink],
  template: `
    <div class="page page-wide">
      @if (cargando()) {
        <div class="card"><div class="card-body">Cargando orden de producción…</div></div>
      } @else if (op(); as o) {
        <nav class="breadcrumb" style="margin-bottom:var(--sp-4)">
          <a routerLink="/pedidos/oc">Órdenes de Compra</a><span class="sep">/</span>
          <span class="current">OP-{{ o.consecutivo }}</span>
        </nav>

        <!-- HERO -->
        <div class="op-hero">
          <div class="op-id">
            <span class="seal"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg></span>
            <div>
              <h1>OP-{{ o.consecutivo }}</h1>
              <div class="meta">
                <span class="badge {{ badge(o).clase }}"><span class="dot"></span>{{ badge(o).label }}</span>
                <span>·</span><span>OC <a routerLink="/pedidos/oc">OC-{{ o.oc?.consecutivo }}</a></span>
                <span>·</span><span>{{ o.oc?.cliente?.nombre }}</span>
                <span>·</span><span>Generada {{ o.fecha | date:'dd MMM' }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- SUMMARY -->
        <div class="summary">
          <div class="sum"><div class="sl"><i style="background:var(--text-subtle)"></i>Pedido total</div><div class="sv">{{ resumen().pedido | number:'1.0-0' }}</div><div class="sd">pares</div></div>
          <div class="sum hl-stock"><div class="sl"><i style="background:var(--success)"></i>Amarrado en stock</div><div class="sv" style="color:var(--success)">{{ resumen().stock | number:'1.0-0' }}</div><div class="sd">{{ resumen().pctStock }}% del pedido</div></div>
          <div class="sum hl-prod"><div class="sl"><i style="background:var(--accent)"></i>A producir</div><div class="sv" style="color:var(--accent)">{{ resumen().producir | number:'1.0-0' }}</div><div class="sd">{{ 100 - resumen().pctStock }}% del pedido</div></div>
          <div class="sum"><div class="sl"><i style="background:var(--primary)"></i>Bodegas</div><div class="sv">{{ resumen().bodegas.length }}</div><div class="sd">{{ nombresBodegas() }}</div></div>
        </div>

        @if (error()) { <p style="color:var(--error);font-size:var(--text-sm);margin:var(--sp-3) 0">{{ error() }}</p> }
      } @else {
        <div class="card"><div class="card-body"><div class="empty"><h4>No se encontró la orden de producción</h4></div></div></div>
      }
    </div>
  `,
  styles: [`
    .op-hero{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--sp-5);flex-wrap:wrap;margin-bottom:var(--sp-5)}
    .op-id{display:flex;align-items:center;gap:14px}
    .op-id .seal{width:50px;height:50px;border-radius:var(--r-md);background:var(--primary-subtle);color:var(--primary);display:grid;place-items:center;flex:none}
    .op-id .seal svg{width:26px;height:26px}
    .op-id h1{font-size:var(--text-h1);font-weight:var(--fw-bold);letter-spacing:var(--ls-h1);line-height:1}
    .op-id .meta{display:flex;gap:10px;align-items:center;margin-top:7px;font-size:var(--text-caption);color:var(--text-muted);flex-wrap:wrap}
    .op-id .meta a{color:var(--primary);font-weight:var(--fw-medium)}
    .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:var(--sp-4);margin-bottom:var(--sp-5)}
    .sum{background:var(--surface);border:var(--bw) solid var(--border);border-radius:var(--r-lg);padding:var(--sp-4) var(--sp-5);position:relative;overflow:hidden}
    .sum.hl-stock{border-color:color-mix(in oklch,var(--success) 35%,var(--border))}
    .sum.hl-prod{border-color:color-mix(in oklch,var(--accent) 40%,var(--border))}
    .sum .sl{font-size:var(--text-caption);color:var(--text-muted);font-weight:var(--fw-medium);display:flex;align-items:center;gap:7px}
    .sum .sl i{width:9px;height:9px;border-radius:3px}
    .sum .sv{font-family:var(--font-mono);font-size:28px;font-weight:var(--fw-semibold);letter-spacing:-0.02em;margin-top:8px}
    .sum .sd{font-size:var(--text-micro);color:var(--text-subtle);margin-top:3px}
    @media(max-width:1100px){.summary{grid-template-columns:repeat(2,1fr)}}
  `],
})
export class OpDetalleComponent implements OnInit {
  private readonly api = inject(PedidosApi);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  op = signal<OrdenProduccion | null>(null);
  cargando = signal(true);
  accion = signal(false);
  error = signal('');

  resumen = computed(() => {
    const o = this.op();
    return o ? resumenAmarre(o) : { pedido: 0, stock: 0, producir: 0, pctStock: 0, bodegas: [] };
  });
  nombresBodegas = computed(() => this.resumen().bodegas.map(b => b.nombre).join(' · ') || '—');

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(p => {
      const id = Number(p.get('id'));
      this.cargar(id);
    });
  }

  cargar(id: number): void {
    this.cargando.set(true);
    this.op.set(null);
    this.api.obtenerOP(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: o => { this.op.set(o); this.cargando.set(false); },
      error: () => this.cargando.set(false),
    });
  }

  badge(o: OrdenProduccion) { return badgeOP(o.estado); }

  protected msg(e: any): string {
    const m = e?.error?.message;
    return Array.isArray(m) ? m.join(' ') : (m ?? 'La acción falló');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watch=false --browsers=ChromeHeadless`
Expected: PASS — el smoke test muestra `OP-1187` y `Minera El Roble`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/pedidos/op/op-detalle.component.ts frontend/src/app/features/pedidos/op/op-detalle.component.spec.ts
git commit -m "feat(pedidos): op-detalle — carga por id + hero + summary del amarre"
```

---

## Task 3: Ring de cumplimiento + stack-bar

**Files:**
- Modify: `frontend/src/app/features/pedidos/op/op-detalle.component.ts`

- [ ] **Step 1: Agregar el bloque "overall" al template**

En `op-detalle.component.ts`, justo después del cierre del `<div class="summary">…</div>`, agregar:

```html
        <!-- OVERALL -->
        <div class="overall">
          <div class="ring" [style.--p]="resumen().pctStock"><b>{{ resumen().pctStock }}%</b></div>
          <div class="ov-text">
            <h3>Cumplimiento por inventario</h3>
            <p>De los {{ resumen().pedido | number:'1.0-0' }} pares pedidos, {{ resumen().stock | number:'1.0-0' }} ya están en bodega y se amarraron al pedido. Faltan {{ resumen().producir | number:'1.0-0' }} por fabricar.</p>
            <div class="ov-bar" style="margin-top:14px">
              <div class="stack-bar">
                <div class="s-stock" [style.width.%]="resumen().pctStock"></div>
                <div class="s-prod" [style.width.%]="100 - resumen().pctStock"></div>
              </div>
              <div class="stack-legend">
                <span><i style="background:var(--success)"></i>En stock (amarrado)</span>
                <span><i style="background:var(--accent)"></i>A producir</span>
                <span><i style="background:var(--inset);border:1px solid var(--border)"></i>Pedido total</span>
              </div>
            </div>
          </div>
        </div>
```

- [ ] **Step 2: Agregar los estilos del overall al array `styles`**

Dentro del string de `styles`, antes del `@media`, agregar:

```css
    .overall{display:flex;align-items:center;gap:var(--sp-5);padding:var(--sp-5);background:var(--surface);border:var(--bw) solid var(--border);border-radius:var(--r-lg);margin-bottom:var(--sp-5)}
    .overall .ring{--p:0;width:84px;height:84px;border-radius:50%;flex:none;background:conic-gradient(var(--success) calc(var(--p)*1%),var(--accent) calc(var(--p)*1%) 100%);display:grid;place-items:center;position:relative}
    .overall .ring::before{content:"";position:absolute;inset:9px;border-radius:50%;background:var(--surface)}
    .overall .ring b{position:relative;font-family:var(--font-mono);font-size:19px;font-weight:var(--fw-bold)}
    .overall .ov-text{flex:1}
    .overall .ov-text h3{font-size:var(--text-h3);font-weight:var(--fw-semibold)}
    .overall .ov-text p{font-size:var(--text-sm);color:var(--text-muted);margin-top:3px;max-width:60ch}
    .stack-bar{height:14px;border-radius:var(--r-full);background:var(--inset);overflow:hidden;display:flex;border:var(--bw) solid var(--border)}
    .stack-bar .s-stock{background:var(--success)}
    .stack-bar .s-prod{background:var(--accent)}
    .stack-legend{display:flex;gap:18px;margin-top:11px;font-size:var(--text-caption);color:var(--text-muted);flex-wrap:wrap}
    .stack-legend span{display:inline-flex;align-items:center;gap:7px}
    .stack-legend i{width:11px;height:11px;border-radius:3px}
```

- [ ] **Step 3: Run tests para verificar que no se rompió nada**

Run: `npm test -- --watch=false --browsers=ChromeHeadless`
Expected: PASS — el smoke test sigue verde (el `--p` y el `%` no afectan el texto buscado).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/pedidos/op/op-detalle.component.ts
git commit -m "feat(pedidos): op-detalle — ring de cumplimiento + stack-bar"
```

---

## Task 4: Amarre por talla + tab "Por bodega"

**Files:**
- Modify: `frontend/src/app/features/pedidos/op/op-detalle.component.ts`

- [ ] **Step 1: Importar las funciones y agregar el estado de la vista**

En los imports de `amarre-view`, ampliar a:

```typescript
import { resumenAmarre, filasPorTalla, filasPorBodega } from './amarre-view';
```

En la clase, agregar el signal de tab y los computed de filas:

```typescript
  vista = signal<'talla' | 'bodega'>('talla');
  porTalla = computed(() => { const o = this.op(); return o ? filasPorTalla(o) : []; });
  porBodega = computed(() => { const o = this.op(); return o ? filasPorBodega(o) : []; });
```

- [ ] **Step 2: Agregar la card de amarre al template**

Después del bloque `<!-- OVERALL -->`, agregar:

```html
        <!-- AMARRE -->
        <div class="card">
          <div class="card-head" style="display:flex;align-items:center;justify-content:space-between;padding:var(--sp-4) var(--sp-5);border-bottom:var(--bw) solid var(--border)">
            <h3 style="font-size:var(--text-h3);font-weight:var(--fw-semibold)">Amarre por talla</h3>
            <div class="tabs" role="tablist">
              <button class="tab" type="button" role="tab" [attr.aria-selected]="vista() === 'talla'" (click)="vista.set('talla')">Por talla</button>
              <button class="tab" type="button" role="tab" [attr.aria-selected]="vista() === 'bodega'" (click)="vista.set('bodega')">Por bodega</button>
            </div>
          </div>
          <div class="card-body">
            @if (vista() === 'talla') {
              <div class="amarre-head"><span>Talla</span><span>Disponibilidad (stock + a producir vs. pedido)</span><span class="r">Stock / Prod / Ped</span></div>
              @for (f of porTalla(); track f.tallaId) {
                <div class="a-line">
                  <span class="a-talla">{{ f.valor }}<small>{{ f.completo ? 'completo' : 'parcial' }}</small></span>
                  <div class="a-bar" [class.full]="f.completo" [style.width.%]="f.wBar">
                    <div class="b-stock" [style.width.%]="f.wStock"></div>
                    <div class="b-prod" [style.width.%]="f.wProd"></div>
                    <div class="b-empty"></div>
                  </div>
                  <div class="a-vals"><span class="vstock">{{ f.stock | number:'1.0-0' }}</span> / <span class="vprod">{{ f.producir | number:'1.0-0' }}</span> / <span class="vped">{{ f.pedido | number:'1.0-0' }}</span></div>
                </div>
              }
              <div class="a-line a-total">
                <span class="a-talla">Σ</span>
                <div class="a-bar full">
                  <div class="b-stock" [style.width.%]="resumen().pctStock"></div>
                  <div class="b-prod" [style.width.%]="100 - resumen().pctStock"></div>
                </div>
                <div class="a-vals"><span class="vstock">{{ resumen().stock | number:'1.0-0' }}</span> / <span class="vprod">{{ resumen().producir | number:'1.0-0' }}</span> / <span class="vped">{{ resumen().pedido | number:'1.0-0' }}</span></div>
              </div>
            } @else {
              <div class="table-scroll">
                <table class="data bod-table">
                  <thead><tr><th>Talla</th><th class="num">Pedido</th>@for (b of resumen().bodegas; track b.id) {<th class="num">{{ b.nombre }}</th>}<th class="num">Total stock</th><th class="num">A producir</th></tr></thead>
                  <tbody>
                    @for (f of porBodega(); track f.tallaId) {
                      <tr>
                        <td class="cell-mono">{{ f.valor }}</td>
                        <td class="num bod-cell">{{ f.pedido | number:'1.0-0' }}</td>
                        @for (b of resumen().bodegas; track b.id) {<td class="num bod-cell" [class.bod-zero]="!f.porBodega[b.id]">{{ f.porBodega[b.id] ? (f.porBodega[b.id] | number:'1.0-0') : '—' }}</td>}
                        <td class="num bod-cell" style="color:var(--success);font-weight:600">{{ f.stock | number:'1.0-0' }}</td>
                        <td class="num bod-cell" style="color:var(--accent);font-weight:600">{{ f.producir ? (f.producir | number:'1.0-0') : '—' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        </div>
```

- [ ] **Step 3: Agregar los estilos del amarre al array `styles`**

Antes del `@media`, agregar:

```css
    .tabs{display:flex;gap:4px}
    .tab{background:none;border:0;padding:6px 12px;border-radius:var(--r-sm);font-size:var(--text-sm);color:var(--text-muted);cursor:pointer;font-weight:var(--fw-medium)}
    .tab[aria-selected="true"]{background:var(--primary-subtle);color:var(--primary)}
    .amarre-head{display:grid;grid-template-columns:54px 1fr 150px;gap:14px;padding:0 2px 10px;font-family:var(--font-mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-subtle);border-bottom:var(--bw) solid var(--border);margin-bottom:14px}
    .amarre-head .r{text-align:right}
    .a-line{display:grid;grid-template-columns:54px 1fr 150px;gap:14px;align-items:center;padding:7px 2px}
    .a-talla{font-family:var(--font-mono);font-size:var(--text-sm);font-weight:var(--fw-semibold);color:var(--text)}
    .a-talla small{display:block;font-weight:400;color:var(--text-subtle);font-size:9px}
    .a-bar{position:relative;height:26px;border-radius:var(--r-sm);background:var(--inset);border:var(--bw) solid var(--border);overflow:hidden;display:flex}
    .a-bar .b-stock{background:var(--success);height:100%;transition:width var(--dur-slow) var(--ease)}
    .a-bar .b-prod{background:var(--accent);height:100%;transition:width var(--dur-slow) var(--ease)}
    .a-bar .b-empty{flex:1}
    .a-vals{text-align:right;font-family:var(--font-mono);font-size:var(--text-caption);font-variant-numeric:tabular-nums}
    .a-vals .vstock{color:var(--success);font-weight:var(--fw-semibold)}
    .a-vals .vprod{color:var(--accent)}
    .a-vals .vped{color:var(--text-subtle)}
    .a-total{border-top:1.5px solid var(--border-strong);margin-top:8px;padding-top:12px}
    .bod-table th.num,.bod-table td.num{text-align:right}
    .bod-cell{font-family:var(--font-mono);font-variant-numeric:tabular-nums}
    .bod-zero{color:var(--text-subtle)}
```

**Nota:** la barra `.a-line` usa grid de 3 columnas; la columna del medio (`1fr`) contiene `.a-bar` cuyo ancho propio es `wBar%` de esa celda. Esto replica exactamente el mockup (la barra no llena toda la celda salvo en la talla de mayor pedido).

- [ ] **Step 4: Añadir un test del tab al spec**

En `op-detalle.component.spec.ts`, agregar dentro del `describe`:

```typescript
  it('alterna entre vista por talla y por bodega', () => {
    const { fixture, http } = setup('12');
    fixture.detectChanges();
    http.expectOne('http://localhost:3001/pedidos/op/12').flush({
      id: 12, consecutivo: 1187, ocId: 41, fecha: '2026-05-28T00:00:00.000Z', estado: 'AMARRADA',
      oc: { id: 41, consecutivo: 2041, clienteId: 3, fecha: '2026-05-28T00:00:00.000Z', estado: 'EN_PRODUCCION',
            cliente: { id: 3, nit: '900', nombre: 'Minera El Roble', tipoCredito: 'D30', estadoCartera: 'AL_DIA', activo: true } },
      lineas: [{ id: 100, productoConfiguradoId: 7,
        productoConfigurado: { id: 7, codigo: 'BD', nombreComercial: 'Bota', referenciaId: 1, marcaId: 1 },
        tallas: [{ id: 500, tallaId: 36, cantPedida: 60, cantAmarrada: 60, cantAProducir: 0,
          talla: { id: 36, valor: 36, orden: 4 },
          reservas: [{ id: 9, inventarioPTId: 1, cantidad: 60, inventarioPT: { id: 1, bodegaId: 1, bodega: { id: 1, codigo: 'IBG', nombre: 'Ibagué' } } }] }] }],
    });
    fixture.detectChanges();
    const c = fixture.componentInstance;
    expect(c.vista()).toBe('talla');
    c.vista.set('bodega');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Total stock');
    http.verify();
  });
```

- [ ] **Step 5: Run tests**

Run: `npm test -- --watch=false --browsers=ChromeHeadless`
Expected: PASS — smoke + tab tests verdes.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/pedidos/op/op-detalle.component.ts frontend/src/app/features/pedidos/op/op-detalle.component.spec.ts
git commit -m "feat(pedidos): op-detalle — amarre por talla (barras) + tab por bodega"
```

---

## Task 5: Acción "Anular OP"

**Files:**
- Modify: `frontend/src/app/features/pedidos/op/op-detalle.component.ts`

- [ ] **Step 1: Agregar el botón al hero**

En el bloque `<!-- HERO -->`, después del `<div class="op-id">…</div>` y antes de cerrar `<div class="op-hero">`, agregar:

```html
          @if (o.estado === 'AMARRADA' || o.estado === 'CREADA') {
            <div class="page-actions">
              <button class="btn btn-secondary" type="button" [class.is-loading]="accion()" [disabled]="accion()" (click)="anular()">Anular OP</button>
            </div>
          }
```

- [ ] **Step 2: Agregar el método `anular()` a la clase**

```typescript
  anular(): void {
    const o = this.op();
    if (!o || this.accion()) return;
    this.accion.set(true); this.error.set('');
    this.api.anularOP(o.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.accion.set(false); this.cargar(o.id); },
      error: e => { this.accion.set(false); this.error.set(this.msg(e)); },
    });
  }
```

- [ ] **Step 3: Test de la acción anular**

En `op-detalle.component.spec.ts`, agregar:

```typescript
  it('anular() hace POST /pedidos/op/:id/anular y recarga', () => {
    const { fixture, http } = setup('12');
    fixture.detectChanges();
    const base = {
      id: 12, consecutivo: 1187, ocId: 41, fecha: '2026-05-28T00:00:00.000Z',
      oc: { id: 41, consecutivo: 2041, clienteId: 3, fecha: '2026-05-28T00:00:00.000Z', estado: 'EN_PRODUCCION',
            cliente: { id: 3, nit: '900', nombre: 'Minera El Roble', tipoCredito: 'D30', estadoCartera: 'AL_DIA', activo: true } },
      lineas: [],
    };
    http.expectOne('http://localhost:3001/pedidos/op/12').flush({ ...base, estado: 'AMARRADA' });
    fixture.detectChanges();
    fixture.componentInstance.anular();
    const req = http.expectOne('http://localhost:3001/pedidos/op/12/anular');
    expect(req.request.method).toBe('POST');
    req.flush({ ...base, estado: 'ANULADA' });
    // tras anular, recarga (segundo GET)
    http.expectOne('http://localhost:3001/pedidos/op/12').flush({ ...base, estado: 'ANULADA' });
    http.verify();
  });
```

- [ ] **Step 4: Run tests**

Run: `npm test -- --watch=false --browsers=ChromeHeadless`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/pedidos/op/op-detalle.component.ts frontend/src/app/features/pedidos/op/op-detalle.component.spec.ts
git commit -m "feat(pedidos): op-detalle — accion anular OP"
```

---

## Task 6: Routing `/pedidos/op/:id` + navegación desde la OC

**Files:**
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/features/pedidos/oc/oc-detalle.component.ts`

- [ ] **Step 1: Agregar la ruta**

En `app.routes.ts`, dentro de `children`, después de la ruta `pedidos/oc`, agregar:

```typescript
      { path: 'pedidos/op/:id', loadComponent: () => import('./features/pedidos/op/op-detalle.component').then(m => m.OpDetalleComponent) },
```

- [ ] **Step 2: Convertir "OP #N" del detalle OC en un enlace navegable**

En `oc-detalle.component.ts`, importar `RouterLink`:

```typescript
import { RouterLink } from '@angular/router';
```

Añadirlo a `imports` del decorador: `imports: [DatePipe, RouterLink],`

Reemplazar la línea del kv de la OP (la que muestra `OP #{{ op.consecutivo }} · …`) por un enlace:

```html
        @if (o.ordenProduccion; as op) {
          <div class="kv"><span class="k">Orden de producción</span><span class="v"><a [routerLink]="['/pedidos/op', op.id]">OP #{{ op.consecutivo }}</a> · {{ badgeOpLabel(op.estado) }}</span></div>
        }
```

- [ ] **Step 3: Run tests (no debe romperse el spec de oc-detalle)**

Run: `npm test -- --watch=false --browsers=ChromeHeadless`
Expected: PASS — toda la suite verde. Si el spec de `oc-detalle` no provee router, agregar `provideRouter([])` a sus providers (RouterLink lo requiere).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/app.routes.ts frontend/src/app/features/pedidos/oc/oc-detalle.component.ts
git commit -m "feat(pedidos): ruta /pedidos/op/:id + enlace a la OP desde el detalle de OC"
```

---

## Task 7: Verificación E2E manual (igual que F4/F5)

**Files:** ninguno (verificación).

- [ ] **Step 1: Levantar el entorno**

```bash
# (en una terminal) DB
docker start agro-erp-pg
# (otra terminal) backend en :3001
cd agro-erp/backend && npm run build && npm run start:prod
# (otra terminal) frontend en :4200
cd agro-erp/frontend && npm start
```

Asegurar datos: si la DB está limpia, correr seeds (`npm run seed`, `npm run seed:catalogo`, `npm run seed:demo`). Necesitamos al menos **una OC confirmada con OP generada** que mezcle stock y a-producir (el `seed:demo` ya deja stock PT parcial — spec §8).

- [ ] **Step 2: Recorrer el flujo en el navegador**

1. Login `admin` / `admin123`.
2. Ir a `/pedidos/oc`, abrir una OC que tenga OP generada.
3. En el drawer de detalle, clic en el enlace **"OP #N"** → debe navegar a `/pedidos/op/:id`.
4. Verificar: hero con OP/OC/cliente, summary con totales correctos, ring con el % de stock, barras por talla (mezcla verde/azul), tab "Por bodega" funcional, botón "Anular OP".
5. Probar **Anular OP** → estado pasa a "Anulada", la pantalla recarga.
6. Alternar tema claro/oscuro (toggle del topbar) → ring, barras y cards se ven bien en ambos.

Expected: el ciclo OC→OP→amarre se recorre completo, los números cuadran con el seed, sin errores en consola.

- [ ] **Step 3: Actualizar el handoff**

Editar `docs/ESTADO.md`: marcar **F7 completo**, dejar F6 (Crear OC wizard) como único pendiente. Sumar los nuevos tests al conteo.

- [ ] **Step 4: Commit**

```bash
git add docs/ESTADO.md
git commit -m "docs: F7 (OP/Amarre) completo — queda F6 (Crear OC wizard)"
```

---

## Self-Review (hecho)

- **Cobertura del spec §5/§6:** `ui-amarre-bar` → resuelto con `.a-bar`/funciones puras dentro del componente (no se extrajo a `shared/ui` porque solo lo usa esta pantalla; YAGNI). Ruta `/pedidos/op/:id` ✓. Tab talla/bodega ✓.
- **Sin placeholders:** todo el código está completo en cada paso.
- **Consistencia de tipos:** `resumenAmarre`/`filasPorTalla`/`filasPorBodega`/`bodegasDeOP` y sus interfaces (`ResumenAmarre`/`TallaFila`/`BodegaFila`/`BodegaRef`) se usan idénticas en Task 2-4. Modelos `OrdenProduccion`/`OPLineaTalla`/`ReservaInventarioPT` ya existen sin cambios.
- **Honestidad de alcance:** timeline, detalle-pedido y acciones MES/despacho quedan explícitamente fuera (decisión de Gonza 2026-06-04).
- **Deuda relacionada (no bloquea):** falta interceptor de errores HTTP global (anotada en ESTADO.md); el `error()` local cubre el feedback de anular por ahora.
