import { Injectable, NgZone, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { FabricacionApi } from '../api/fabricacion.api';
import { AvanceResultado } from '../api/models/fabricacion.models';
import { ToastService } from '../notificaciones/toast.service';
import { leerConfig } from '../../features/fabricacion/config-estacion';
import { DetectorPistola } from './detector-pistola';
import { sonar } from './sonido-pistola';

/**
 * La pistola funciona desde CUALQUIER pantalla de la app (no solo la de estación):
 * escucha el teclado, reconoce la ráfaga de un código de par y lo registra con la
 * estación configurada en esta tablet. El resultado sale como aviso:
 * verde = registrado, amarillo = repetido o con estación saltada, rojo (fijo, hasta
 * tocarlo) = no quedó.
 *
 * No actúa en la pantalla de estación (ella tiene su propio flujo, con calidad)
 * ni cuando el foco está en un campo de texto (ahí la pistola escribe normal).
 */
@Injectable({ providedIn: 'root' })
export class PistolaGlobalService {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly api = inject(FabricacionApi);
  private readonly toast = inject(ToastService);
  private readonly zone = inject(NgZone);
  private readonly detector = new DetectorPistola();
  private iniciado = false;

  iniciar(doc: Document = document): void {
    if (this.iniciado) return;
    this.iniciado = true;
    this.zone.runOutsideAngular(() => doc.addEventListener('keydown', (ev) => this.alTeclear(ev, doc), true));
  }

  /** Expuesto para las pruebas. */
  alTeclear(ev: KeyboardEvent, doc: Document = document): void {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (this.router.url.startsWith('/fabricacion/estacion')) return;
    if (!this.auth.isAuthenticated()) return;
    const activo = doc.activeElement as HTMLElement | null;
    if (activo && (['INPUT', 'TEXTAREA', 'SELECT'].includes(activo.tagName) || activo.isContentEditable)) return;
    const cod = this.detector.tecla(ev.key, ev.timeStamp);
    if (!cod) return;
    ev.preventDefault(); // que el Enter final no "clique" el botón enfocado
    this.zone.run(() => this.registrar(cod));
  }

  registrar(cod: string): void {
    const c = leerConfig();
    if (!c) {
      sonar('error');
      this.toast.mostrar('error', `${cod}: esta tablet no tiene estación`, {
        detalle: 'Configúrala una vez en Fabricación → Estación.',
        fijo: true,
        grande: true,
      });
      return;
    }
    this.api.avanzar(cod, c.operarioId, c.maquinaId, c.estacion, undefined, true).subscribe({
      next: (r) => {
        // Entró, pero se saltó alguna estación: quedó anotado y alguien debe mirarlo.
        const saltadas = r.avance.saltadas ?? [];
        if (saltadas.length) {
          sonar('alerta');
          this.toast.mostrar('alerta', titulo(r), {
            detalle: `Sin pistolazo en ${saltadas.map((x) => x.nombre).join(', ')} · ${detalle(r)}`,
            grande: true,
          });
          return;
        }
        sonar('ok');
        this.toast.mostrar('exito', titulo(r), { detalle: detalle(r), grande: true });
      },
      error: (e: HttpErrorResponse) => {
        const cuerpo = e?.error as { message?: string | string[]; motivo?: string } | null;
        const msg = Array.isArray(cuerpo?.message) ? cuerpo!.message.join(', ') : cuerpo?.message;
        if (e?.status === 409 && cuerpo?.motivo === 'REPETIDO') {
          sonar('alerta');
          this.toast.mostrar('alerta', `${cod} ya estaba registrado`, { detalle: msg, grande: true });
          return;
        }
        sonar('error');
        this.toast.mostrar('error', `${cod} NO quedó registrado`, {
          detalle: e?.status === 0 ? 'Sin conexión con el servidor. Revisa el wifi y vuelve a disparar.' : msg || 'Vuelve a disparar.',
          fijo: true,
          grande: true,
        });
      },
    });
  }
}

function titulo(r: AvanceResultado): string {
  const a = r.avance;
  if (a.nacio) return `${r.codigo} nació en ${a.nombre}`;
  if (a.terminado) return `${r.codigo} terminado ✓`;
  return `${r.codigo} → ${a.nombre}`;
}

function detalle(r: AvanceResultado): string {
  const a = r.avance;
  const partes: string[] = [];
  if (a.calidad === 'SEGUNDA') partes.push('SEGUNDA');
  if (a.terminado) partes.push('Cargado a producto terminado');
  partes.push(`van ${a.hoy} hoy`);
  return partes.join(' · ');
}
