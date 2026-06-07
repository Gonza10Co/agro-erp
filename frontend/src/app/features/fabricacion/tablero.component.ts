import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FabricacionApi } from '../../core/api/fabricacion.api';
import { ParTablero, Celula, ORDEN_CELULAS, LABEL_CELULA } from '../../core/api/models/fabricacion.models';

@Component({
  selector: 'app-fabricacion-tablero',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="ph-title">Tablero de fabricación</div>
        <button class="btn" (click)="cargar()">Actualizar</button>
      </div>
      <div class="kanban">
        @for (c of columnas; track c) {
          <div class="col">
            <div class="col-h">
              <span>{{ label(c) }}</span>
              <span class="badge">{{ porCelula()[c].length }}</span>
            </div>
            <div class="col-body">
              @for (p of porCelula()[c]; track p.id) {
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
        <div class="col col-done">
          <div class="col-h"><span>Terminados</span><span class="badge badge-accent">{{ terminados().length }}</span></div>
          <div class="col-body">
            @for (p of terminados(); track p.id) {
              <a class="par-chip done" [routerLink]="['/fabricacion/par', p.codigo]">
                <span class="mono">{{ p.codigo }}</span><span class="cell-sub">T{{ p.talla.valor }}</span>
              </a>
            }
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .kanban{display:grid;grid-template-columns:repeat(6,1fr);gap:var(--sp-3);align-items:start}
    .col{background:var(--surface);border:var(--bw) solid var(--border);border-radius:var(--radius);min-height:120px}
    .col-h{display:flex;justify-content:space-between;align-items:center;padding:var(--sp-2) var(--sp-3);border-bottom:var(--bw) solid var(--border);font-weight:var(--fw-medium);font-size:var(--text-sm)}
    .col-body{padding:var(--sp-2);display:flex;flex-direction:column;gap:var(--sp-2)}
    .par-chip{display:flex;justify-content:space-between;gap:var(--sp-2);padding:var(--sp-2);border:var(--bw) solid var(--border);border-radius:var(--radius-sm);font-size:var(--text-caption);text-decoration:none;color:inherit}
    .par-chip:hover{border-color:var(--accent)}
    .par-chip.done{opacity:.7}
    .mono{font-family:var(--font-mono)}
    .empty-col{text-align:center;padding:var(--sp-2)}
  `],
})
export class FabricacionTableroComponent implements OnInit {
  private readonly api = inject(FabricacionApi);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly columnas: Celula[] = ORDEN_CELULAS;
  label = (c: Celula) => LABEL_CELULA[c];
  private pares = signal<ParTablero[]>([]);
  private ofId?: number;

  porCelula = computed(() => {
    const map: Record<Celula, ParTablero[]> = {
      CORTE: [], GUARNICION: [], ALMACEN: [], INYECCION: [], PT: [],
    };
    for (const p of this.pares()) {
      if (p.estado === 'EN_PROCESO') map[p.celulaActual].push(p);
    }
    return map;
  });
  terminados = computed(() => this.pares().filter((p) => p.estado === 'TERMINADO'));

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap.get('ofId');
    this.ofId = q ? Number(q) : undefined;
    this.cargar();
  }

  cargar(): void {
    this.api.tablero(this.ofId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe((p) => this.pares.set(p));
  }
}
