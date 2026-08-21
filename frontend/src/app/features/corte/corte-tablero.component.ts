import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, DatePipe, PercentPipe } from '@angular/common';
import { CorteApi } from '../../core/api/corte.api';
import {
  LABEL_ESTADO_CORTE,
  OrdenCorteItem,
  ResumenCorte,
  EstadoOrdenCorte,
} from '../../core/api/models/corte.models';
import { LineasApi, Linea } from '../../core/api/lineas.api';

/** Color del badge según qué tan lejos está el cumplimiento de lo programado. */
function claseCumplimiento(v: number | null): string {
  if (v === null) return 'badge-neutral';
  const desvio = Math.abs(1 - v);
  if (desvio <= 0.02) return 'badge-success';
  if (desvio <= 0.05) return 'badge-warning';
  return 'badge-error';
}

@Component({
  selector: 'app-corte-tablero',
  standalone: true,
  imports: [RouterLink, FormsModule, DecimalPipe, DatePipe, PercentPipe],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <div class="ph-title">Control de corte</div>
          <div class="t-sm t-muted">
            La orden del día es la unidad de trabajo hasta que el par existe en Amarre.
          </div>
        </div>
        <button class="btn" (click)="cargar()" [disabled]="cargando()">
          {{ cargando() ? 'Cargando…' : 'Actualizar' }}
        </button>
      </div>

      <div class="table-toolbar">
        <div class="field">
          <label class="label" for="f-desde">Desde</label>
          <input id="f-desde" class="input" type="date" [(ngModel)]="desde" (change)="cargar()" />
        </div>
        <div class="field">
          <label class="label" for="f-hasta">Hasta</label>
          <input id="f-hasta" class="input" type="date" [(ngModel)]="hasta" (change)="cargar()" />
        </div>
        <div class="field">
          <label class="label" for="f-linea">Línea</label>
          <div class="select-wrap">
            <select id="f-linea" class="select" [(ngModel)]="lineaId" (change)="cargar()">
              <option [ngValue]="null">Todas</option>
              @for (l of lineas(); track l.id) {
                <option [ngValue]="l.id">{{ l.nombre }}</option>
              }
            </select>
          </div>
        </div>
      </div>

      @if (error()) {
        <div class="empty">
          <h4>No se pudo cargar el control de corte</h4>
          <p class="cell-sub">{{ error() }}</p>
        </div>
      } @else {
        @if (resumen(); as r) {
          <div class="kpis">
            <div class="kpi">
              <div class="kpi-label">Cumplimiento de corte</div>
              <div class="kpi-value">
                {{ r.cumplimiento !== null ? (r.cumplimiento | percent: '1.1-1') : '—' }}
              </div>
              <div class="kpi-delta t-muted">
                {{ r.cortado | number }} de {{ r.programado | number }} pares
              </div>
            </div>
            <div class="kpi">
              <div class="kpi-label">Piezas que se volvieron a cortar</div>
              <div class="kpi-value">
                {{ r.indiceReposicion !== null ? (r.indiceReposicion | percent: '1.2-2') : '—' }}
              </div>
              <div class="kpi-delta t-muted">
                {{ r.piezasRepuestas | number }} de {{ r.piezasCortadas | number }} piezas
              </div>
            </div>
            <div class="kpi">
              <div class="kpi-label">En proceso en piso</div>
              <div class="kpi-value">{{ r.wip | number }}</div>
              <div class="kpi-delta t-muted">cortados sin llegar a Amarre</div>
            </div>
            <div class="kpi">
              <div class="kpi-label">Órdenes con alerta</div>
              <div class="kpi-value">{{ r.conAlertas | number }}</div>
              <div class="kpi-delta t-muted">de {{ r.cantOrdenes | number }} del período</div>
            </div>
          </div>
        }

        @if (alertas().length) {
          <div class="alertas">
            @for (a of alertas(); track a.codigo + a.tipo) {
              <div class="alerta">
                <span class="badge badge-warning">{{ a.codigo }}</span>
                <span class="t-sm">{{ a.mensaje }}</span>
              </div>
            }
          </div>
        }

        <div class="table-wrap">
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Orden</th>
                  <th>Fecha</th>
                  <th>Línea</th>
                  <th>Marca</th>
                  <th>Estado</th>
                  <th class="num">Programado</th>
                  <th class="num">Cortado</th>
                  <th class="num">Cumplimiento</th>
                  <th class="num">Repuestas</th>
                </tr>
              </thead>
              <tbody>
                @for (o of ordenes(); track o.id) {
                  <tr>
                    <td>
                      <a class="mono" [routerLink]="['/corte/ordenes', o.id]">{{ o.codigo }}</a>
                      @if (o.alertas.length) {
                        <span class="badge badge-warning">{{ o.alertas.length }}</span>
                      }
                    </td>
                    <td class="t-sm">{{ o.fecha | date: 'dd/MM/yyyy' }}</td>
                    <td class="t-sm">{{ o.linea?.nombre ?? '—' }}</td>
                    <td class="t-sm">{{ o.marca?.nombre ?? '—' }}</td>
                    <td><span class="badge">{{ label(o.estado) }}</span></td>
                    <td class="num">{{ o.indicadores.programado | number }}</td>
                    <td class="num">{{ o.indicadores.cortado | number }}</td>
                    <td class="num">
                      <span [class]="'badge ' + clase(o.indicadores.cumplimiento)">
                        {{
                          o.indicadores.cumplimiento !== null
                            ? (o.indicadores.cumplimiento | percent: '1.0-1')
                            : '—'
                        }}
                      </span>
                    </td>
                    <td class="num">{{ o.indicadores.piezasRepuestas | number }}</td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="9">
                      <div class="empty">
                        <h4>Sin órdenes de corte en el período</h4>
                        <p class="cell-sub">
                          La programación diaria del cliente se carga por orden — una por día y por planta.
                        </p>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .kpis {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: var(--space-4, 16px);
        margin-bottom: var(--space-5, 20px);
      }
      .alertas {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
        margin-bottom: var(--space-5, 20px);
      }
      .alerta {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        padding: var(--space-3, 12px);
        background: var(--surface);
        border: 1px solid var(--border);
        border-left: 3px solid var(--warning, var(--accent));
      }
      .table-toolbar {
        display: flex;
        gap: var(--space-4, 16px);
        flex-wrap: wrap;
        align-items: flex-end;
        margin-bottom: var(--space-5, 20px);
      }
    `,
  ],
})
export class CorteTableroComponent implements OnInit {
  private readonly api = inject(CorteApi);
  private readonly lineasApi = inject(LineasApi);

  readonly ordenes = signal<OrdenCorteItem[]>([]);
  readonly resumen = signal<ResumenCorte | null>(null);
  readonly lineas = signal<Linea[]>([]);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);

  desde: string | null = null;
  hasta: string | null = null;
  lineaId: number | null = null;

  /** Alertas de todas las órdenes, aplanadas para el resumen de arriba. */
  readonly alertas = computed(() =>
    this.ordenes().flatMap((o) => o.alertas.map((a) => ({ ...a, codigo: o.codigo }))),
  );

  ngOnInit(): void {
    this.lineasApi.listar().subscribe({
      next: (ls) => this.lineas.set(ls.filter((l) => l.activo)),
      error: () => this.lineas.set([]),
    });
    this.cargar();
  }

  cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.api
      .tablero({
        lineaId: this.lineaId ?? undefined,
        desde: this.desde ?? undefined,
        hasta: this.hasta ?? undefined,
      })
      .subscribe({
        next: (t) => {
          this.ordenes.set(t.ordenes);
          this.resumen.set(t.resumen);
          this.cargando.set(false);
        },
        error: (e) => {
          this.error.set(e?.error?.message ?? 'Error de conexión con el servidor');
          this.cargando.set(false);
        },
      });
  }

  label(e: EstadoOrdenCorte): string {
    return LABEL_ESTADO_CORTE[e];
  }

  clase(v: number | null): string {
    return claseCumplimiento(v);
  }
}
