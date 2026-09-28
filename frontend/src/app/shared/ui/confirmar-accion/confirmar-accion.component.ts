import { Component, input, output } from '@angular/core';

/**
 * Botón de acción destructiva con confirmación EN LÍNEA (sin window.confirm, que
 * bloquea la automatización del navegador).
 *
 * Es presentacional: el padre guarda en un signal cuál fila está confirmando
 * (así solo una a la vez queda abierta) y decide qué hacer con cada evento.
 *
 *   cerrado:  [Desactivar]
 *   abierto:  ¿Desactivar 101?  [Sí, desactivar]  [Cancelar]
 *
 * Nace de un caso real: una usuaria nueva desactivó la referencia 101 con un clic
 * sin querer y no había cómo deshacerlo desde la app.
 */
@Component({
  selector: 'app-confirmar-accion',
  standalone: true,
  template: `
    @if (abierto()) {
      <span class="confirmar" role="group" [attr.aria-label]="pregunta()">
        <span class="pregunta">{{ pregunta() }}</span>
        <button class="btn btn-danger btn-sm" type="button" data-accion="confirmar" (click)="confirmar.emit()">{{ textoConfirmar() }}</button>
        <button class="btn btn-secondary btn-sm" type="button" data-accion="cancelar" (click)="cancelar.emit()">Cancelar</button>
      </span>
    } @else if (compacto()) {
      <button class="icon-btn" type="button" data-accion="pedir" [title]="etiqueta()" [attr.aria-label]="etiqueta()"
              style="width:18px;height:18px" (click)="pedir.emit()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    } @else {
      <button class="btn btn-ghost btn-sm" type="button" data-accion="pedir" (click)="pedir.emit()">{{ etiqueta() }}</button>
    }
  `,
  styles: [`
    :host{display:inline-flex}
    .confirmar{display:inline-flex;align-items:center;gap:var(--sp-2);white-space:nowrap}
    .pregunta{font-size:var(--text-sm);color:var(--error);font-weight:var(--fw-medium)}
  `],
})
export class ConfirmarAccionComponent {
  /** true = la fila está en modo "¿seguro?". */
  abierto = input(false);
  /** Texto del botón que abre la confirmación. */
  etiqueta = input('Desactivar');
  /** Pregunta en línea, p. ej. "¿Desactivar 101?". */
  pregunta = input('¿Desactivar?');
  textoConfirmar = input('Sí, desactivar');
  /** Disparador como ícono (X) en lugar de botón con texto (chips de opciones). */
  compacto = input(false);

  pedir = output<void>();
  confirmar = output<void>();
  cancelar = output<void>();
}
