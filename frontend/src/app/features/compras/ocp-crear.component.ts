import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ComprasApi } from '../../core/api/compras.api';
import { MaterialesApi, Material } from '../../core/api/materiales.api';
import { ProveedorItem } from '../../core/api/models/compras.models';

interface LineaForm {
  materialId: number | null;
  cantPedida: number | null;
  costoUnitario: number | null;
}

// OCP manual: compra directa sin requerimiento (reposición de stock, insumos
// que no cuelgan de una OP). Sección EN_STAGE hasta liberarla al cliente.
@Component({
  selector: 'app-ocp-crear',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="page">
      <nav class="breadcrumb" style="margin-bottom:var(--sp-4)">
        <a routerLink="/compras/ordenes">Compras</a><span class="sep">/</span>
        <span class="current">Nueva orden</span>
      </nav>

      <div class="page-header">
        <div>
          <div class="ph-title">Nueva orden de compra</div>
          <div class="cell-sub">Compra directa al proveedor, sin requerimiento (reposición de stock).</div>
        </div>
      </div>

      <div class="card"><div class="card-body">
        <label class="label">Proveedor</label>
        <select class="input" [ngModel]="proveedorId()" (ngModelChange)="proveedorId.set($event)">
          <option [ngValue]="null">— Elegir proveedor —</option>
          @for (p of proveedores(); track p.id) {
            <option [ngValue]="p.id">{{ p.nombre }}</option>
          }
        </select>

        <div class="lineas-head">
          <span>Insumo</span><span class="num">Cantidad</span><span class="num">$ costo unit. (opcional)</span><span></span>
        </div>
        @for (l of lineas(); track $index; let i = $index) {
          <div class="linea-form">
            <select class="input" [ngModel]="l.materialId" (ngModelChange)="setLinea(i, 'materialId', $event)">
              <option [ngValue]="null">— Elegir insumo —</option>
              @for (m of materiales(); track m.id) {
                <option [ngValue]="m.id">{{ m.codigo }} · {{ m.nombreCanonico }}</option>
              }
            </select>
            <input class="input num" type="number" min="0" step="any" placeholder="0"
              [ngModel]="l.cantPedida" (ngModelChange)="setLinea(i, 'cantPedida', $event)" />
            <input class="input num" type="number" min="0" step="any" placeholder="—"
              [ngModel]="l.costoUnitario" (ngModelChange)="setLinea(i, 'costoUnitario', $event)" />
            <button class="btn btn-ghost btn-x" type="button" title="Quitar línea"
              [disabled]="lineas().length === 1" (click)="quitarLinea(i)">✕</button>
          </div>
        }
        <button class="btn btn-ghost" type="button" (click)="agregarLinea()">+ Agregar insumo</button>

        <label class="label" style="margin-top:var(--sp-4)">Observaciones (opcional)</label>
        <input class="input" type="text" placeholder="motivo de la compra, remisión…"
          [ngModel]="observaciones()" (ngModelChange)="observaciones.set($event)" />

        @if (error()) { <p style="color:var(--error);font-size:var(--text-sm);margin-top:var(--sp-3)">{{ error() }}</p> }

        <div style="margin-top:var(--sp-5)">
          <button class="btn btn-primary" type="button" [class.is-loading]="enviando()"
            [disabled]="enviando() || !valido()" (click)="crear()">Crear orden de compra</button>
        </div>
      </div></div>
    </div>
  `,
  styles: [`
    .label{display:block;font-size:var(--text-sm);color:var(--text-muted);margin-bottom:var(--sp-2)}
    .input{width:100%;padding:var(--sp-2) var(--sp-3);border:var(--bw) solid var(--border);border-radius:var(--r-sm);background:var(--surface);color:var(--text)}
    .input.num{text-align:right;font-family:var(--font-mono)}
    .lineas-head{display:grid;grid-template-columns:1fr 120px 150px 36px;gap:var(--sp-2);margin-top:var(--sp-4);font-size:var(--text-caption);color:var(--text-subtle)}
    .lineas-head .num{text-align:right}
    .linea-form{display:grid;grid-template-columns:1fr 120px 150px 36px;gap:var(--sp-2);margin:var(--sp-2) 0;align-items:center}
    .btn-x{padding:var(--sp-1) var(--sp-2)}
  `],
})
export class OcpCrearComponent implements OnInit {
  private readonly api = inject(ComprasApi);
  private readonly materialesApi = inject(MaterialesApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  proveedores = signal<ProveedorItem[]>([]);
  materiales = signal<Material[]>([]);
  proveedorId = signal<number | null>(null);
  lineas = signal<LineaForm[]>([{ materialId: null, cantPedida: null, costoUnitario: null }]);
  observaciones = signal('');
  enviando = signal(false);
  error = signal('');

  valido = computed(() => {
    if (this.proveedorId() == null) return false;
    const ls = this.lineas().filter((l) => l.materialId != null || l.cantPedida);
    if (!ls.length) return false;
    const vistos = new Set<number>();
    for (const l of ls) {
      if (l.materialId == null || !l.cantPedida || l.cantPedida <= 0) return false;
      if (vistos.has(l.materialId)) return false;
      vistos.add(l.materialId);
    }
    return true;
  });

  ngOnInit(): void {
    this.api.listarProveedores().pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((ps) => this.proveedores.set(ps));
    this.materialesApi.listar().pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((ms) => this.materiales.set(ms));
  }

  setLinea(i: number, campo: keyof LineaForm, valor: any): void {
    this.lineas.update((ls) =>
      ls.map((l, idx) => (idx === i ? { ...l, [campo]: valor === '' ? null : valor } : l)),
    );
  }
  agregarLinea(): void {
    this.lineas.update((ls) => [...ls, { materialId: null, cantPedida: null, costoUnitario: null }]);
  }
  quitarLinea(i: number): void {
    this.lineas.update((ls) => ls.filter((_, idx) => idx !== i));
  }

  crear(): void {
    if (this.enviando() || !this.valido()) return;
    this.enviando.set(true);
    this.error.set('');
    const dto = {
      proveedorId: this.proveedorId()!,
      observaciones: this.observaciones() || undefined,
      lineas: this.lineas()
        .filter((l) => l.materialId != null)
        .map((l) => ({
          materialId: l.materialId!,
          cantPedida: Number(l.cantPedida),
          costoUnitario: l.costoUnitario != null && Number(l.costoUnitario) > 0 ? Number(l.costoUnitario) : undefined,
        })),
    };
    this.api.crearOrden(dto).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (r) => this.router.navigate(['/compras/ordenes', r.id]),
      error: (e) => {
        this.enviando.set(false);
        const m = e?.error?.message;
        this.error.set(Array.isArray(m) ? m.join(' ') : (m ?? 'No se pudo crear la orden'));
      },
    });
  }
}
