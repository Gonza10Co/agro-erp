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
      }
      @if (!error() && data(); as d) {
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
