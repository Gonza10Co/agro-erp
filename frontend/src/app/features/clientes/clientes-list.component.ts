import { Component, computed, inject, signal } from '@angular/core';
import { ClientesApi } from '../../core/api/clientes.api';
import { Cliente } from '../../core/api/models/pedidos.models';
import { DrawerComponent } from '../../shared/ui/drawer/drawer.component';
import { ConfirmarAccionComponent } from '../../shared/ui/confirmar-accion/confirmar-accion.component';
import { ClienteFormComponent } from './cliente-form.component';

@Component({
  selector: 'app-clientes-list',
  standalone: true,
  imports: [DrawerComponent, ClienteFormComponent, ConfirmarAccionComponent],
  template: `
    <div class="page">
      <div class="page-header">
        <div><div class="ph-title">Clientes</div></div>
        <div class="page-actions">
          <label class="check">
            <input type="checkbox" [checked]="mostrarInactivos()" (change)="mostrarInactivos.set(!mostrarInactivos())" />
            <span class="box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5L20 7"/></svg></span>
            Mostrar inactivos
          </label>
          <button class="btn btn-primary" type="button" (click)="abrir()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            Nuevo cliente
          </button>
        </div>
      </div>

      @if (cargando()) {
        <div class="card"><div class="card-body">Cargando clientes…</div></div>
      } @else if (visibles().length === 0) {
        <div class="card"><div class="card-body">
          <div class="empty">
            <span class="e-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0"/></svg></span>
            <h4>Sin clientes todavía</h4>
            <p>Crea el primer cliente para empezar a registrar pedidos.</p>
          </div>
        </div></div>
      } @else {
        <div class="card">
          <div class="table-scroll">
            <table class="data">
              <thead><tr><th>NIT</th><th>Nombre</th><th>Ciudad</th><th>Crédito</th><th>Cartera</th><th></th></tr></thead>
              <tbody>
                @for (c of visibles(); track c.id) {
                  <tr [class.is-inactive]="!c.activo">
                    <td class="cell-mono">{{ c.nit }}</td>
                    <td>
                      {{ c.nombre }}
                      @if (!c.activo) { <span class="badge badge-neutral" style="margin-left:var(--sp-2)"><span class="dot"></span>Inactivo</span> }
                    </td>
                    <td class="cell-sub">{{ c.ciudad || '—' }}</td>
                    <td>{{ c.tipoCredito }}</td>
                    <td><span class="badge badge-neutral"><span class="dot"></span>{{ c.estadoCartera }}</span></td>
                    <td class="cell-actions" style="text-align:right;white-space:nowrap">
                      <button class="btn btn-ghost btn-sm" type="button" (click)="editarCliente(c)">Editar</button>
                      @if (c.activo) {
                        <app-confirmar-accion
                          [abierto]="confirmandoId() === c.id"
                          [pregunta]="'¿Desactivar ' + c.nombre + '?'"
                          (pedir)="confirmandoId.set(c.id)"
                          (cancelar)="confirmandoId.set(null)"
                          (confirmar)="desactivar(c)" />
                      } @else {
                        <button class="btn btn-ghost btn-sm" type="button" (click)="reactivar(c)">Reactivar</button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </div>

    <app-drawer [open]="drawerAbierto()" [title]="editando() ? 'Editar cliente' : 'Nuevo cliente'" (closed)="cerrar()">
      <app-cliente-form [editar]="editando()" (created)="onCreado()" />
    </app-drawer>
  `,
})
export class ClientesListComponent {
  private readonly api = inject(ClientesApi);
  clientes = signal<Cliente[]>([]);
  cargando = signal(true);
  drawerAbierto = signal(false);
  editando = signal<Cliente | null>(null);
  /**
   * El GET /clientes ya trae activos e inactivos (otros consumidores dependen de
   * eso), así que el filtro es local: por defecto se ocultan los inactivos.
   */
  mostrarInactivos = signal(false);
  visibles = computed(() =>
    this.mostrarInactivos() ? this.clientes() : this.clientes().filter((c) => c.activo !== false),
  );
  /** Fila que está pidiendo "¿Desactivar…?" (una a la vez). */
  confirmandoId = signal<number | null>(null);

  constructor() {
    this.cargar();
  }

  cargar(): void {
    this.cargando.set(true);
    this.api.listar().subscribe({
      next: (cs) => { this.clientes.set(cs); this.cargando.set(false); },
      error: () => this.cargando.set(false),
    });
  }

  abrir(): void { this.editando.set(null); this.drawerAbierto.set(true); }
  editarCliente(c: Cliente): void { this.editando.set(c); this.drawerAbierto.set(true); }
  /** Solo se llama desde "Sí, desactivar": el primer clic únicamente abre la confirmación. */
  desactivar(c: Cliente): void {
    this.confirmandoId.set(null);
    this.api.desactivar(c.id).subscribe({ next: () => this.cargar() });
  }
  reactivar(c: Cliente): void {
    this.api.reactivar(c.id).subscribe({ next: () => this.cargar() });
  }
  cerrar(): void { this.drawerAbierto.set(false); }
  onCreado(): void { this.cerrar(); this.cargar(); }
}
