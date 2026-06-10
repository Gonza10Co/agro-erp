import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { QRCodeComponent } from 'angularx-qrcode';
import { FabricacionApi } from '../../core/api/fabricacion.api';
import { ParDetalle, EventoTrazabilidad, LABEL_CELULA, LABEL_ESTADO_PAR } from '../../core/api/models/fabricacion.models';
import { IncidenciaPar } from '../../core/api/models/calidad.models';

type ItemTimeline =
  | { kind: 'evento'; ts: string; evento: EventoTrazabilidad }
  | { kind: 'incidencia'; ts: string; incidencia: IncidenciaPar };

@Component({
  selector: 'app-par-detalle',
  standalone: true,
  imports: [DatePipe, QRCodeComponent, RouterLink],
  template: `
    <div class="page">
      <div class="page-header"><div class="ph-title">Trazabilidad del par</div></div>
      @if (par(); as p) {
        <div class="grid">
          <div class="card"><div class="card-body qr-box">
            <qrcode [qrdata]="p.codigo" [width]="200" [errorCorrectionLevel]="'M'"></qrcode>
            <div class="mono code">{{ p.codigo }}</div>
            <div class="cell-sub">OF-{{ p.of.consecutivo }} · Talla {{ p.talla.valor }}</div>
            <div>
              @if (p.estado === 'EN_PROCESO') {
                <span class="badge">en {{ label(p.celulaActual) }}</span>
              } @else {
                <span class="badge" [class.badge-accent]="p.estado === 'TERMINADO'">{{ estadoLabel(p.estado) }}</span>
              }
            </div>
            @if (p.reponeA; as r) {
              <div class="cell-sub">Repone a
                <a class="mono" [routerLink]="['/fabricacion/par', r.codigo]">{{ r.codigo }}</a>
              </div>
            }
            @if (p.repuestoPor; as r) {
              <div class="cell-sub">Repuesto por
                <a class="mono" [routerLink]="['/fabricacion/par', r.codigo]">{{ r.codigo }}</a>
              </div>
            }
          </div></div>
          <div class="card"><div class="card-body">
            <h4>Recorrido</h4>
            @if (timeline().length) {
              <ul class="timeline">
                @for (item of timeline(); track item.kind + '-' + itemId(item)) {
                  @if (item.kind === 'evento') {
                    <li>
                      <span class="tl-cel">{{ label(item.evento.celula) }}</span>
                      <span class="cell-sub">{{ item.evento.operario.nombre }} · {{ item.evento.maquina.nombre }}</span>
                      <span class="cell-sub mono">{{ item.evento.timestamp | date:'dd MMM HH:mm' }}</span>
                    </li>
                  } @else {
                    <li class="incidencia" [class.baja]="item.incidencia.tipoDano.clase === 'BAJA'">
                      <span class="tl-cel">
                        {{ item.incidencia.tipoDano.clase === 'BAJA' ? '✖' : '⚠' }}
                        {{ item.incidencia.tipoDano.nombre }}
                        <small>(imputado a {{ label(item.incidencia.tipoDano.celulaCausante) }})</small>
                      </span>
                      <span class="cell-sub">
                        Detectado en {{ label(item.incidencia.celulaDeteccion) }} por {{ item.incidencia.operario.nombre }}
                        @if (item.incidencia.autorizadoPor; as a) { · acta: {{ a.username }} }
                      </span>
                      @if (item.incidencia.descripcion) { <span class="cell-sub">"{{ item.incidencia.descripcion }}"</span> }
                      @if (item.incidencia.parReposicion; as rep) {
                        <span class="cell-sub">Reposición:
                          <a class="mono" [routerLink]="['/fabricacion/par', rep.codigo]">{{ rep.codigo }}</a>
                        </span>
                      }
                      <span class="cell-sub mono">{{ item.incidencia.timestamp | date:'dd MMM HH:mm' }}</span>
                    </li>
                  }
                }
              </ul>
            } @else {
              <p class="cell-sub">Sin eventos todavía.</p>
            }
          </div></div>
        </div>
      } @else {
        <div class="empty"><h4>{{ error() ?? 'Cargando…' }}</h4></div>
      }
    </div>
  `,
  styles: [`
    .grid{display:grid;grid-template-columns:minmax(220px,280px) 1fr;gap:var(--sp-4)}
    .qr-box{display:flex;flex-direction:column;align-items:center;gap:var(--sp-2);text-align:center}
    .code{font-size:var(--text-sm)}
    .timeline{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:var(--sp-3)}
    .timeline li{display:flex;flex-direction:column;gap:2px;padding-bottom:var(--sp-3);border-bottom:var(--bw) solid var(--border)}
    .tl-cel{font-weight:var(--fw-medium)}
    .mono{font-family:var(--font-mono)}
    .incidencia .tl-cel{color:var(--accent)}
    .incidencia.baja .tl-cel{color:var(--danger)}
  `],
})
export class ParDetalleComponent implements OnInit {
  private readonly api = inject(FabricacionApi);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  par = signal<ParDetalle | null>(null);
  error = signal<string | null>(null);
  label = (c: ParDetalle['celulaActual']) => LABEL_CELULA[c];
  estadoLabel = (e: ParDetalle['estado']) => LABEL_ESTADO_PAR[e];
  ts = (i: ItemTimeline) => i.ts;
  itemId = (i: ItemTimeline) => i.kind === 'evento' ? i.evento.id : i.incidencia.id;

  timeline = computed<ItemTimeline[]>(() => {
    const p = this.par();
    if (!p) return [];
    const eventos = p.eventos.map((e) => ({ kind: 'evento' as const, ts: e.timestamp, evento: e }));
    const incidencias = (p.incidencias ?? []).map((i) => ({
      kind: 'incidencia' as const, ts: i.timestamp, incidencia: i,
    }));
    return [...eventos, ...incidencias].sort((a, b) => a.ts.localeCompare(b.ts));
  });

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const codigo = params.get('codigo');
      if (!codigo) return;
      this.par.set(null);
      this.error.set(null);
      this.api.par(codigo).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (p) => this.par.set(p),
        error: () => this.error.set('Par no encontrado'),
      });
    });
  }
}
