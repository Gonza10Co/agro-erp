import { Component, DestroyRef, ElementRef, OnInit, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { FabricacionApi } from '../../core/api/fabricacion.api';
import { HoyEstacion } from '../../core/api/models/fabricacion.models';

/** Cada cuánto se refresca sola la pantalla de planta. */
export const TV_REFRESCO_MS = 30_000;

/** Porcentaje de avance sobre la meta, tope 100. */
export function pctMeta(hoy: number, meta: number): number {
  if (!meta) return 0;
  return Math.min(100, Math.round((hoy / meta) * 100));
}

/**
 * TV de planta (piloto 2026-09-09): un número gigante por estación, hoy contra la
 * meta del día, y cuántos en la última hora. Reemplaza el tablero manual
 * "HORA / N° PARES" que llevan con marcador. Se lee de reojo a 5 metros: nada de
 * pares, nada de tablas. Se refresca sola cada 30 segundos.
 */
@Component({
  selector: 'app-tv-planta',
  standalone: true,
  template: `
    <div class="tv" #tv>
      <header class="tv-h">
        <div class="tv-titulo">Planta · hoy</div>
        <div class="tv-meta">
          @if (datos(); as d) { {{ d.fecha }} · actualizado {{ hora(d.actualizado) }} }
          @if (error()) { <span class="tv-err">· sin conexión, mostrando lo último</span> }
        </div>
        <button class="btn btn-sm" type="button" (click)="pantallaCompleta()">Pantalla completa ⤢</button>
      </header>

      <div class="grid" [style.--n]="estaciones().length || 1">
        @for (e of estaciones(); track e.codigo) {
          <div class="tarjeta" [class.cumplida]="e.hoy >= e.meta">
            <div class="nombre">{{ e.nombre }}</div>
            <div class="num">{{ e.hoy }}</div>
            <div class="meta">de {{ e.meta }}</div>
            <div class="barra"><div class="fill" [style.width.%]="pct(e.hoy, e.meta)"></div></div>
            <div class="pie"><span class="pct">{{ pct(e.hoy, e.meta) }}%</span><span>última hora <b>{{ e.ultimaHora }}</b></span></div>
          </div>
        } @empty {
          <div class="empty"><h4>Sin estaciones activas</h4></div>
        }
      </div>
    </div>
  `,
  styles: [`
    .tv{min-height:calc(100vh - 32px);display:flex;flex-direction:column;gap:var(--sp-5);background:var(--bg);padding:var(--sp-4)}
    .tv:fullscreen{padding:var(--sp-6,24px);min-height:100vh}
    .tv-h{display:flex;align-items:baseline;gap:var(--sp-4)}
    .tv-titulo{font-size:var(--text-h1);font-weight:var(--fw-bold);letter-spacing:var(--ls-h1)}
    .tv-meta{flex:1;color:var(--text-subtle)}
    .tv-err{color:var(--error)}
    .grid{flex:1;display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));gap:var(--sp-4)}
    .tarjeta{display:flex;flex-direction:column;justify-content:center;gap:var(--sp-2);padding:var(--sp-5);background:var(--surface);border:var(--bw) solid var(--border);border-radius:var(--radius-sm);text-align:center;min-height:42vh}
    .tarjeta.cumplida{border-color:var(--success);background:var(--success-subtle)}
    .nombre{font-size:clamp(16px,2vw,28px);font-weight:var(--fw-semibold);color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em}
    .num{font-size:clamp(64px,11vw,200px);line-height:1;font-weight:var(--fw-bold);font-variant-numeric:tabular-nums;color:var(--text)}
    .tarjeta.cumplida .num{color:var(--success)}
    .meta{font-size:clamp(14px,1.8vw,26px);color:var(--text-subtle)}
    .barra{height:14px;background:var(--inset);border-radius:7px;overflow:hidden;margin-top:var(--sp-2)}
    .fill{height:100%;background:var(--primary);transition:width .6s ease}
    .tarjeta.cumplida .fill{background:var(--success)}
    .pie{display:flex;justify-content:space-between;font-size:clamp(13px,1.4vw,20px);color:var(--text-muted)}
    .pct{font-weight:var(--fw-bold)}
    @media (max-width:900px){ .grid{grid-template-columns:1fr 1fr} .tarjeta{min-height:auto} .num{font-size:clamp(48px,14vw,120px)} }
  `],
})
export class TvPlantaComponent implements OnInit {
  private readonly api = inject(FabricacionApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly tvEl = viewChild<ElementRef<HTMLElement>>('tv');

  datos = signal<{ fecha: string; actualizado: string } | null>(null);
  estaciones = signal<HoyEstacion[]>([]);
  error = signal(false);

  readonly pct = pctMeta;

  ngOnInit(): void {
    this.cargar();
    interval(TV_REFRESCO_MS).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.cargar());
  }

  cargar(): void {
    this.api.hoy().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (h) => {
        this.error.set(false);
        this.datos.set({ fecha: h.fecha, actualizado: h.actualizado });
        this.estaciones.set(h.estaciones);
      },
      error: () => this.error.set(true),
    });
  }

  hora(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  pantallaCompleta(): void {
    const el = this.tvEl()?.nativeElement;
    if (el && !document.fullscreenElement) void el.requestFullscreen?.();
    else if (document.fullscreenElement) void document.exitFullscreen?.();
  }
}
