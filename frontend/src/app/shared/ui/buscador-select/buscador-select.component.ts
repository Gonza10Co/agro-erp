import { Component, computed, input, output, signal } from '@angular/core';

@Component({
  selector: 'app-buscador-select',
  standalone: true,
  template: `
    <div class="bsc">
      <input class="input bsc-input" type="text" [placeholder]="placeholder()" [value]="filtro()"
        (input)="onFiltro($event)" (focus)="abierto.set(true)" (keydown.enter)="elegirPrimero($event)" />
      @if (abierto() && filtrados().length) {
        <div class="bsc-list">
          @for (item of filtrados(); track $index) {
            <button type="button" class="bsc-opt" (click)="elegir(item)">
              <span class="bsc-main">{{ etiqueta()(item) }}</span>
              @if (sub(); as s) { <span class="bsc-sub">{{ s(item) }}</span> }
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .bsc{position:relative}
    .bsc-input{width:100%}
    .bsc-list{position:absolute;z-index:20;top:calc(100% + 4px);left:0;right:0;max-height:240px;overflow:auto;background:var(--surface);border:var(--bw) solid var(--border);border-radius:var(--r-md);box-shadow:var(--shadow-md,0 8px 24px rgba(0,0,0,.12));padding:var(--sp-1)}
    .bsc-opt{display:flex;align-items:center;justify-content:space-between;gap:var(--sp-3);width:100%;text-align:left;background:none;border:0;padding:var(--sp-2) var(--sp-3);border-radius:var(--r-sm);cursor:pointer;font-size:var(--text-sm);color:var(--text)}
    .bsc-opt:hover{background:var(--surface-hover)}
    .bsc-main{font-weight:var(--fw-medium)}
    .bsc-sub{font-family:var(--font-mono);font-size:var(--text-caption);color:var(--text-subtle)}
  `],
})
export class BuscadorSelectComponent<T> {
  items = input<T[]>([]);
  etiqueta = input.required<(item: T) => string>();
  sub = input<((item: T) => string) | null>(null);
  placeholder = input('Buscar…');
  seleccionar = output<T>();

  filtro = signal('');
  abierto = signal(false);

  filtrados = computed(() => {
    const f = this.filtro().trim().toLowerCase();
    const et = this.etiqueta();
    const sb = this.sub();
    if (!f) return this.items();
    return this.items().filter(
      (it) => et(it).toLowerCase().includes(f) || (sb ? sb(it).toLowerCase().includes(f) : false),
    );
  });

  onFiltro(e: Event) {
    this.filtro.set((e.target as HTMLInputElement).value);
    this.abierto.set(true);
  }
  elegir(item: T) {
    this.seleccionar.emit(item);
    this.filtro.set(this.etiqueta()(item));
    this.abierto.set(false);
  }
  elegirPrimero(e: Event) {
    e.preventDefault();
    const f = this.filtrados();
    if (f.length) this.elegir(f[0]);
  }
}
