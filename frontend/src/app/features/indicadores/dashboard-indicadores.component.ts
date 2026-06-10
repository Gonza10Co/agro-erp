import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IndicadoresApi } from '../../core/api/indicadores.api';
import { EtapaIndicador, Indicadores } from '../../core/api/models/indicadores.models';
import { Celula, LABEL_CELULA, LABEL_SUBPASO } from '../../core/api/models/fabricacion.models';

@Component({
  selector: 'app-dashboard-indicadores',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="ph-title">Indicadores · eficiencia</div>
        <button class="btn" (click)="cargar()">Actualizar</button>
      </div>
      @if (error()) {
        <div class="empty"><h4>No se pudieron cargar los indicadores</h4><p class="cell-sub">{{ error() }}</p></div>
      }
      @if (!error() && data(); as d) {
        <div class="card"><div class="card-body">
          <h4>Tiempo por etapa</h4>
          @if (d.etapas.length) {
            <table class="tabla">
              <thead><tr><th>Etapa</th><th class="num"># tramos</th><th class="num">Promedio (min)</th></tr></thead>
              <tbody>
                @for (e of d.etapas; track $index) {
                  <tr><td>{{ etapaLabel(e) }}</td><td class="num">{{ e.tramos }}</td><td class="num">{{ e.promedioMin }}</td></tr>
                }
              </tbody>
            </table>
          } @else {
            <p class="cell-sub">Sin tramos registrados todavía.</p>
          }
        </div></div>

        <div class="card"><div class="card-body">
          <h4>Eficiencia por operario</h4>
          @if (d.operarios.length) {
            <table class="tabla">
              <thead><tr><th>Operario</th><th class="num"># tramos</th><th class="num">Promedio (min)</th></tr></thead>
              <tbody>
                @for (o of d.operarios; track o.operarioId) {
                  <tr><td>{{ o.nombre }}</td><td class="num">{{ o.tramos }}</td><td class="num">{{ o.promedioMin }}</td></tr>
                }
              </tbody>
            </table>
          } @else {
            <p class="cell-sub">Sin datos de operarios todavía.</p>
          }
        </div></div>

        <div class="card"><div class="card-body">
          <h4>Eficiencia por máquina</h4>
          @if (d.maquinas.length) {
            <table class="tabla">
              <thead><tr><th>Máquina</th><th class="num"># tramos</th><th class="num">Promedio (min)</th></tr></thead>
              <tbody>
                @for (m of d.maquinas; track m.maquinaId) {
                  <tr><td>{{ m.nombre }}</td><td class="num">{{ m.tramos }}</td><td class="num">{{ m.promedioMin }}</td></tr>
                }
              </tbody>
            </table>
          } @else {
            <p class="cell-sub">Sin datos de máquinas todavía.</p>
          }
        </div></div>

        <div class="card alertas"><div class="card-body">
          <h4>Alertas de demora</h4>
          @if (d.alertas.length) {
            @for (a of d.alertas; track a.codigo) {
              <div class="alerta">
                <a class="alerta-cod" [routerLink]="['/fabricacion/par', a.codigo]">{{ a.codigo }}</a>
                <span class="alerta-etapa">{{ etapaLabel(a) }}</span>
                <span class="alerta-tiempo">lleva {{ a.minutosEnEtapa }} min (umbral {{ a.umbralMin }})</span>
              </div>
            }
          } @else {
            <p class="cell-sub">Sin alertas de demora.</p>
          }
        </div></div>
      }
    </div>
  `,
  styles: [`
    .card{margin-top:var(--sp-4)}
    .card:first-of-type{margin-top:0}
    .tabla{width:100%;border-collapse:collapse}
    .tabla th,.tabla td{text-align:left;padding:var(--sp-2);border-bottom:var(--bw) solid var(--border)}
    .num{text-align:right}
    .alertas .card-body{border-left:3px solid var(--danger)}
    .alerta{display:flex;align-items:center;gap:var(--sp-3);padding:var(--sp-2) 0;border-bottom:var(--bw) solid var(--border)}
    .alerta:last-child{border-bottom:none}
    .alerta-cod{font-weight:var(--fw-medium);color:var(--danger)}
    .alerta-etapa{color:var(--text-subtle)}
    .alerta-tiempo{margin-left:auto;color:var(--danger)}
  `],
})
export class DashboardIndicadoresComponent implements OnInit {
  private readonly api = inject(IndicadoresApi);
  private readonly destroyRef = inject(DestroyRef);
  data = signal<Indicadores | null>(null);
  error = signal<string | null>(null);
  labelCelula = (c: Celula) => LABEL_CELULA[c];
  etapaLabel = (e: Pick<EtapaIndicador, 'celula' | 'subPaso'>) =>
    LABEL_CELULA[e.celula] + (e.subPaso ? ' · ' + LABEL_SUBPASO[e.subPaso] : '');

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
