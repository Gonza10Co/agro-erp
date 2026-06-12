import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ComprasApi } from '../../core/api/compras.api';
import { OcpDetalle } from '../../core/api/models/compras.models';
import { DrawerComponent } from '../../shared/ui/drawer/drawer.component';
import { RegistrarRecepcionComponent } from './registrar-recepcion.component';
import { RegistrarDevolucionComponent } from './registrar-devolucion.component';
import { badgeOcp } from './ocp-badge';

@Component({
  selector: 'app-ocp-detalle',
  standalone: true,
  imports: [DatePipe, DecimalPipe, RouterLink, DrawerComponent, RegistrarRecepcionComponent, RegistrarDevolucionComponent],
  template: `
    <div class="page page-wide">
      @if (ocp(); as o) {
        <nav class="breadcrumb" style="margin-bottom:var(--sp-4)">
          <a routerLink="/compras/ordenes">Compras</a><span class="sep">/</span>
          <span class="current">OCP-{{ o.consecutivo }}</span>
        </nav>

        <div class="page-header">
          <div>
            <div class="ph-title">Orden de compra OCP-{{ o.consecutivo }}
              <span class="badge {{ badge(o).clase }}" style="margin-left:var(--sp-2)"><span class="dot"></span>{{ badge(o).label }}</span>
            </div>
            <div class="cell-sub" style="margin-top:var(--sp-1)">
              {{ o.proveedor.nombre }} · {{ o.fecha | date:'dd MMM y' }}
              @if (o.requerimiento) {
                · origen <a class="link-req" [routerLink]="['/compras/requerimiento', o.requerimiento.id]">REQ-{{ o.requerimiento.consecutivo }}</a>
              }
            </div>
          </div>
          <div class="ph-actions">
            @if (o.estado !== 'COMPLETA') {
              <button class="btn btn-primary" type="button" (click)="drawer.set('recepcion')">Registrar recepción</button>
            }
            @if (hayRecibido()) {
              <button class="btn btn-ghost" type="button" (click)="drawer.set('devolucion')">Devolución a proveedor</button>
            }
          </div>
        </div>

        <div class="card" style="margin-bottom:var(--sp-4)">
          <div class="table-scroll">
            <table class="data">
              <thead><tr><th>Insumo</th><th>Unidad</th><th class="num">Pedido</th><th class="num">Recibido</th><th class="num">Pendiente</th></tr></thead>
              <tbody>
                @for (l of o.lineas; track l.id) {
                  <tr>
                    <td><span class="cell-mono">{{ l.materialCodigo }}</span> · {{ l.materialNombre }}</td>
                    <td class="cell-sub">{{ l.unidad }}</td>
                    <td class="num cell-mono">{{ l.cantPedida | number:'1.0-2' }}</td>
                    <td class="num cell-mono">{{ l.cantRecibida | number:'1.0-2' }}</td>
                    <td class="num cell-mono" [class.pend]="l.pendiente > 0">{{ l.pendiente | number:'1.0-2' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <div class="historial">
          <div class="card">
            <div class="card-body">
              <div class="h-title">Recepciones</div>
              @if (o.recepciones.length) {
                @for (r of o.recepciones; track r.id) {
                  <div class="doc">
                    <span class="cell-mono">REC-{{ r.consecutivo }}</span>
                    <span class="cell-sub">{{ r.fecha | date:'dd/MM/yyyy' }}</span>
                    <span class="cell-sub">{{ totalDoc(r.lineas) | number:'1.0-2' }} unid.</span>
                    @if (r.observaciones) { <span class="cell-sub obs">{{ r.observaciones }}</span> }
                  </div>
                }
              } @else { <p class="cell-sub">Sin recepciones todavía.</p> }
            </div>
          </div>
          <div class="card">
            <div class="card-body">
              <div class="h-title">Devoluciones al proveedor</div>
              @if (o.devoluciones.length) {
                @for (d of o.devoluciones; track d.id) {
                  <div class="doc">
                    <span class="cell-mono">DEV-{{ d.consecutivo }}</span>
                    <span class="cell-sub">{{ d.fecha | date:'dd/MM/yyyy' }}</span>
                    <span class="cell-sub">{{ totalDoc(d.lineas) | number:'1.0-2' }} unid.</span>
                    <span class="causa">{{ d.causa }}</span>
                  </div>
                }
              } @else { <p class="cell-sub">Sin devoluciones.</p> }
            </div>
          </div>
        </div>
      } @else if (estado() === 'error') {
        <div class="card"><div class="card-body"><div class="empty">
          <h4>No se encontró la orden de compra</h4>
          <p class="cell-sub">No pudimos cargar esta orden de compra a proveedor.</p>
        </div></div></div>
      } @else {
        <div class="card"><div class="card-body">Cargando orden de compra…</div></div>
      }
    </div>

    <app-drawer [open]="drawer() === 'recepcion'" [title]="'Recepción · OCP-' + (ocp()?.consecutivo ?? '')" (closed)="drawer.set(null)">
      @if (ocp(); as o) { @if (drawer() === 'recepcion') {
        <app-registrar-recepcion [ocp]="o" (done)="onHecho()" />
      } }
    </app-drawer>
    <app-drawer [open]="drawer() === 'devolucion'" [title]="'Devolución · OCP-' + (ocp()?.consecutivo ?? '')" (closed)="drawer.set(null)">
      @if (ocp(); as o) { @if (drawer() === 'devolucion') {
        <app-registrar-devolucion [ocp]="o" (done)="onHecho()" />
      } }
    </app-drawer>
  `,
  styles: [`
    .ph-actions{display:flex;gap:var(--sp-2)}
    .pend{color:var(--accent);font-weight:var(--fw-semibold)}
    .historial{display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-4)}
    .h-title{font-size:var(--text-sm);font-weight:var(--fw-semibold);margin-bottom:var(--sp-3)}
    .doc{display:flex;gap:var(--sp-3);align-items:baseline;padding:var(--sp-2) 0;border-bottom:var(--bw) solid var(--border);flex-wrap:wrap}
    .doc:last-child{border-bottom:none}
    .causa{font-size:var(--text-sm);color:var(--error)}
    .obs{font-style:italic}
    .link-req{color:var(--accent)}
    @media (max-width: 900px){.historial{grid-template-columns:1fr}}
  `],
})
export class OcpDetalleComponent implements OnInit {
  private readonly api = inject(ComprasApi);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  ocp = signal<OcpDetalle | null>(null);
  estado = signal<'cargando' | 'ok' | 'error'>('cargando');
  drawer = signal<'recepcion' | 'devolucion' | null>(null);

  hayRecibido = computed(() => (this.ocp()?.lineas ?? []).some((l) => l.cantRecibida > 0));

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((p) => {
      this.cargar(Number(p.get('id')));
    });
  }

  cargar(id: number): void {
    this.api.obtenerOrden(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (o) => { this.ocp.set(o); this.estado.set('ok'); },
      error: () => this.estado.set('error'),
    });
  }

  onHecho(): void {
    this.drawer.set(null);
    const o = this.ocp();
    if (o) this.cargar(o.id);
  }

  badge(o: OcpDetalle) { return badgeOcp(o.estado); }
  totalDoc(lineas: { cantidad: number }[]): number {
    return lineas.reduce((s, l) => s + l.cantidad, 0);
  }
}
