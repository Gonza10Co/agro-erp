import { Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ComprasApi } from '../../core/api/compras.api';
import { OcpDetalle, OcpLinea } from '../../core/api/models/compras.models';

@Component({
  selector: 'app-registrar-recepcion',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  template: `
    <p class="cell-sub" style="margin-bottom:var(--sp-4)">
      Registrá lo que llegó del proveedor. Lo que no llegue queda pendiente (backorder)
      y se recibe en una próxima entrega.
    </p>

    @for (l of pendientes(); track l.id) {
      <div class="linea">
        <div class="linea-info">
          <span class="cell-mono">{{ l.materialCodigo }}</span>
          <span class="cell-sub">{{ l.materialNombre }}</span>
          <span class="cell-sub">Pendiente: {{ l.pendiente | number:'1.0-2' }} {{ l.unidad }}</span>
        </div>
        <input class="input num" type="number" min="0" [max]="l.pendiente" step="any"
          [ngModel]="cantidades()[l.id] ?? l.pendiente" (ngModelChange)="setCantidad(l.id, $event)" />
      </div>
    }

    <label class="label" style="margin-top:var(--sp-4)">Observaciones (opcional)</label>
    <input class="input" type="text" placeholder="remisión, transportadora…"
      [ngModel]="observaciones()" (ngModelChange)="observaciones.set($event)" />

    @if (error()) { <p style="color:var(--error);font-size:var(--text-sm);margin-top:var(--sp-3)">{{ error() }}</p> }

    <div class="drawer-foot">
      <button class="btn btn-primary btn-block" type="button" [class.is-loading]="enviando()"
        [disabled]="enviando()" (click)="registrar()">Registrar recepción</button>
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
export class RegistrarRecepcionComponent {
  private readonly api = inject(ComprasApi);
  private readonly destroyRef = inject(DestroyRef);
  ocp = input.required<OcpDetalle>();
  done = output<void>();

  cantidades = signal<Record<number, number>>({});
  observaciones = signal('');
  enviando = signal(false);
  error = signal('');

  pendientes = computed<OcpLinea[]>(() => this.ocp().lineas.filter((l) => l.pendiente > 0));

  setCantidad(lineaId: number, valor: number): void {
    this.cantidades.update((c) => ({ ...c, [lineaId]: Number(valor) }));
  }

  registrar(): void {
    if (this.enviando()) return;
    this.error.set('');
    // Sin tocar nada, el default es "llegó todo lo pendiente" (el caso común).
    const lineas = this.pendientes()
      .map((l) => ({ ocpLineaId: l.id, cantidad: Number(this.cantidades()[l.id] ?? l.pendiente) }))
      .filter((l) => l.cantidad > 0);
    if (!lineas.length) {
      this.error.set('Ingresá al menos una cantidad recibida');
      return;
    }
    for (const l of lineas) {
      const linea = this.pendientes().find((p) => p.id === l.ocpLineaId)!;
      if (l.cantidad > linea.pendiente) {
        this.error.set(`${linea.materialCodigo}: la cantidad supera lo pendiente (${linea.pendiente})`);
        return;
      }
    }
    this.enviando.set(true);
    this.api
      .registrarRecepcion(this.ocp().id, { lineas, observaciones: this.observaciones() || undefined })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => { this.enviando.set(false); this.done.emit(); },
        error: (e) => { this.enviando.set(false); this.error.set(this.msg(e)); },
      });
  }

  private msg(e: any): string {
    const m = e?.error?.message;
    return Array.isArray(m) ? m.join(' ') : (m ?? 'No se pudo registrar la recepción');
  }
}
