import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { FabricacionApi } from '../../core/api/fabricacion.api';
import { ProductionByDay } from '../../core/api/models/fabricacion.models';

/** Suma días a una fecha civil YYYY-MM-DD, sin que la zona horaria la corra. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** `2026-11-21` → "sábado, 21 de noviembre de 2026". */
export function longDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('es-CO', {
    timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

/** Hora de Bogotá HH:mm, sin importar la zona del dispositivo. */
export function bogotaTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' });
}

/**
 * Producción por día (2026-11-25, pedido de Valen y Jefferson): cuántos pares entraron
 * a cada estación en un día, hoy o pasado, y de qué orden, producto y talla eran.
 */
@Component({
  selector: 'app-production-by-day',
  standalone: true,
  template: `
    <div class="page">
      <div class="page-header">
        <div class="ph-title">Producción por día</div>
        <div class="fecha">
          <button class="btn prev" type="button" [disabled]="!date()" (click)="move(-1)" aria-label="Día anterior">←</button>
          <input class="input" type="date" aria-label="Fecha" [value]="date() ?? ''" [max]="today() ?? ''" (change)="pick($any($event.target))" />
          <button class="btn next" type="button" [disabled]="!canGoNext()" (click)="move(1)" aria-label="Día siguiente">→</button>
        </div>
        @if (!isToday() && today()) { <button class="btn hoy" type="button" (click)="load(today()!)">Hoy</button> }
        <button class="btn" type="button" [disabled]="loading()" (click)="load(date() ?? undefined)">Actualizar</button>
      </div>

      <p class="nota">
        Cada número es la cantidad de pares que <b>entraron</b> a la estación ese día (el pistolazo marca la entrada).
        Un par cuenta una sola vez por estación.
      </p>

      @if (error()) {
        <div class="empty"><h4>No se pudo cargar la producción</h4><p class="cell-sub">{{ error() }}</p></div>
      } @else if (data()) {
        <div class="dia">
          <b>{{ longDate(data()!.date) }}</b>
          <span class="cell-sub">@if (isToday()) { hoy, va hasta las {{ time(data()!.updatedAt) }} }</span>
        </div>
        @if (isEmpty()) { <p class="sin-registros">Este día no tiene registros en ninguna estación.</p> }

        <div class="grid" [class.cargando]="loading()">
          @for (s of data()!.stations; track s.code) {
            <section class="card estacion" [class.vacia]="!s.pairs" [attr.data-station]="s.code">
              <div class="card-body">
                <div class="nombre">{{ s.name }} @if (!s.active) { <span class="badge">apagada</span> }</div>
                <div class="num">{{ s.pairs }}</div>
                <div class="cell-sub">{{ s.pairs === 1 ? 'par entró' : 'pares entraron' }}</div>
                @if (s.code === 'BODEGA_CORTE' && bodegaFollowsPrep()) {
                  <div class="ayuda">Equivale a lo que salió de Preparación.</div>
                }
                @if (s.inferred) { <div class="sin-pistolazo">{{ s.inferred }} de esos sin pistolazo</div> }
                @if (s.firstAt && s.lastAt) {
                  <div class="horas"><span>Primero <b>{{ time(s.firstAt) }}</b></span><span>Último <b>{{ time(s.lastAt) }}</b></span></div>
                }
                @if (s.orders.length) {
                  <button class="desplegar" type="button" (click)="toggle(s.code)" [attr.aria-expanded]="isOpen(s.code)">
                    {{ isOpen(s.code) ? '▾' : '▸' }} por orden y talla
                  </button>
                }
                @if (isOpen(s.code)) {
                  @for (o of s.orders; track o.ofId + '-' + o.productId) {
                    <div class="orden">
                      <div class="orden-h"><span class="mono">OF-{{ o.ofNumber }}</span><b>{{ o.pairs }}</b></div>
                      <div class="cell-sub">{{ o.product }}@if (o.inferred) { · {{ o.inferred }} sin pistolazo }</div>
                      <div class="tallas">
                        @for (t of o.sizes; track t.sizeId) {
                          <span class="talla" [title]="t.inferred ? t.inferred + ' sin pistolazo' : ''"><small>T{{ t.size }}</small><b>{{ t.pairs }}</b></span>
                        }
                      </div>
                    </div>
                  }
                }
              </div>
            </section>
          }
        </div>
      } @else {
        <div class="empty"><p class="cell-sub">Cargando…</p></div>
      }
    </div>
  `,
  styles: [`
    .page-header{display:flex;align-items:center;gap:var(--sp-3);flex-wrap:wrap}
    .page-header .ph-title{flex:1;min-width:200px}
    .fecha{display:flex;gap:var(--sp-2);align-items:center}
    .fecha .input{width:160px}
    .nota{color:var(--text-muted);font-size:var(--text-sm);margin:0 0 var(--sp-4)}
    .dia{display:flex;gap:var(--sp-2);align-items:baseline;flex-wrap:wrap;margin-bottom:var(--sp-3)}
    .sin-registros{color:var(--text-muted)}
    .mono{font-family:var(--font-mono)}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:var(--sp-4);align-items:start}
    .grid.cargando{opacity:.5}
    .nombre{font-weight:var(--fw-semibold);color:var(--text-muted)}
    .num{font-size:44px;line-height:1.1;font-weight:var(--fw-bold);font-variant-numeric:tabular-nums;color:var(--primary)}
    .vacia .num{color:var(--text-subtle)}
    .ayuda{margin-top:var(--sp-1);font-size:var(--text-sm);color:var(--text-muted)}
    .sin-pistolazo{margin-top:var(--sp-1);font-size:var(--text-sm);font-weight:var(--fw-semibold);color:var(--warning)}
    .horas{display:flex;justify-content:space-between;gap:var(--sp-3);margin-top:var(--sp-3);padding-top:var(--sp-3);border-top:var(--bw) solid var(--border);font-size:var(--text-sm);color:var(--text-muted)}
    .desplegar{margin-top:var(--sp-2);min-height:40px;background:none;border:0;padding:0;font:inherit;font-size:var(--text-sm);color:var(--accent);cursor:pointer}
    .desplegar:hover{text-decoration:underline}
    .orden{padding:var(--sp-3) 0;border-top:var(--bw) solid var(--border)}
    .orden-h{display:flex;justify-content:space-between}
    .orden-h b{font-variant-numeric:tabular-nums}
    .tallas{display:flex;flex-wrap:wrap;gap:var(--sp-2);margin-top:var(--sp-2)}
    .talla{display:flex;flex-direction:column;align-items:center;min-width:44px;padding:var(--sp-1) var(--sp-2);background:var(--inset);border-radius:var(--r-md)}
    .talla small{color:var(--text-subtle)}
    @media (max-width:600px){ .fecha{width:100%} .fecha .input{flex:1;width:auto;min-width:0} .grid{grid-template-columns:minmax(0,1fr)} }
  `],
})
export class ProductionByDayComponent implements OnInit {
  private readonly api = inject(FabricacionApi);
  private readonly destroyRef = inject(DestroyRef);
  private request?: Subscription;

  /** Fecha escogida; null solo hasta que el servidor diga cuál es hoy. */
  date = signal<string | null>(null);
  /** Hoy según el servidor: el reloj del dispositivo no decide. */
  today = signal<string | null>(null);
  data = signal<ProductionByDay | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);
  private readonly open = signal<ReadonlySet<string>>(new Set());

  isToday = computed(() => !!this.date() && this.date() === this.today());
  canGoNext = computed(() => !!this.date() && !!this.today() && this.date()! < this.today()!);
  isEmpty = computed(() => !!this.data() && this.data()!.stations.every((s) => !s.pairs));
  /** Con Cierre en el recorrido, a Bodega se llega desde Cierre y la frase no sería cierta. */
  bodegaFollowsPrep = computed(() => !this.data()?.stations.some((s) => s.code === 'CIERRE'));

  readonly longDate = longDate;
  readonly time = bogotaTime;

  ngOnInit(): void {
    this.load();
  }

  load(date?: string): void {
    this.request?.unsubscribe(); // al pasar días rápido, solo vale la última respuesta
    if (date) this.date.set(date);
    this.loading.set(true);
    this.error.set(null);
    this.request = this.api.productionByDay(date).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (d) => {
        this.loading.set(false);
        this.today.set(d.today);
        this.date.set(d.date);
        this.data.set(d);
      },
      error: (e) => {
        this.loading.set(false);
        this.error.set(e?.status === 0 ? 'Sin conexión con el servidor.' : (e?.error?.message ?? 'Error al cargar'));
      },
    });
  }

  move(days: number): void {
    const d = this.date();
    if (d) this.load(addDays(d, days));
  }

  /** Borrar la fecha en el calendario nativo no es escoger otra: vuelve la que estaba. */
  pick(input: HTMLInputElement): void {
    if (input.value) this.load(input.value);
    else input.value = this.date() ?? '';
  }

  isOpen(code: string): boolean {
    return this.open().has(code);
  }

  toggle(code: string): void {
    const next = new Set(this.open());
    if (!next.delete(code)) next.add(code);
    this.open.set(next);
  }
}
