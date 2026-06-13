import { Injectable, signal } from '@angular/core';

export type ToastTipo = 'exito' | 'error' | 'info';

export interface Toast {
  id: number;
  tipo: ToastTipo;
  mensaje: string;
}

/** Cuánto vive cada toast en pantalla antes de auto-descartarse. */
const DURACION_MS: Record<ToastTipo, number> = {
  exito: 4000,
  info: 5000,
  error: 7000,
};

@Injectable({ providedIn: 'root' })
export class ToastService {
  private seq = 0;
  readonly toasts = signal<Toast[]>([]);

  exito(mensaje: string): void {
    this.mostrar('exito', mensaje);
  }

  error(mensaje: string): void {
    this.mostrar('error', mensaje);
  }

  info(mensaje: string): void {
    this.mostrar('info', mensaje);
  }

  cerrar(id: number): void {
    this.toasts.update((ts) => ts.filter((t) => t.id !== id));
  }

  private mostrar(tipo: ToastTipo, mensaje: string): void {
    const id = ++this.seq;
    this.toasts.update((ts) => [...ts, { id, tipo, mensaje }]);
    setTimeout(() => this.cerrar(id), DURACION_MS[tipo]);
  }
}
