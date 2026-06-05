import { Component, computed, input, output } from '@angular/core';
import { Talla } from '../../../core/api/models/pedidos.models';
import { totalCurva } from './curva.util';

@Component({
  selector: 'app-talla-grid',
  standalone: true,
  template: `
    <div class="tg">
      @for (t of tallas(); track t.id) {
        <label class="tg-cell">
          <span class="tg-talla">{{ t.valor }}</span>
          <input type="number" min="0" step="1" class="tg-input" [value]="valores()[t.id] || ''" (input)="onInput(t.id, $event)" />
        </label>
      }
    </div>
    <div class="tg-total">Total: <b>{{ total() }}</b> pares</div>
  `,
  styles: [`
    .tg{display:flex;flex-wrap:wrap;gap:var(--sp-2)}
    .tg-cell{display:flex;flex-direction:column;align-items:center;gap:4px}
    .tg-talla{font-family:var(--font-mono);font-size:var(--text-caption);color:var(--text-muted)}
    .tg-input{width:52px;text-align:center;padding:var(--sp-2);border:var(--bw) solid var(--border);border-radius:var(--r-sm);background:var(--surface);color:var(--text);font-family:var(--font-mono);appearance:textfield;-moz-appearance:textfield}
    .tg-input::-webkit-outer-spin-button,.tg-input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
    .tg-input:focus{outline:none;border-color:var(--border-interactive);box-shadow:var(--focus-ring-shadow)}
    .tg-total{margin-top:var(--sp-3);font-size:var(--text-sm);color:var(--text-muted)}
    .tg-total b{color:var(--text);font-family:var(--font-mono)}
  `],
})
export class TallaGridComponent {
  tallas = input<Talla[]>([]);
  valores = input<Record<number, number>>({});
  cambio = output<Record<number, number>>();

  total = computed(() => totalCurva(this.valores()));

  onInput(tallaId: number, e: Event) {
    const n = Math.max(0, Math.trunc(Number((e.target as HTMLInputElement).value) || 0));
    this.cambio.emit({ ...this.valores(), [tallaId]: n });
  }
}
