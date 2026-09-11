import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { FabricacionApi } from '../../core/api/fabricacion.api';
import { Estacion, OrdenTablero, ProgramaOfLinea } from '../../core/api/models/fabricacion.models';

export const ORDENES_REFRESCO_MS = 60_000;

/**
 * Tablero por ÓRDENES (piloto 2026-09-09): una tarjeta por OF viva con el avance
 * acumulado en cada estación. Ver 1.206 pares uno por uno es imposible: la unidad
 * de pantalla es la orden. Como el par solo avanza, el embudo se lee de izquierda
 * a derecha (Bodega 640 y Montaje 590 = 50 esperando inyección). Al desplegar, el
 * desglose por talla repite las MISMAS columnas: así se ve qué talla se atascó y
 * dónde, que es lo que se pregunta en planta. El buscador lleva a la ficha del par.
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

      @for (o of ordenes(); track o.id) {
        <div class="orden card">
          <div class="card-body">
            <!-- Identificación de la orden y su avance global -->
            <div class="cabecera">
              <div class="ident">
                <div class="titulo">
                  <span class="mono of">OF-{{ o.consecutivo }}</span>
                  <span class="cell-sub mono">OP-{{ o.op }}@if (o.oc) { · OC-{{ o.oc }} }</span>
                  <span class="badge" [class.badge-accent]="o.estado === 'TERMINADA'">{{ o.estado }}</span>
                </div>
                <div class="cell-sub">
                  {{ o.cliente ?? '' }}@if (o.linea) { · {{ o.linea }} } · {{ o.productos.join(', ') }}
                </div>
              </div>
              <div class="global">
                <div class="global-num"><b>{{ o.nacidos }}</b><span class="de">de {{ o.programado }}</span></div>
                <div class="global-lbl">pares nacidos</div>
              </div>
            </div>

            <!-- El embudo: cuántos pasaron ya por cada estación -->
            <div class="etapas">
              @for (e of estaciones(); track e.codigo) {
                <div class="etapa" [class.vacia]="!o.porEstacion[e.codigo]">
                  <div class="etapa-n">{{ o.porEstacion[e.codigo] ?? 0 }}</div>
                  <div class="barra"><div class="fill" [style.width.%]="pct(o.porEstacion[e.codigo] ?? 0, o.programado)"></div></div>
                  <div class="etapa-l">{{ e.nombre }}</div>
                </div>
              }
            </div>

            <button class="desplegar" type="button" (click)="toggle(o.id)" [attr.aria-expanded]="abierta() === o.id">
              {{ abierta() === o.id ? '▾' : '▸' }} desglose por talla
            </button>

            @if (abierta() === o.id) {
              <div class="scroll">
                <table class="tabla tallas">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th class="num">Talla</th>
                      <th class="num">Programado</th>
                      @for (e of estaciones(); track e.codigo) { <th class="num est">{{ e.nombre }}</th> }
                    </tr>
                  </thead>
                  <tbody>
                    @for (l of o.programa; track l.productoConfiguradoId + '-' + l.tallaId) {
                      <tr>
                        <td class="cell-sub">{{ l.producto }}</td>
                        <td class="num talla">{{ l.talla }}</td>
                        <td class="num">{{ l.programado }}@if (l.nacidos >= l.programado) { <span class="ok" title="ya nacieron todos">✓</span> }</td>
                        @for (e of estaciones(); track e.codigo) {
                          <td class="num" [class.cero]="!enEtapa(l, e.codigo)">{{ enEtapa(l, e.codigo) }}</td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <a class="link-pares" [routerLink]="['/fabricacion/tablero']" [queryParams]="{ ofId: o.id }">ver pares uno a uno →</a>
            }
          </div>
        </div>
      } @empty {
        @if (!error()) {
          <div class="empty"><h4>Sin órdenes abiertas</h4><p class="cell-sub">No hay órdenes de fabricación en curso.</p></div>
        }
      }
    </div>
  `,
  styles: [`
    .page-header{display:flex;align-items:center;gap:var(--sp-3);flex-wrap:wrap}
    .page-header .ph-title{flex:1}
    .buscador{display:flex;gap:var(--sp-2)}
    .buscador input{padding:var(--sp-2);border:var(--bw) solid var(--border);border-radius:var(--r-md);min-width:200px}
    .mono{font-family:var(--font-mono)}

    .orden{margin-bottom:var(--sp-4)}
    .cabecera{display:flex;align-items:flex-start;gap:var(--sp-4);flex-wrap:wrap}
    .ident{flex:1;min-width:240px}
    .titulo{display:flex;align-items:baseline;gap:var(--sp-2);flex-wrap:wrap}
    .of{font-size:var(--text-h3);font-weight:var(--fw-bold)}
    .global{text-align:right;white-space:nowrap}
    .global-num{font-variant-numeric:tabular-nums;font-size:var(--text-h3)}
    .global-num b{font-size:32px;line-height:1;color:var(--primary)}
    .global-num .de{color:var(--text-muted);font-size:var(--text-body);margin-left:var(--sp-2)}
    .global-lbl{font-size:var(--text-micro);text-transform:uppercase;letter-spacing:.08em;color:var(--text-subtle)}

    /* El embudo: una columna por estación, en el orden del recorrido. */
    .etapas{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:var(--sp-3);
      margin-top:var(--sp-4);padding-top:var(--sp-4);border-top:var(--bw) solid var(--border)}
    .etapa{text-align:center}
    .etapa-n{font-size:28px;line-height:1;font-weight:var(--fw-bold);font-variant-numeric:tabular-nums;color:var(--primary)}
    .etapa.vacia .etapa-n{color:var(--text-subtle)}
    .etapa-l{margin-top:var(--sp-1);font-size:var(--text-caption);color:var(--text-muted)}
    .barra{height:4px;background:var(--inset);border-radius:2px;margin-top:var(--sp-2);overflow:hidden}
    .fill{height:100%;background:var(--primary)}

    .desplegar{margin-top:var(--sp-4);background:none;border:0;padding:0;font:inherit;
      font-size:var(--text-sm);color:var(--accent);cursor:pointer}
    .desplegar:hover{text-decoration:underline}

    .scroll{overflow-x:auto;margin-top:var(--sp-3)}
    .tallas{width:100%;min-width:560px}
    .tallas .num{text-align:right;white-space:nowrap}
    .tallas th.est{font-size:var(--text-caption);font-weight:var(--fw-medium)}
    .tallas .talla{font-weight:var(--fw-bold)}
    .tallas .cero{color:var(--text-subtle)}
    .tallas .ok{color:var(--success);margin-left:var(--sp-1)}
    .link-pares{display:inline-block;margin-top:var(--sp-3);font-size:var(--text-sm);color:var(--accent);text-decoration:none}
    .link-pares:hover{text-decoration:underline}
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

  /** Pares de esa talla que ya pasaron por la estación (acumulado, como la cabecera). */
  enEtapa(l: ProgramaOfLinea, codigo: string): number {
    return l.porEstacion?.[codigo] ?? 0;
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
