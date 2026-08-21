import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, DatePipe, PercentPipe, registerLocaleData } from '@angular/common';
import localeEsCO from '@angular/common/locales/es-CO';

// Solo REGISTRA los datos del locale; no cambia el LOCALE_ID de la app (que sigue
// en el default). Así las fechas largas de esta pantalla salen en español sin
// alterar cómo formatea el resto del sistema.
registerLocaleData(localeEsCO);
import { CorteApi } from '../../core/api/corte.api';
import {
  LABEL_ESTADO_CORTE,
  ORDEN_ESTADOS_CORTE,
  OrdenCorteDetalle,
  EstadoOrdenCorte,
} from '../../core/api/models/corte.models';

@Component({
  selector: 'app-corte-orden-detalle',
  standalone: true,
  imports: [RouterLink, FormsModule, DecimalPipe, DatePipe, PercentPipe],
  template: `
    <div class="page">
      @if (orden(); as o) {
        <div class="page-header">
          <div>
            <a class="breadcrumb" routerLink="/corte">← Control de corte</a>
            <div class="ph-title mono">{{ o.codigo }}</div>
            <div class="t-sm t-muted">
              Jornada del {{ o.fecha | date: 'fullDate' : undefined : 'es-CO' }}
              @if (o.linea) { · {{ o.linea.nombre }} }
              @if (o.marca) { · {{ o.marca.nombre }} }
            </div>
          </div>
          <div class="acciones">
            @if (o.siguienteEstado) {
              <button class="btn btn-primary" (click)="pedirAvance(o)" [disabled]="guardando()">
                {{ guardando() ? 'Guardando…' : 'Pasar a ' + label(o.siguienteEstado) }}
              </button>
            }
            <button class="btn" (click)="cargar()">Actualizar</button>
          </div>
        </div>

        <!-- Recorrido físico de la orden -->
        <div class="stepper">
          @for (e of recorrido; track e) {
            <div class="step" [class.hecho]="pasado(o, e)" [class.actual]="o.estado === e">
              <span class="step-punto"></span>
              <span class="step-txt">{{ label(e) }}</span>
              @if (selloDe(o, e); as f) {
                <span class="step-fecha mono">{{ f | date: 'dd/MM HH:mm' }}</span>
              }
            </div>
          }
        </div>

        @if (o.estado === 'ANULADA') {
          <div class="aviso">Esta orden está anulada.</div>
        }

        @if (o.alertas.length) {
          <div class="alertas">
            @for (a of o.alertas; track a.tipo) {
              <div class="alerta"><span class="t-sm">{{ a.mensaje }}</span></div>
            }
          </div>
        }

        <div class="kpis">
          <div class="kpi">
            <div class="kpi-label">Cumplimiento</div>
            <div class="kpi-value">
              {{ o.indicadores.cumplimiento !== null ? (o.indicadores.cumplimiento | percent: '1.1-1') : '—' }}
            </div>
            <div class="kpi-delta t-muted">
              {{ o.indicadores.cortado | number }} de {{ o.indicadores.programado | number }} pares
            </div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Piezas repuestas</div>
            <div class="kpi-value">
              {{ o.indicadores.indiceReposicion !== null ? (o.indicadores.indiceReposicion | percent: '1.2-2') : '—' }}
            </div>
            <div class="kpi-delta t-muted">
              {{ o.indicadores.piezasRepuestas | number }} de {{ o.indicadores.piezasCortadas | number }}
            </div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Horas en corte</div>
            <div class="kpi-value">
              {{ o.indicadores.horasCorte !== null ? (o.indicadores.horasCorte | number: '1.0-0') : '—' }}
            </div>
            <div class="kpi-delta t-muted">de inicio a entrega</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Horas en guarnición</div>
            <div class="kpi-value">
              {{ o.indicadores.horasGuarnicion !== null ? (o.indicadores.horasGuarnicion | number: '1.0-0') : '—' }}
            </div>
            <div class="kpi-delta t-muted">hasta el último amarre</div>
          </div>
        </div>

        <!-- Tallas -->
        <h3 class="sec">Programación por talla</h3>
        <div class="table-wrap">
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Referencia</th>
                  <th class="num">Talla</th>
                  <th class="num">Programado</th>
                  <th class="num">Cortado</th>
                  <th class="num">Amarrado</th>
                  <th class="num">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                @for (l of o.lineas; track l.id) {
                  <tr>
                    <td class="t-sm">
                      <span class="mono">{{ l.productoConfigurado.referencia?.codigo ?? '—' }}</span>
                      @if (l.productoConfigurado.referencia?.nombreInterno; as n) {
                        <span class="t-muted"> · {{ n }}</span>
                      }
                    </td>
                    <td class="num mono">{{ l.talla.valor }}</td>
                    <td class="num">{{ l.cantProgramada | number }}</td>
                    <td class="num">{{ l.cantCortada | number }}</td>
                    <td class="num">{{ l.cantAmarrada | number }}</td>
                    <td class="num">
                      @if (l.cantCortada !== l.cantProgramada) {
                        <span class="badge badge-warning">
                          {{ l.cantCortada - l.cantProgramada > 0 ? '+' : '' }}{{ l.cantCortada - l.cantProgramada }}
                        </span>
                      } @else { <span class="t-muted">—</span> }
                    </td>
                  </tr>
                }
              </tbody>
              <tfoot>
                <tr class="total">
                  <td colspan="2">Total</td>
                  <td class="num">{{ o.indicadores.programado | number }}</td>
                  <td class="num">{{ o.indicadores.cortado | number }}</td>
                  <td class="num">{{ o.indicadores.amarrado | number }}</td>
                  <td class="num"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <!-- Avances -->
        <div class="sec-head">
          <h3 class="sec">Avances de corte</h3>
          @if (o.estado !== 'ANULADA') {
            <button class="btn btn-sm" (click)="abrirAvance()">Registrar avance</button>
          }
        </div>

        @if (formAvance()) {
          <div class="card card-pad form-avance">
            <div class="campos">
              <div class="field">
                <label class="label" for="a-cortadas">Piezas cortadas</label>
                <input id="a-cortadas" class="input" type="number" min="0" [(ngModel)]="nuevoAvance.piezasCortadas" />
              </div>
              <div class="field">
                <label class="label" for="a-danadas">Dañadas</label>
                <input id="a-danadas" class="input" type="number" min="0" [(ngModel)]="nuevoAvance.piezasDanadas" />
              </div>
              <div class="field">
                <label class="label" for="a-repuestas">Repuestas</label>
                <input id="a-repuestas" class="input" type="number" min="0" [(ngModel)]="nuevoAvance.piezasRepuestas" />
              </div>
              <div class="field crece">
                <label class="label" for="a-obs">Observaciones</label>
                <input id="a-obs" class="input" type="text" [(ngModel)]="nuevoAvance.observaciones" />
              </div>
            </div>
            @if (errorAvance()) { <p class="field-msg">{{ errorAvance() }}</p> }
            <div class="form-acciones">
              <button class="btn btn-ghost" (click)="cerrarAvance()">Cancelar</button>
              <button class="btn btn-primary" (click)="guardarAvance()" [disabled]="guardando()">Guardar</button>
            </div>
          </div>
        }

        <div class="table-wrap">
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th class="num">Cortadas</th>
                  <th class="num">Dañadas</th>
                  <th class="num">Repuestas</th>
                  <th>Operario</th>
                  <th>Observaciones</th>
                </tr>
              </thead>
              <tbody>
                @for (a of o.avances; track a.id) {
                  <tr>
                    <td class="t-sm">{{ a.fecha | date: 'dd/MM/yyyy' }}</td>
                    <td class="num">{{ a.piezasCortadas | number }}</td>
                    <td class="num">{{ a.piezasDanadas | number }}</td>
                    <td class="num">{{ a.piezasRepuestas | number }}</td>
                    <td class="t-sm">{{ a.operario?.nombre ?? '—' }}</td>
                    <td class="t-sm t-muted">{{ a.observaciones ?? '—' }}</td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="6">
                      <div class="empty"><h4>Todavía no hay avances registrados</h4></div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <!-- Consumo de material -->
        @if (o.consumos.length) {
          <h3 class="sec">Consumo de material · teórico contra real</h3>
          <div class="table-wrap">
            <div class="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Material</th>
                    <th class="num">Teórico</th>
                    <th class="num">Real</th>
                    <th class="num">Desviación</th>
                  </tr>
                </thead>
                <tbody>
                  @for (c of o.consumos; track c.materialId) {
                    <tr>
                      <td>
                        <span class="mono t-sm">{{ c.codigo }}</span>
                        <span class="t-sm"> · {{ c.nombre }}</span>
                      </td>
                      <td class="num">{{ c.cantTeorica | number: '1.0-3' }}</td>
                      <td class="num">{{ c.cantReal | number: '1.0-3' }}</td>
                      <td class="num">
                        @if (c.desviacion !== null) {
                          <span [class]="'badge ' + claseDesviacion(c.desviacion)">
                            {{ c.desviacion > 0 ? '+' : '' }}{{ c.desviacion | percent: '1.1-1' }}
                          </span>
                        } @else { <span class="t-muted">—</span> }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }
      } @else if (error()) {
        <div class="empty">
          <h4>No se pudo cargar la orden</h4>
          <p class="cell-sub">{{ error() }}</p>
          <a class="btn" routerLink="/corte">Volver al control de corte</a>
        </div>
      } @else {
        <div class="skel-text-lg"><div class="skel skel-line"></div></div>
      }
    </div>
  `,
  styles: [
    `
      .acciones { display: flex; gap: 8px; align-items: center; }
      .breadcrumb { display: inline-block; margin-bottom: 6px; font-size: .85rem; }
      .kpis {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 16px;
        margin: 20px 0;
      }
      .sec { margin: 28px 0 12px; font-size: 1.05rem; }
      .sec-head { display: flex; align-items: center; justify-content: space-between; }
      .sec-head .sec { margin-bottom: 12px; }
      tfoot .total td { font-weight: 600; border-top: 2px solid var(--border-strong); }

      /* Recorrido de la orden */
      .stepper { display: flex; flex-wrap: wrap; gap: 4px; margin: 20px 0; }
      .step {
        display: flex; align-items: center; gap: 8px;
        padding: 10px 16px 10px 12px;
        background: var(--surface); border: 1px solid var(--border);
        flex: 1 1 auto; min-width: 150px;
      }
      .step-punto {
        width: 9px; height: 9px; border-radius: 50%;
        background: var(--border-strong); flex: none;
      }
      .step.hecho .step-punto { background: var(--success, var(--primary)); }
      .step.actual { border-color: var(--accent); }
      .step.actual .step-punto { background: var(--accent); }
      .step-txt { font-size: .88rem; }
      .step.actual .step-txt { font-weight: 600; }
      .step-fecha { margin-left: auto; font-size: .74rem; color: var(--text-muted); }

      .alertas { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
      .alerta {
        padding: 12px; background: var(--surface);
        border: 1px solid var(--border); border-left: 3px solid var(--warning, var(--accent));
      }
      .aviso {
        padding: 12px; margin-bottom: 16px;
        background: var(--surface); border-left: 3px solid var(--danger, var(--accent));
      }
      .form-avance { margin-bottom: 16px; }
      .campos { display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-end; }
      .campos .field { min-width: 130px; }
      .campos .crece { flex: 1 1 220px; }
      .form-acciones { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
    `,
  ],
})
export class CorteOrdenDetalleComponent implements OnInit {
  private readonly api = inject(CorteApi);
  private readonly route = inject(ActivatedRoute);

  readonly orden = signal<OrdenCorteDetalle | null>(null);
  readonly error = signal<string | null>(null);
  readonly guardando = signal(false);
  readonly formAvance = signal(false);
  readonly errorAvance = signal<string | null>(null);

  /** El recorrido no incluye ANULADA: es una salida del flujo, no un paso. */
  readonly recorrido = ORDEN_ESTADOS_CORTE;

  nuevoAvance = { piezasCortadas: 0, piezasDanadas: 0, piezasRepuestas: 0, observaciones: '' };

  private id = 0;

  ngOnInit(): void {
    this.id = Number(this.route.snapshot.paramMap.get('id'));
    this.cargar();
  }

  cargar(): void {
    this.api.obtener(this.id).subscribe({
      next: (o) => {
        this.orden.set(o);
        this.error.set(null);
      },
      error: (e) => this.error.set(e?.error?.message ?? 'Error de conexión con el servidor'),
    });
  }

  label(e: EstadoOrdenCorte): string {
    return LABEL_ESTADO_CORTE[e];
  }

  /** ¿La orden ya pasó por este estado? Sirve para pintar el recorrido. */
  pasado(o: OrdenCorteDetalle, e: EstadoOrdenCorte): boolean {
    const actual = this.recorrido.indexOf(o.estado);
    const paso = this.recorrido.indexOf(e);
    return actual >= 0 && paso <= actual;
  }

  selloDe(o: OrdenCorteDetalle, e: EstadoOrdenCorte): string | null {
    return {
      PROGRAMADA: null,
      EN_CORTE: o.inicioCorte,
      ENTREGADA: o.entregaCorte,
      EN_GUARNICION: o.inicioGuarnicion,
      CERRADA: o.cierreGuarnicion,
      ANULADA: null,
    }[e];
  }

  claseDesviacion(v: number): string {
    const abs = Math.abs(v);
    if (abs <= 0.02) return 'badge-success';
    if (abs <= 0.05) return 'badge-warning';
    return 'badge-error';
  }

  /**
   * Al ENTREGAR hay que reportar lo realmente cortado. Se propone lo programado
   * como punto de partida: lo normal es que coincida, y así solo se corrige lo
   * que salió distinto.
   */
  pedirAvance(o: OrdenCorteDetalle): void {
    if (!o.siguienteEstado) return;
    this.guardando.set(true);

    const cantidades =
      o.siguienteEstado === 'ENTREGADA'
        ? Object.fromEntries(o.lineas.map((l) => [l.id, l.cantProgramada]))
        : undefined;

    this.api.avanzar(this.id, o.siguienteEstado, cantidades).subscribe({
      next: () => {
        this.guardando.set(false);
        this.cargar();
      },
      error: (e) => {
        this.guardando.set(false);
        this.error.set(e?.error?.message ?? 'No se pudo avanzar la orden');
      },
    });
  }

  abrirAvance(): void {
    this.nuevoAvance = { piezasCortadas: 0, piezasDanadas: 0, piezasRepuestas: 0, observaciones: '' };
    this.errorAvance.set(null);
    this.formAvance.set(true);
  }

  cerrarAvance(): void {
    this.formAvance.set(false);
  }

  guardarAvance(): void {
    this.errorAvance.set(null);
    this.guardando.set(true);
    this.api
      .registrarAvance(this.id, {
        piezasCortadas: Number(this.nuevoAvance.piezasCortadas),
        piezasDanadas: Number(this.nuevoAvance.piezasDanadas),
        piezasRepuestas: Number(this.nuevoAvance.piezasRepuestas),
        observaciones: this.nuevoAvance.observaciones || undefined,
      })
      .subscribe({
        next: () => {
          this.guardando.set(false);
          this.formAvance.set(false);
          this.cargar();
        },
        error: (e) => {
          this.guardando.set(false);
          this.errorAvance.set(e?.error?.message ?? 'No se pudo guardar el avance');
        },
      });
  }
}
