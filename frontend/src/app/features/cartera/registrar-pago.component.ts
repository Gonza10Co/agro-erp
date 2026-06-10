import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CarteraApi } from '../../core/api/cartera.api';
import { CarteraItem } from '../../core/api/models/pedidos.models';

@Component({
  selector: 'app-registrar-pago',
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
    <div class="kv-list">
      <div class="kv"><span class="k">Factura</span><span class="v cell-mono">FAC-{{ factura().consecutivo }}</span></div>
      <div class="kv"><span class="k">Cliente</span><span class="v">{{ factura().cliente.nombre }}</span></div>
      <div class="kv"><span class="k">Vence</span><span class="v">{{ factura().fechaVencimiento ? (factura().fechaVencimiento | date:'dd/MM/yyyy') : '—' }}</span></div>
      <div class="kv"><span class="k">Total</span><span class="v cell-mono">{{ moneda(factura().total) }}</span></div>
      <div class="kv"><span class="k">Pagado</span><span class="v cell-mono">{{ moneda(factura().pagado) }}</span></div>
      <div class="kv" style="font-weight:var(--fw-semibold)"><span class="k">Saldo</span><span class="v cell-mono">{{ moneda(factura().saldo) }}</span></div>
    </div>

    <div class="drawer-section-h">Registrar pago</div>
    <label class="label">Monto (COP) <span style="color:var(--accent)">*</span></label>
    <input class="input" type="number" min="0" step="1000" [max]="factura().saldo"
      [ngModel]="monto()" (ngModelChange)="monto.set($event)" />
    <button class="btn btn-ghost btn-sm" type="button" style="margin-top:var(--sp-2)" (click)="monto.set(factura().saldo)">Saldar total ({{ moneda(factura().saldo) }})</button>

    <label class="label" style="margin-top:var(--sp-4)">Medio (opcional)</label>
    <input class="input" type="text" placeholder="transferencia, efectivo…" [ngModel]="medio()" (ngModelChange)="medio.set($event)" />

    @if (error()) { <p style="color:var(--error);font-size:var(--text-sm);margin-top:var(--sp-3)">{{ error() }}</p> }

    <div class="drawer-foot">
      <button class="btn btn-primary btn-block" type="button" [class.is-loading]="enviando()" [disabled]="enviando() || !montoValido()" (click)="registrar()">Registrar pago</button>
    </div>
  `,
  styles: [`
    .label{display:block;font-size:var(--text-sm);color:var(--text-muted);margin-bottom:var(--sp-2)}
    .input{width:100%;padding:var(--sp-2) var(--sp-3);border:var(--bw) solid var(--border);border-radius:var(--r-sm);background:var(--surface);color:var(--text)}
  `],
})
export class RegistrarPagoComponent {
  private readonly api = inject(CarteraApi);
  private readonly destroyRef = inject(DestroyRef);
  factura = input.required<CarteraItem>();
  paid = output<void>();

  monto = signal(0);
  medio = signal('');
  enviando = signal(false);
  error = signal('');

  constructor() {
    queueMicrotask(() => this.monto.set(this.factura().saldo));
  }

  montoValido(): boolean {
    const m = Number(this.monto());
    return m > 0 && m <= this.factura().saldo;
  }

  registrar(): void {
    if (this.enviando() || !this.montoValido()) return;
    this.enviando.set(true); this.error.set('');
    this.api.registrarPago({ facturaId: this.factura().facturaId, monto: Number(this.monto()), medio: this.medio() || undefined })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => { this.enviando.set(false); this.paid.emit(); },
        error: (e) => { this.enviando.set(false); this.error.set(this.msg(e)); },
      });
  }

  moneda(n: number): string { return '$' + Math.round(n).toLocaleString('es-CO'); }

  private msg(e: any): string {
    const m = e?.error?.message;
    return Array.isArray(m) ? m.join(' ') : (m ?? 'No se pudo registrar el pago');
  }
}
