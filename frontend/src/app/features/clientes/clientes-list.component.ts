import { Component, inject, signal } from '@angular/core';
import { ClientesApi } from '../../core/api/clientes.api';
import { Cliente } from '../../core/api/models/pedidos.models';
import { DrawerComponent } from '../../shared/ui/drawer/drawer.component';
import { ClienteFormComponent } from './cliente-form.component';

@Component({
  selector: 'app-clientes-list',
  standalone: true,
  imports: [DrawerComponent, ClienteFormComponent],
  template: `
    <div class="page">
      <div class="page-header">
        <div><div class="ph-title">Clientes</div></div>
        <div class="page-actions">
          <button class="btn btn-primary" type="button" (click)="abrir()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            Nuevo cliente
          </button>
        </div>
      </div>

      @if (cargando()) {
        <div class="card"><div class="card-body">Cargando clientes…</div></div>
      } @else if (clientes().length === 0) {
        <div class="card"><div class="card-body">
          <div class="empty">
            <span class="e-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0"/></svg></span>
            <h4>Sin clientes todavía</h4>
            <p>Creá el primer cliente para empezar a registrar pedidos.</p>
          </div>
        </div></div>
      } @else {
        <div class="card">
          <div class="table-scroll">
            <table class="data">
              <thead><tr><th>NIT</th><th>Nombre</th><th>Ciudad</th><th>Crédito</th><th>Cartera</th><th></th></tr></thead>
              <tbody>
                @for (c of clientes(); track c.id) {
                  <tr>
                    <td class="cell-mono">{{ c.nit }}</td>
                    <td>{{ c.nombre }}</td>
                    <td class="cell-sub">{{ c.ciudad || '—' }}</td>
                    <td>{{ c.tipoCredito }}</td>
                    <td><span class="badge badge-neutral"><span class="dot"></span>{{ c.estadoCartera }}</span></td>
                    <td style="text-align:right;white-space:nowrap">
                      <button class="btn btn-ghost btn-sm" type="button" (click)="editarCliente(c)">Editar</button>
                      <button class="btn btn-ghost btn-sm" type="button" (click)="desactivar(c)">Desactivar</button>
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
  desactivar(c: Cliente): void {
    this.api.desactivar(c.id).subscribe({ next: () => this.cargar() });
  }
  cerrar(): void { this.drawerAbierto.set(false); }
  onCreado(): void { this.cerrar(); this.cargar(); }
}
