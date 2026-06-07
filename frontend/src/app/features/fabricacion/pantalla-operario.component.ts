import { Component, DestroyRef, ElementRef, OnInit, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FabricacionApi } from '../../core/api/fabricacion.api';
import {
  Celula, Operario, Maquina, ParDetalle, ORDEN_CELULAS, LABEL_CELULA, siguienteCelulaLabel,
} from '../../core/api/models/fabricacion.models';

@Component({
  selector: 'app-pantalla-operario',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="page">
      <div class="page-header"><div class="ph-title">Puesto de trabajo</div></div>

      <div class="card"><div class="card-body puesto">
        <label>Célula
          <select [(ngModel)]="celula" (ngModelChange)="onCelula()">
            @for (c of celulas; track c) { <option [value]="c">{{ label(c) }}</option> }
          </select>
        </label>
        <label>Operario
          <select [(ngModel)]="operarioId">
            @for (o of operarios(); track o.id) { <option [ngValue]="o.id">{{ o.nombre }}</option> }
          </select>
        </label>
        <label>Máquina
          <select [(ngModel)]="maquinaId">
            @for (m of maquinas(); track m.id) { <option [ngValue]="m.id">{{ m.nombre }}</option> }
          </select>
        </label>
      </div></div>

      <div class="card"><div class="card-body">
        <label class="scan-label">Escanear código del par
          <input #scan class="scan-input mono" [(ngModel)]="codigo"
                 (keyup.enter)="buscar()" placeholder="OF5-0001" autofocus />
        </label>
        @if (msg(); as m) { <div class="msg" [class.err]="esError()">{{ m }}</div> }

        @if (par(); as p) {
          <div class="par-card">
            <div class="mono big">{{ p.codigo }}</div>
            <div class="cell-sub">OF-{{ p.of.consecutivo }} · Talla {{ p.talla.valor }} · en {{ label(p.celulaActual) }}</div>
            @if (p.estado === 'TERMINADO') {
              <span class="badge badge-accent">ya terminado</span>
            } @else if (siguiente(p)) {
              <button class="btn btn-primary" (click)="avanzar(p)">Avanzar a {{ siguiente(p) }} →</button>
            } @else {
              <button class="btn btn-primary" (click)="avanzar(p)">Terminar (cargar a PT) ✓</button>
            }
          </div>
        }
      </div></div>
    </div>
  `,
  styles: [`
    .puesto{display:flex;gap:var(--sp-4);flex-wrap:wrap}
    .puesto label,.scan-label{display:flex;flex-direction:column;gap:var(--sp-1);font-size:var(--text-caption);color:var(--text-subtle)}
    select,.scan-input{padding:var(--sp-2);border:var(--bw) solid var(--border);border-radius:var(--radius-sm);font-size:var(--text-sm)}
    .scan-input{font-size:var(--text-lg);max-width:280px}
    .msg{margin-top:var(--sp-3);color:var(--accent)}
    .msg.err{color:var(--danger)}
    .par-card{margin-top:var(--sp-4);display:flex;flex-direction:column;gap:var(--sp-2);align-items:flex-start}
    .big{font-size:var(--text-xl)}
    .mono{font-family:var(--font-mono)}
  `],
})
export class PantallaOperarioComponent implements OnInit {
  @ViewChild('scan') private scanInput!: ElementRef<HTMLInputElement>;
  private readonly api = inject(FabricacionApi);
  private readonly destroyRef = inject(DestroyRef);

  readonly celulas: Celula[] = ORDEN_CELULAS;
  label = (c: Celula) => LABEL_CELULA[c];
  siguiente = (p: ParDetalle) => siguienteCelulaLabel(p.celulaActual);

  celula: Celula = 'CORTE';
  operarioId?: number;
  maquinaId?: number;
  codigo = '';
  operarios = signal<Operario[]>([]);
  maquinas = signal<Maquina[]>([]);
  par = signal<ParDetalle | null>(null);
  msg = signal<string | null>(null);
  esError = signal(false);

  ngOnInit(): void {
    this.onCelula();
  }

  onCelula(): void {
    this.api.operarios(this.celula).pipe(takeUntilDestroyed(this.destroyRef)).subscribe((o) => {
      this.operarios.set(o);
      this.operarioId = o[0]?.id;
    });
    this.api.maquinas(this.celula).pipe(takeUntilDestroyed(this.destroyRef)).subscribe((m) => {
      this.maquinas.set(m);
      this.maquinaId = m[0]?.id;
    });
  }

  buscar(): void {
    const c = this.codigo.trim();
    if (!c) return;
    this.par.set(null);
    this.msg.set(null);
    this.api.par(c).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (p) => this.par.set(p),
      error: () => { this.esError.set(true); this.msg.set(`Par ${c} no encontrado`); },
    });
  }

  avanzar(p: ParDetalle): void {
    if (this.operarioId == null || this.maquinaId == null) {
      this.esError.set(true);
      this.msg.set('Seleccioná operario y máquina');
      return;
    }
    this.api.avanzar(p.codigo, this.operarioId, this.maquinaId)
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: () => {
          this.esError.set(false);
          this.msg.set(`Par ${p.codigo} avanzado ✓`);
          this.par.set(null);
          this.codigo = '';
          setTimeout(() => this.scanInput?.nativeElement.focus(), 0);
        },
        error: (e) => {
          this.esError.set(true);
          this.msg.set(e?.error?.message ?? 'No se pudo avanzar el par');
        },
      });
  }
}
