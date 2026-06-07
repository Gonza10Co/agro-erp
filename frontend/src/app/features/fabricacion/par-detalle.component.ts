import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { QRCodeComponent } from 'angularx-qrcode';
import { FabricacionApi } from '../../core/api/fabricacion.api';
import { ParDetalle, LABEL_CELULA } from '../../core/api/models/fabricacion.models';

@Component({
  selector: 'app-par-detalle',
  standalone: true,
  imports: [DatePipe, QRCodeComponent],
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
              @if (p.estado === 'TERMINADO') { <span class="badge badge-accent">terminado</span> }
              @else { <span class="badge">en {{ label(p.celulaActual) }}</span> }
            </div>
          </div></div>
          <div class="card"><div class="card-body">
            <h4>Recorrido</h4>
            @if (p.eventos.length) {
              <ul class="timeline">
                @for (e of p.eventos; track e.id) {
                  <li>
                    <span class="tl-cel">{{ label(e.celula) }}</span>
                    <span class="cell-sub">{{ e.operario.nombre }} · {{ e.maquina.nombre }}</span>
                    <span class="cell-sub mono">{{ e.timestamp | date:'dd MMM HH:mm' }}</span>
                  </li>
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
  `],
})
export class ParDetalleComponent implements OnInit {
  private readonly api = inject(FabricacionApi);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  par = signal<ParDetalle | null>(null);
  error = signal<string | null>(null);
  label = (c: ParDetalle['celulaActual']) => LABEL_CELULA[c];

  ngOnInit(): void {
    const codigo = this.route.snapshot.paramMap.get('codigo')!;
    this.api.par(codigo).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (p) => this.par.set(p),
      error: () => this.error.set('Par no encontrado'),
    });
  }
}
