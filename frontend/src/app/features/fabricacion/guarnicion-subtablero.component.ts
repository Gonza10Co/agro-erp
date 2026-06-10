import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FabricacionApi } from '../../core/api/fabricacion.api';
import { ParTablero, SubPasoGuarnicion, ORDEN_SUBPASOS, LABEL_SUBPASO } from '../../core/api/models/fabricacion.models';

@Component({
  selector: 'app-guarnicion-subtablero',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="ph-title">Guarnición · sub-pasos</div>
        <button class="btn" (click)="cargar()">Actualizar</button>
      </div>
      @if (error()) {
        <div class="empty"><h4>No se pudo cargar el sub-tablero</h4><p class="cell-sub">{{ error() }}</p></div>
      }
      <div class="kanban">
        @for (s of subPasos; track s) {
          <div class="col">
            <div class="col-h">
              <span>{{ subLabel(s) }}</span>
              <span class="badge">{{ porSubPaso()[s].length }}</span>
            </div>
            <div class="col-body">
              @for (p of porSubPaso()[s]; track p.id) {
                <a class="par-chip" [routerLink]="['/fabricacion/par', p.codigo]">
                  <span class="mono">{{ p.codigo }}</span>
                  <span class="cell-sub">T{{ p.talla.valor }}</span>
                </a>
              } @empty {
                <div class="cell-sub empty-col">—</div>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .kanban{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:var(--sp-3);align-items:start}
    .col{background:var(--surface);border:var(--bw) solid var(--border);border-radius:var(--radius);min-height:120px}
    .col-h{display:flex;justify-content:space-between;align-items:center;padding:var(--sp-2) var(--sp-3);border-bottom:var(--bw) solid var(--border);font-weight:var(--fw-medium);font-size:var(--text-sm)}
    .col-body{padding:var(--sp-2);display:flex;flex-direction:column;gap:var(--sp-2)}
    .par-chip{display:flex;justify-content:space-between;gap:var(--sp-2);padding:var(--sp-2);border:var(--bw) solid var(--border);border-radius:var(--radius-sm);font-size:var(--text-caption);text-decoration:none;color:inherit}
    .par-chip:hover{border-color:var(--accent)}
    .mono{font-family:var(--font-mono)}
    .empty-col{text-align:center;padding:var(--sp-2)}
  `],
})
export class GuarnicionSubtableroComponent implements OnInit {
  private readonly api = inject(FabricacionApi);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly subPasos = ORDEN_SUBPASOS;
  subLabel = (s: SubPasoGuarnicion) => LABEL_SUBPASO[s];
  private pares = signal<ParTablero[]>([]);
  error = signal<string | null>(null);
  protected ofId?: number;

  porSubPaso = computed(() => {
    const map = Object.fromEntries(ORDEN_SUBPASOS.map((s) => [s, []])) as unknown as Record<SubPasoGuarnicion, ParTablero[]>;
    for (const p of this.pares()) {
      if (p.celulaActual === 'GUARNICION' && p.subPasoActual) map[p.subPasoActual].push(p);
    }
    return map;
  });

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap.get('ofId');
    this.ofId = q ? Number(q) : undefined;
    this.cargar();
  }

  cargar(): void {
    this.error.set(null);
    this.api.tablero(this.ofId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (p) => this.pares.set(p),
      error: () => this.error.set('No se pudo cargar el sub-tablero. Intentá de nuevo.'),
    });
  }
}
