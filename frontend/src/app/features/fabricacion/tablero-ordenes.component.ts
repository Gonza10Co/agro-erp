import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { FabricacionApi } from '../../core/api/fabricacion.api';
import { Estacion, OrdenTablero } from '../../core/api/models/fabricacion.models';

export const ORDENES_REFRESCO_MS = 60_000;

/**
 * Tablero por ÓRDENES (piloto 2026-09-09): una fila por OF viva, una columna por
 * estación activa, y en cada celda cuántos pares ya pasaron por ahí sobre lo
 * programado. Ver 1.206 pares uno por uno es imposible: la unidad de pantalla es
 * la orden. Como el par solo avanza, el embudo se lee solo (Bodega 640 y Montaje
 * 590 = 50 esperando inyección). El buscador lleva a la ficha del par.
 */
@Component({
  selector: 'app-tablero-ordenes',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="ph-title">Tablero por órdenes</div>
        <form class="buscador" (submit)="buscarPar($event)">
          <input class="mono" [(ngModel)]="codigoBuscar" name="codigo" placeholder="Buscar par · OF5-0001" />
          <button class="btn btn-sm" type="submit">Ver par →</button>
        </form>
        <button class="btn" type="button" (click)="cargar()">Actualizar</button>
      </div>
      @if (error()) {
        <div class="empty"><h4>No se pudo cargar el tablero</h4><p class="cell-sub">{{ error() }}</p></div>
      }
      <div class="card"><div class="card-body scroll">
        <table class="tabla ordenes">
          <thead>
            <tr>
              <th>Orden</th>
              <th class="num">Programado</th>
              @for (e of estaciones(); track e.codigo) { <th class="num est">{{ e.nombre }}</th> }
            </tr>
          </thead>
          <tbody>
            @for (o of ordenes(); track o.id) {
              <tr class="fila" (click)="toggle(o.id)" [class.abierta]="abierta() === o.id">
                <td>
                  <div class="mono"><b>OF-{{ o.consecutivo }}</b> <span class="cell-sub">· OP-{{ o.op }}@if (o.oc) { · OC-{{ o.oc }} }</span></div>
                  <div class="cell-sub">{{ o.cliente ?? '' }}@if (o.linea) { · {{ o.linea }} } · {{ o.productos.join(', ') }}</div>
                </td>
                <td class="num"><b>{{ o.programado }}</b><div class="cell-sub">{{ o.nacidos }} nacidos</div></td>
                @for (e of estaciones(); track e.codigo) {
                  <td class="num celda">
                    <b>{{ o.porEstacion[e.codigo] ?? 0 }}</b><span class="cell-sub">/{{ o.programado }}</span>
                    <div class="barra"><div class="fill" [style.width.%]="pct(o.porEstacion[e.codigo] ?? 0, o.programado)"></div></div>
                  </td>
                }
              </tr>
              @if (abierta() === o.id) {
                <tr class="detalle">
                  <td [attr.colspan]="2 + estaciones().length">
                    <table class="tabla tallas">
                      <thead><tr><th>Producto</th><th class="num">Talla</th><th class="num">Programado</th><th class="num">Nacidos</th><th class="num">Terminados</th></tr></thead>
                      <tbody>
                        @for (l of o.programa; track l.productoConfiguradoId + '-' + l.tallaId) {
                          <tr><td>{{ l.producto }}</td><td class="num"><b>{{ l.talla }}</b></td><td class="num">{{ l.programado }}</td><td class="num">{{ l.nacidos }}</td><td class="num">{{ l.terminados }}</td></tr>
                        }
                      </tbody>
                    </table>
                    <a class="cell-sub" [routerLink]="['/fabricacion/tablero']" [queryParams]="{ ofId: o.id }">ver pares uno a uno →</a>
                  </td>
                </tr>
              }
            } @empty {
              <tr><td [attr.colspan]="2 + estaciones().length" class="cell-sub">No hay órdenes de fabricación abiertas.</td></tr>
            }
          </tbody>
        </table>
      </div></div>
    </div>
  `,
  styles: [`
    .page-header{display:flex;align-items:center;gap:var(--sp-3);flex-wrap:wrap}
    .page-header .ph-title{flex:1}
    .buscador{display:flex;gap:var(--sp-2)}
    .buscador input{padding:var(--sp-2);border:var(--bw) solid var(--border);border-radius:var(--r-md);min-width:200px}
    .mono{font-family:var(--font-mono)}
    .scroll{overflow-x:auto}
    .ordenes{width:100%;min-width:720px}
    .ordenes .num{text-align:right;white-space:nowrap}
    .ordenes th.est{font-size:var(--text-caption)}
    .fila{cursor:pointer}
    .fila:hover td{background:var(--surface-hover)}
    .fila.abierta td{background:var(--primary-subtle)}
    .celda b{font-size:var(--text-h3)}
    .barra{height:4px;background:var(--inset);border-radius:2px;margin-top:var(--sp-1);overflow:hidden}
    .fill{height:100%;background:var(--primary)}
    .detalle td{background:var(--surface-sunken);padding:var(--sp-3) var(--sp-4)}
    .tallas{width:auto;min-width:420px;margin-bottom:var(--sp-2)}
    .tallas .num{text-align:right}
  `],
})
export class TableroOrdenesComponent implements OnInit {
  private readonly api = inject(FabricacionApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  estaciones = signal<Estacion[]>([]);
  ordenes = signal<OrdenTablero[]>([]);
  error = signal<string | null>(null);
  abierta = signal<number | null>(null);
  codigoBuscar = '';

  ngOnInit(): void {
    this.cargar();
    interval(ORDENES_REFRESCO_MS).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.cargar());
  }

  cargar(): void {
    this.api.tableroOrdenes().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (t) => { this.error.set(null); this.estaciones.set(t.estaciones); this.ordenes.set(t.ordenes); },
      error: (e) => this.error.set(e?.status === 0 ? 'Sin conexión con el servidor.' : (e?.error?.message ?? 'Error al cargar')),
    });
  }

  pct(n: number, total: number): number {
    return total ? Math.min(100, Math.round((n / total) * 100)) : 0;
  }

  toggle(id: number): void {
    this.abierta.set(this.abierta() === id ? null : id);
  }

  buscarPar(ev: Event): void {
    ev.preventDefault();
    const c = this.codigoBuscar.trim();
    if (c) void this.router.navigate(['/fabricacion/par', c]);
  }
}
