import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PedidosApi } from '../../../core/api/pedidos.api';
import { DiaProyectado, DisponibleVenta, EstadoProyeccion, PedidoProyectado, Proyeccion } from '../../../core/api/models/proyeccion.models';
import { descargarXlsx } from '../../../shared/xlsx/xlsx-mini';
import { ETIQUETA_ESTADO, fechaCorta, filtrarPedidos, hojasProyeccion, tallasDisponibles } from './proyeccion.util';

interface Segmento {
  ocId: number;
  etiqueta: string;
  titulo: string;
  ancho: number;
  tarde: boolean;
  resaltado: boolean;
}

/**
 * Proyección de pedidos: lo que Gabriel le pide a Juan Pablo (2026-11-12). Con los
 * pedidos confirmados y lo que hay en bodega, cuánto trabajo tiene la planta, qué
 * pedido no llega a su fecha y desde qué día queda cupo para vender. Solo lectura:
 * es una simulación, no programa nada.
 */
@Component({
  selector: 'app-proyeccion-pedidos',
  standalone: true,
  imports: [DecimalPipe, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <div class="ph-title">Proyección de pedidos</div>
          <div class="t-sm t-muted">
            Pedidos confirmados contra la capacidad de la planta
            @if (datos(); as d) { · {{ d.paresPorDia | number }} pares de corte por día · {{ d.diasProceso }} días de corte a terminado · al {{ fecha(d.hoy) }} }
          </div>
        </div>
        <div class="acciones">
          <button class="btn" type="button" (click)="cargar()" [disabled]="cargando()">Actualizar</button>
          <button class="btn btn-primary" type="button" (click)="descargar()" [disabled]="!datos() || !datos()!.pedidos.length">Descargar Excel</button>
        </div>
      </div>

      @if (cargando() && !datos()) {
        <div class="card"><div class="card-body">Calculando la proyección…</div></div>
      } @else if (error()) {
        <div class="card"><div class="card-body"><div class="empty"><h4>No se pudo calcular la proyección</h4><p class="cell-sub">{{ error() }}</p></div></div></div>
      } @else {
      @if (datos(); as d) {
        @if (!d.pedidos.length) {
          <div class="card"><div class="card-body"><div class="empty">
            <h4>No hay pedidos confirmados por entregar</h4>
            <p>Apenas se confirme un pedido aparece acá, con la fecha en la que la planta alcanza a sacarlo.</p>
          </div></div></div>
        } @else {
          <div class="kpis">
            <div class="kpi">
              <div class="kpi-label">Planta comprometida hasta</div>
              <div class="kpi-value">{{ d.resumen.hastaCuando ? fecha(d.resumen.hastaCuando) : 'hoy' }}</div>
              <div class="kpi-delta t-muted">el último pedido entra a terminado · {{ d.resumen.aProducir | number }} pares por producir</div>
            </div>
            <div class="kpi">
              <div class="kpi-label">Cupo de corte libre desde</div>
              <div class="kpi-value">{{ fecha(d.resumen.primerCupoLibre) || 'sin cupo' }}</div>
              <div class="kpi-delta t-muted">{{ d.resumen.paresLibresEnVentana | number }} pares libres en los días ya ocupados</div>
            </div>
            <div class="kpi">
              <div class="kpi-label">Queda en bodega para vender</div>
              <div class="kpi-value">{{ d.resumen.paresParaVender | number }}</div>
              <div class="kpi-delta t-muted">pares de producto terminado libres después de cubrir los pedidos@if (d.resumen.paresEntranParaVender) { · entran {{ d.resumen.paresEntranParaVender | number }} más de mínimos }</div>
            </div>
            <div class="kpi">
              <div class="kpi-label">Pedidos por entregar</div>
              <div class="kpi-value">{{ d.resumen.pedidos }}</div>
              <div class="kpi-delta t-muted">{{ d.resumen.pares | number }} pares · {{ d.resumen.deBodega | number }} salen de bodega</div>
            </div>
            <div class="kpi" [class.kpi-mal]="tarde(d) > 0">
              <div class="kpi-label">No llegan a su fecha</div>
              <div class="kpi-value">{{ tarde(d) }}</div>
              <div class="kpi-delta t-muted">{{ tarde(d) ? 'hay que priorizarlos o avisar al cliente' : 'todos llegan a tiempo' }}</div>
            </div>
          </div>

          <div class="card bloque">
            <div class="card-head">
              <div>
                <div class="ph-title sm">Corte por día</div>
                <div class="t-caption t-muted">Cada barra es un día de corte de {{ d.paresPorDia | number }} pares; lo cortado queda listo {{ d.diasProceso }} días hábiles después. Pasa el cursor por un tramo para ver el pedido.</div>
              </div>
              <div class="leyenda t-caption">
                <span><i class="cuad ok"></i>A tiempo</span>
                <span><i class="cuad mal"></i>No alcanza su fecha</span>
                <span><i class="cuad libre"></i>Cupo libre</span>
              </div>
            </div>
            <div class="card-body dias">
              @for (dia of d.dias; track dia.fecha) {
                <div class="dia">
                  <div class="dia-fecha" [class.t-muted]="!dia.usado">{{ fecha(dia.fecha) }}</div>
                  <div class="barra" role="img" [attr.aria-label]="fecha(dia.fecha) + ': ' + dia.usado + ' de ' + dia.capacidad + ' pares'">
                    @for (s of segmentos(dia); track s.ocId) {
                      <div class="seg" [class.mal]="s.tarde" [class.resaltado]="s.resaltado" [style.width.%]="s.ancho" [title]="s.titulo"
                           (mouseenter)="resaltar.set(s.ocId)" (mouseleave)="resaltar.set(null)">
                        @if (s.ancho >= 7) { <span>{{ s.etiqueta }}</span> }
                      </div>
                    }
                  </div>
                  <div class="dia-num num">
                    <strong>{{ dia.usado | number }}</strong>
                    <span class="t-muted"> / {{ dia.capacidad | number }}</span>
                    @if (dia.libre > 0) { <span class="libre-txt">{{ dia.libre | number }} libres</span> }
                  </div>
                </div>
              }
            </div>
          </div>

          <div class="card bloque">
            <div class="table-toolbar">
              <div class="filtros">
                <input class="input buscar" type="search" placeholder="Buscar cliente, referencia o marca" aria-label="Buscar cliente, referencia o marca"
                       [ngModel]="texto()" (ngModelChange)="texto.set($event)" />
                <div class="select-wrap">
                  <select class="select" aria-label="Filtrar por estado" [ngModel]="estado()" (ngModelChange)="estado.set($event)">
                    <option value="">Todos los estados</option>
                    <option value="ATRASADO">No llegan</option>
                    <option value="A_TIEMPO">A tiempo</option>
                    <option value="EN_BODEGA">Salen de bodega</option>
                    <option value="SIN_CUPO">Sin cupo</option>
                  </select>
                </div>
              </div>
              <div class="t-caption t-muted">{{ visibles().length }} de {{ d.pedidos.length }} pedidos · {{ paresVisibles() | number }} pares por producir</div>
            </div>
            <div class="table-scroll">
              <table class="data tabla-pedidos">
                <thead><tr>
                  <th>Pedido</th><th>Cliente</th><th>Ref.</th><th>Marca</th>
                  <th class="num">Pares</th><th class="num">De bodega</th><th class="num">A producir</th>
                  <th>Compromiso</th><th>Último corte</th><th>Listo en PT</th><th>Estado</th>
                </tr></thead>
                <tbody>
                  @for (p of visibles(); track p.ocId) {
                    <tr [class.fila-resaltada]="resaltar() === p.ocId" (mouseenter)="resaltar.set(p.ocId)" (mouseleave)="resaltar.set(null)">
                      <td class="cell-mono">OC-{{ p.consecutivo }}
                        @if (p.ocCliente) { <div class="cell-sub">{{ p.ocCliente }}</div> }</td>
                      <td>{{ p.cliente }}@if (p.paraStock) { <span class="badge badge-info">Mínimos</span> }</td>
                      <td class="cell-mono">{{ p.referencias.join(', ') }}</td>
                      <td>{{ p.marcas.join(', ') }}</td>
                      <td class="num">{{ p.pares | number }}</td>
                      <td class="num t-muted">{{ p.deBodega | number }}</td>
                      <td class="num"><strong>{{ p.aProducir | number }}</strong></td>
                      <td class="nw">{{ fecha(p.compromiso) }}@if (p.compromisoEstimado) { <span class="t-muted" title="Estimado: confirmación más 15 días"> *</span> }</td>
                      <td class="nw t-muted">{{ fecha(p.finCorte) }}</td>
                      <td class="nw">
                        @if (p.fin) { {{ fecha(p.fin) }} } @else if (p.estado === 'EN_BODEGA') { <span class="t-muted">ya está</span> }
                        @if (p.diasAtraso > 0) { <div class="cell-sub tarde-txt">{{ p.diasAtraso }} {{ p.diasAtraso === 1 ? 'día' : 'días' }} tarde</div> }
                        @if (p.sinCupo > 0) { <div class="cell-sub tarde-txt">{{ p.sinCupo | number }} pares sin cupo</div> }
                      </td>
                      <td><span class="badge {{ etiqueta(p.estado).clase }}"><span class="dot"></span>{{ etiqueta(p.estado).label }}</span></td>
                    </tr>
                  } @empty {
                    <tr><td colspan="11" class="t-muted">Ningún pedido coincide con el filtro.</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          <div class="card bloque">
            <div class="card-head">
              <div>
                <div class="ph-title sm">Queda en bodega para vender</div>
                <div class="t-caption t-muted">Producto terminado libre después de cubrir todos los pedidos confirmados.</div>
              </div>
              <div class="t-caption t-muted">{{ d.resumen.paresParaVender | number }} pares</div>
            </div>
            @if (d.disponible.length) {
              <div class="table-scroll">
                <table class="data tabla-venta">
                  <thead><tr>
                    <th>Ref.</th><th>Producto</th>
                    @for (t of tallasVenta(); track t) { <th class="num">{{ t }}</th> }
                    <th class="num">Total</th>
                  </tr></thead>
                  <tbody>
                    @for (g of d.disponible; track g.productoConfiguradoId + g.calidad) {
                      <tr>
                        <td class="cell-mono">{{ g.referencia }}</td>
                        <td>{{ g.producto }}@if (g.calidad === 'SEGUNDA') { <span class="badge badge-warning">Segunda</span> }</td>
                        @for (t of tallasVenta(); track t) { <td class="num" [class.t-muted]="!pares(g, t)">{{ pares(g, t) ? (pares(g, t) | number) : '·' }}</td> }
                        <td class="num"><strong>{{ g.total | number }}</strong></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <div class="card-body t-muted">No queda producto terminado libre: todo lo de bodega se lo llevan los pedidos.</div>
            }
          </div>

          @if (d.entraParaVender.length) {
            <div class="card bloque">
              <div class="card-head">
                <div>
                  <div class="ph-title sm">Entra para vender</div>
                  <div class="t-caption t-muted">Proyectado: lo que fabrican las órdenes de mínimos y queda libre en bodega el día que entra a producto terminado.</div>
                </div>
                <div class="t-caption t-muted">{{ d.resumen.paresEntranParaVender | number }} pares</div>
              </div>
              <div class="table-scroll">
                <table class="data tabla-entra">
                  <thead><tr>
                    <th>Listo en PT</th><th>Pedido</th><th>Ref.</th><th>Producto</th>
                    @for (t of tallasEntra(); track t) { <th class="num">{{ t }}</th> }
                    <th class="num">Total</th>
                  </tr></thead>
                  <tbody>
                    @for (g of d.entraParaVender; track g.ocId + '-' + g.productoConfiguradoId + g.calidad) {
                      <tr>
                        <td class="nw">{{ fecha(g.fecha) || 'sin cupo' }}</td>
                        <td class="cell-mono">OC-{{ g.consecutivo }}</td>
                        <td class="cell-mono">{{ g.referencia }}</td>
                        <td>{{ g.producto }}</td>
                        @for (t of tallasEntra(); track t) { <td class="num" [class.t-muted]="!pares(g, t)">{{ pares(g, t) ? (pares(g, t) | number) : '·' }}</td> }
                        <td class="num"><strong>{{ g.total | number }}</strong></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }

          <div class="notas t-caption t-muted">
            <p><strong>Cómo leerla.</strong> Los pedidos se atienden por fecha de compromiso. A cada uno se le descuenta lo que hay en bodega de producto terminado y lo que falta se reparte en días de corte, sin pasar de {{ d.paresPorDia | number }} pares al día ni de lo que dan los moldes de inyección de cada talla (70 pares por molde). Cada pedido queda listo {{ d.diasProceso }} días hábiles después de su último corte; ese dato es provisional y falta que producción lo confirme.</p>
            <p>* El compromiso con asterisco es estimado: la confirmación del pedido más 15 días, porque los pedidos todavía no llevan fecha de entrega escrita.</p>
            <p>Las órdenes de mínimos no toman de la bodega: se fabrican completas y lo que producen aparece en "Entra para vender" con su fecha. Todavía no tiene en cuenta los cortes, la guarnición ni las capelladas que ya están en proceso. Es una simulación para decidir: el corte del día lo sigue armando producción.</p>
          </div>
        }
      }
      }
    </div>
  `,
  styles: [`
    .acciones { display: flex; gap: 8px; align-items: center; }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: var(--sp-4); margin-bottom: var(--sp-5); }
    .kpi-value { font-size: 24px; }
    .kpi-mal { border-color: var(--error); }
    .kpi-mal .kpi-value { color: var(--error); }
    .bloque { margin-bottom: var(--sp-5); }
    .ph-title.sm { font-size: var(--text-body); }
    .leyenda { display: flex; gap: var(--sp-4); flex-wrap: wrap; color: var(--text-muted); }
    .leyenda span { display: inline-flex; align-items: center; gap: 6px; }
    .cuad { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
    .cuad.ok, .seg { background: var(--primary); }
    .cuad.mal, .seg.mal { background: var(--error); }
    .cuad.libre { background: var(--surface-sunken); border: var(--bw) dashed var(--border-strong); }
    .dias { display: flex; flex-direction: column; gap: var(--sp-2); }
    .dia { display: grid; grid-template-columns: 96px minmax(0, 1fr) 210px; gap: var(--sp-3); align-items: center; }
    .dia-fecha { font-size: var(--text-sm); font-weight: var(--fw-medium); white-space: nowrap; }
    .barra { display: flex; height: 26px; border-radius: var(--r-sm); overflow: hidden; background: var(--surface-sunken); border: var(--bw) dashed var(--border-strong); }
    .seg { color: var(--primary-fg); font-family: var(--font-mono); font-size: 10px; display: flex; align-items: center; justify-content: center; overflow: hidden; white-space: nowrap; box-shadow: inset -1px 0 0 color-mix(in oklch, var(--surface) 55%, transparent); transition: filter .12s; min-width: 2px; }
    .seg.mal { color: var(--error-fg); }
    .seg.resaltado { filter: brightness(1.25) saturate(1.2); box-shadow: inset 0 0 0 2px var(--accent); }
    .dia-num { font-size: var(--text-sm); white-space: nowrap; }
    .libre-txt { margin-left: 8px; color: var(--success); font-size: var(--text-caption); }
    .filtros { display: flex; gap: var(--sp-2); flex-wrap: wrap; }
    .buscar { min-width: 280px; }
    .fila-resaltada { background: var(--primary-subtle); }
    .tarde-txt { color: var(--error); }
    .nw { white-space: nowrap; }
    .notas { max-width: 920px; }
    .notas p { margin: 0 0 6px; }
    @media (max-width: 760px) {
      .dia { grid-template-columns: 80px minmax(0, 1fr); }
      .dia-num { grid-column: 2; }
      .buscar { min-width: 0; width: 100%; }
    }
  `],
})
export class ProyeccionComponent implements OnInit {
  private readonly api = inject(PedidosApi);
  private readonly destroyRef = inject(DestroyRef);

  datos = signal<Proyeccion | null>(null);
  cargando = signal(true);
  error = signal('');
  texto = signal('');
  estado = signal<EstadoProyeccion | ''>('');
  /** Pedido bajo el cursor: se ilumina en las barras y en la tabla a la vez. */
  resaltar = signal<number | null>(null);

  private readonly porOc = computed(() => new Map((this.datos()?.pedidos ?? []).map((p) => [p.ocId, p])));
  visibles = computed<PedidoProyectado[]>(() => filtrarPedidos(this.datos()?.pedidos ?? [], this.texto(), this.estado()));
  paresVisibles = computed(() => this.visibles().reduce((a, p) => a + p.aProducir, 0));
  tallasVenta = computed(() => tallasDisponibles(this.datos()?.disponible ?? []));
  tallasEntra = computed(() => tallasDisponibles(this.datos()?.entraParaVender ?? []));
  pares = (g: { tallas: { talla: number; pares: number }[] }, talla: number) => g.tallas.find((t) => t.talla === talla)?.pares ?? 0;

  fecha = fechaCorta;
  etiqueta = (e: EstadoProyeccion) => ETIQUETA_ESTADO[e];
  tarde = (d: Proyeccion) => d.resumen.atrasados + d.resumen.sinCupo;

  ngOnInit(): void { this.cargar(); }

  cargar(): void {
    this.cargando.set(true);
    this.error.set('');
    this.api.proyeccion()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (d) => { this.datos.set(d); this.cargando.set(false); },
        error: (e) => { this.error.set(e?.error?.message ?? 'Intenta de nuevo en un momento.'); this.cargando.set(false); },
      });
  }

  segmentos(dia: DiaProyectado): Segmento[] {
    const resaltado = this.resaltar();
    return dia.bloques.map((b) => {
      const p = this.porOc().get(b.ocId);
      return {
        ocId: b.ocId,
        etiqueta: `OC-${b.consecutivo}`,
        titulo: `OC-${b.consecutivo} · ${b.cliente} · ${b.pares} pares${p ? ` · compromiso ${fechaCorta(p.compromiso)}` : ''}`,
        ancho: (b.pares / dia.capacidad) * 100,
        tarde: b.tarde,
        resaltado: resaltado === b.ocId,
      };
    });
  }

  descargar(): void {
    const d = this.datos();
    if (!d) return;
    // Baja lo mismo que se ve: si hay filtro, el Excel sale filtrado.
    descargarXlsx(`proyeccion-pedidos-${d.hoy}`, hojasProyeccion(d, this.visibles()));
  }
}
