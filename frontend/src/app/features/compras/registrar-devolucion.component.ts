import { Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ComprasApi } from '../../core/api/compras.api';
import { OcpDetalle, OcpLinea } from '../../core/api/models/compras.models';

@Component({
  selector: 'app-registrar-devolucion',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  template: `
    <p class="cell-sub" style="margin-bottom:var(--sp-4)">
      Devolución al proveedor por calidad: descuenta el stock de materia prima y queda
      registrada en el kardex con su causa. No modifica lo recibido de la orden.
    </p>

    <label class="label">Causa <span style="color:var(--accent)">*</span></label>
    <input class="input" type="text" placeholder="lote con defectos, material errado…"
      [ngModel]="causa()" (ngModelChange)="causa.set($event)" />

    <div class="drawer-section-h" style="margin-top:var(--sp-4)">Cantidades a devolver</div>
    @for (l of recibidas(); track l.id) {
      <div class="linea">
        <div class="linea-info">
          <span class="cell-mono">{{ l.materialCodigo }}</span>
          <span class="cell-sub">{{ l.materialNombre }}</span>
          <span class="cell-sub">Recibido: {{ l.cantRecibida | number:'1.0-2' }} {{ l.unidad }}</span>
        </div>
        <input class="input num" type="number" min="0" step="any"
          [ngModel]="cantidades()[l.materialId] ?? 0" (ngModelChange)="setCantidad(l.materialId, $event)" />
      </div>
    }

    <label class="label" style="margin-top:var(--sp-4)">Observaciones (opcional)</label>
    <input class="input" type="text" [ngModel]="observaciones()" (ngModelChange)="observaciones.set($event)" />

    @if (error()) { <p style="color:var(--error);font-size:var(--text-sm);margin-top:var(--sp-3)">{{ error() }}</p> }

    <div class="drawer-foot">
      <button class="btn btn-primary btn-block" type="button" [class.is-loading]="enviando()"
        [disabled]="enviando()" (click)="registrar()">Registrar devolución</button>
    </div>
  `,
  styles: [`
    .linea{display:flex;align-items:center;justify-content:space-between;gap:var(--sp-3);padding:var(--sp-3) 0;border-bottom:var(--bw) solid var(--border)}
    .linea-info{display:flex;flex-direction:column;gap:2px}
    .label{display:block;font-size:var(--text-sm);color:var(--text-muted);margin-bottom:var(--sp-2)}
    .input{width:100%;padding:var(--sp-2) var(--sp-3);border:var(--bw) solid var(--border);border-radius:var(--r-sm);background:var(--surface);color:var(--text)}
    .input.num{width:110px;text-align:right;font-family:var(--font-mono)}
  `],
})
export class RegistrarDevolucionComponent {
  private readonly api = inject(ComprasApi);
  private readonly destroyRef = inject(DestroyRef);
  ocp = input.required<OcpDetalle>();
  done = output<void>();

  causa = signal('');
  cantidades = signal<Record<number, number>>({});
  observaciones = signal('');
  enviando = signal(false);
  error = signal('');

  recibidas = computed<OcpLinea[]>(() => this.ocp().lineas.filter((l) => l.cantRecibida > 0));

  setCantidad(materialId: number, valor: number): void {
    this.cantidades.update((c) => ({ ...c, [materialId]: Number(valor) }));
  }

  registrar(): void {
    if (this.enviando()) return;
    this.error.set('');
    if (!this.causa().trim()) {
      this.error.set('La causa de la devolución es obligatoria');
      return;
    }
    const lineas = this.recibidas()
      .map((l) => ({ materialId: l.materialId, cantidad: Number(this.cantidades()[l.materialId] ?? 0) }))
      .filter((l) => l.cantidad > 0);
    if (!lineas.length) {
      this.error.set('Ingresá al menos una cantidad a devolver');
      return;
    }
    this.enviando.set(true);
    this.api
      .registrarDevolucion(this.ocp().id, {
        causa: this.causa().trim(),
        lineas,
        observaciones: this.observaciones() || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => { this.enviando.set(false); this.done.emit(); },
        error: (e) => { this.enviando.set(false); this.error.set(this.msg(e)); },
      });
  }

  private msg(e: any): string {
    const m = e?.error?.message;
    return Array.isArray(m) ? m.join(' ') : (m ?? 'No se pudo registrar la devolución');
  }
}
