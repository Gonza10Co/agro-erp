import { Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientesApi } from '../../core/api/clientes.api';
import { SedeCliente } from '../../core/api/models/pedidos.models';

/**
 * Sedes de entrega de un cliente. Un cliente puede tener bodega en varias ciudades;
 * la principal es a dónde se despachan sus pedidos si nadie elige otra.
 */
@Component({
  selector: 'app-sedes-cliente',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="field">
      <label class="label">Sedes de entrega</label>

      @if (cargando()) {
        <p class="hint">Cargando sedes…</p>
      } @else if (sedes().length === 0) {
        <p class="hint">Sin sedes. La primera que agregues queda como principal.</p>
      } @else {
        <div class="table-scroll">
          <table class="data">
            <thead><tr><th>Sede</th><th>Ciudad</th><th>Dirección</th><th>Teléfono</th><th></th></tr></thead>
            <tbody>
              @for (s of sedes(); track s.id) {
                <tr>
                  <td>
                    {{ s.nombre }}
                    @if (s.esPrincipal) { <span class="badge badge-neutral"><span class="dot"></span>Principal</span> }
                  </td>
                  <td class="cell-sub">{{ s.ciudad }}</td>
                  <td class="cell-sub">{{ s.direccion }}</td>
                  <td class="cell-sub">{{ s.telefono || '—' }}</td>
                  <td style="text-align:right;white-space:nowrap">
                    @if (!s.esPrincipal) {
                      <button class="btn btn-ghost btn-sm" type="button" (click)="marcarPrincipal(s)">Hacer principal</button>
                      <button class="btn btn-ghost btn-sm" type="button" (click)="quitar(s)">Quitar</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      @if (agregando()) {
        <div class="sede-form">
          <input class="input" name="sedeNombre" placeholder="Nombre (ej. Bodega Norte)" [(ngModel)]="nombre" autocomplete="off" />
          <input class="input" name="sedeCiudad" placeholder="Ciudad" [(ngModel)]="ciudad" autocomplete="off" />
          <input class="input" name="sedeDireccion" placeholder="Dirección" [(ngModel)]="direccion" autocomplete="off" />
          <input class="input" name="sedeTelefono" placeholder="Teléfono (opcional)" [(ngModel)]="telefono" autocomplete="off" />
          <div class="sede-acciones">
            <button class="btn btn-primary btn-sm" type="button" [disabled]="guardando()" (click)="agregar()">Agregar</button>
            <button class="btn btn-ghost btn-sm" type="button" (click)="cancelar()">Cancelar</button>
          </div>
        </div>
      } @else {
        <button class="btn btn-ghost btn-sm" type="button" (click)="agregando.set(true)">+ Agregar sede</button>
      }

      @if (error()) { <p class="err">{{ error() }}</p> }
    </div>
  `,
  styles: [`
    .hint { color: var(--text-muted); font-size: var(--text-xs); margin: 0 0 var(--sp-2); }
    .err { color: var(--error); font-size: var(--text-sm); margin-top: var(--sp-2); }
    .sede-form { display: grid; gap: var(--sp-2); margin-top: var(--sp-2); }
    .sede-acciones { display: flex; gap: var(--sp-2); }
  `],
})
export class SedesClienteComponent {
  private readonly api = inject(ClientesApi);
  clienteId = input.required<number>();

  sedes = signal<SedeCliente[]>([]);
  cargando = signal(false);
  guardando = signal(false);
  agregando = signal(false);
  error = signal('');

  nombre = '';
  ciudad = '';
  direccion = '';
  telefono = '';

  constructor() {
    effect(() => {
      const id = this.clienteId();
      if (id) this.cargar(id);
    });
  }

  private cargar(clienteId: number): void {
    this.cargando.set(true);
    this.api.listarSedes(clienteId).subscribe({
      next: (s) => { this.sedes.set(s.filter((x) => x.activo)); this.cargando.set(false); },
      error: () => { this.cargando.set(false); this.error.set('No se pudieron cargar las sedes'); },
    });
  }

  agregar(): void {
    if (!this.nombre.trim() || !this.ciudad.trim() || !this.direccion.trim()) {
      this.error.set('Nombre, ciudad y dirección son obligatorios');
      return;
    }
    if (this.guardando()) return;
    this.error.set('');
    this.guardando.set(true);
    this.api
      .crearSede(this.clienteId(), {
        nombre: this.nombre.trim(),
        ciudad: this.ciudad.trim(),
        direccion: this.direccion.trim(),
        telefono: this.telefono.trim() || undefined,
      })
      .subscribe({
        next: () => { this.guardando.set(false); this.cancelar(); this.cargar(this.clienteId()); },
        error: (e) => { this.guardando.set(false); this.error.set(e?.error?.message ?? 'No se pudo crear la sede'); },
      });
  }

  marcarPrincipal(sede: SedeCliente): void {
    this.error.set('');
    this.api.actualizarSede(this.clienteId(), sede.id, { esPrincipal: true }).subscribe({
      next: () => this.cargar(this.clienteId()),
      error: (e) => this.error.set(e?.error?.message ?? 'No se pudo marcar como principal'),
    });
  }

  quitar(sede: SedeCliente): void {
    this.error.set('');
    this.api.desactivarSede(this.clienteId(), sede.id).subscribe({
      next: () => this.cargar(this.clienteId()),
      error: (e) => this.error.set(e?.error?.message ?? 'No se pudo quitar la sede'),
    });
  }

  cancelar(): void {
    this.agregando.set(false);
    this.nombre = this.ciudad = this.direccion = this.telefono = '';
    this.error.set('');
  }
}
