import { Component, input } from '@angular/core';
import { NodoBom } from '../../../../core/api/models/catalogo.models';

@Component({
  selector: 'app-bom-arbol',
  standalone: true,
  template: `
    <ul class="arbol">
      @for (n of nodos(); track n.materialId) {
        <li>
          <div class="nodo">
            <span class="nombre">{{ n.nombre }}</span>
            @if (n.origen === 'FABRICADO') { <span class="badge badge-info">fabricado</span> }
            <span class="consumo">{{ n.consumo }} {{ n.unidad }}</span>
          </div>
          @if (n.hijos.length) { <app-bom-arbol [nodos]="n.hijos" /> }
        </li>
      }
    </ul>
  `,
  styles: [`
    .arbol{list-style:none;margin:0;padding-left:var(--sp-4)}
    .arbol .arbol{border-left:var(--bw) solid var(--border)}
    .nodo{display:flex;align-items:center;gap:var(--sp-2);padding:var(--sp-1) 0}
    .nombre{font-weight:var(--fw-medium)}
    .badge-info{font-size:var(--text-caption);padding:0 var(--sp-2);border-radius:var(--r-sm);background:var(--primary-subtle);color:var(--primary)}
    .consumo{margin-left:auto;font-family:var(--font-mono);font-size:var(--text-sm);color:var(--text-subtle)}
  `],
})
export class BomArbolComponent {
  nodos = input.required<NodoBom[]>();
}
