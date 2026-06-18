import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProveedoresApi, Proveedor } from '../../core/api/proveedores.api';
import { DrawerComponent } from '../../shared/ui/drawer/drawer.component';

@Component({
  selector: 'app-proveedores-list',
  standalone: true,
  imports: [DrawerComponent, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div><div class="ph-title">Proveedores</div></div>
        <div class="page-actions">
          <button class="btn btn-primary" type="button" (click)="abrirNuevo()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            Nuevo proveedor
          </button>
        </div>
      </div>

      @if (cargando()) {
        <div class="card"><div class="card-body">Cargando proveedores…</div></div>
      } @else if (proveedores().length === 0) {
        <div class="card"><div class="card-body">
          <div class="empty">
            <span class="e-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0"/></svg></span>
            <h4>Sin proveedores todavía</h4>
            <p>Creá el primer proveedor para empezar a registrar compras.</p>
          </div>
        </div></div>
      } @else {
        <div class="card">
          <div class="table-scroll">
            <table class="data">
              <thead><tr><th>NIT</th><th>Nombre</th><th>Ciudad</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                @for (p of proveedores(); track p.id) {
                  <tr>
                    <td class="cell-mono">{{ p.nit }}</td>
                    <td>{{ p.nombre }}</td>
                    <td class="cell-sub">{{ p.ciudad || '—' }}</td>
                    <td>
                      @if (p.activo) {
                        <span class="badge badge-ok"><span class="dot"></span>Activo</span>
                      } @else {
                        <span class="badge badge-neutral"><span class="dot"></span>Inactivo</span>
                      }
                    </td>
                    <td class="cell-actions">
                      <button class="btn btn-ghost btn-sm" type="button" (click)="abrirEditar(p)">Editar</button>
                      @if (p.activo) {
                        <button class="btn btn-ghost btn-sm" type="button" (click)="desactivar(p)">Desactivar</button>
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

    <app-drawer [open]="drawerAbierto()" [title]="editando() ? 'Editar proveedor' : 'Nuevo proveedor'" (closed)="cerrar()">
      <form (ngSubmit)="guardar()">
        <div class="field">
          <label class="label" for="nit">NIT <span class="req">*</span></label>
          <input class="input" id="nit" name="nit" [(ngModel)]="nit" [disabled]="editando()" autocomplete="off" />
        </div>
        <div class="field">
          <label class="label" for="nombre">Nombre <span class="req">*</span></label>
          <input class="input" id="nombre" name="nombre" [(ngModel)]="nombre" autocomplete="off" />
        </div>
        <div class="field">
          <label class="label" for="ciudad">Ciudad</label>
          <input class="input" id="ciudad" name="ciudad" [(ngModel)]="ciudad" autocomplete="off" />
        </div>
        @if (error()) { <p style="color:var(--error);font-size:var(--text-sm);margin-bottom:var(--sp-3)">{{ error() }}</p> }
        <button class="btn btn-primary btn-block" type="submit" [class.is-loading]="loading()" [disabled]="loading()">
          {{ editando() ? 'Guardar cambios' : 'Crear proveedor' }}
        </button>
      </form>
    </app-drawer>
  `,
})
export class ProveedoresListComponent {
  private readonly api = inject(ProveedoresApi);
  proveedores = signal<Proveedor[]>([]);
  cargando = signal(true);
  drawerAbierto = signal(false);
  editando = signal(false);

  private editId: number | null = null;
  nit = '';
  nombre = '';
  ciudad = '';
  loading = signal(false);
  error = signal('');

  constructor() {
    this.cargar();
  }

  cargar(): void {
    this.cargando.set(true);
    this.api.listar().subscribe({
      next: (ps) => { this.proveedores.set(ps); this.cargando.set(false); },
      error: () => this.cargando.set(false),
    });
  }

  abrirNuevo(): void {
    this.editando.set(false);
    this.editId = null;
    this.nit = '';
    this.nombre = '';
    this.ciudad = '';
    this.error.set('');
    this.drawerAbierto.set(true);
  }

  abrirEditar(p: Proveedor): void {
    this.editando.set(true);
    this.editId = p.id;
    this.nit = p.nit;
    this.nombre = p.nombre;
    this.ciudad = p.ciudad ?? '';
    this.error.set('');
    this.drawerAbierto.set(true);
  }

  cerrar(): void { this.drawerAbierto.set(false); }

  guardar(): void {
    if (this.loading()) return;
    if (this.editando()) {
      if (!this.nombre.trim()) { this.error.set('El nombre es obligatorio'); return; }
      this.error.set('');
      this.loading.set(true);
      this.api.actualizar(this.editId!, {
        nombre: this.nombre.trim(),
        ciudad: this.ciudad.trim() || undefined,
      }).subscribe({
        next: () => { this.loading.set(false); this.cerrar(); this.cargar(); },
        error: (e) => { this.loading.set(false); this.error.set(e?.error?.message ?? 'No se pudo actualizar el proveedor'); },
      });
      return;
    }
    if (!this.nit.trim() || !this.nombre.trim()) {
      this.error.set('NIT y Nombre son obligatorios');
      return;
    }
    this.error.set('');
    this.loading.set(true);
    this.api.crear({
      nit: this.nit.trim(),
      nombre: this.nombre.trim(),
      ciudad: this.ciudad.trim() || undefined,
    }).subscribe({
      next: () => { this.loading.set(false); this.cerrar(); this.cargar(); },
      error: (e) => { this.loading.set(false); this.error.set(e?.error?.message ?? 'No se pudo crear el proveedor'); },
    });
  }

  desactivar(p: Proveedor): void {
    this.api.desactivar(p.id).subscribe({
      next: () => this.cargar(),
    });
  }
}
