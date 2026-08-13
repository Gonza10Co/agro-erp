import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UsuariosApi, Usuario, RolUsuario } from '../../core/api/usuarios.api';
import { AuthService } from '../../core/auth/auth.service';
import { DrawerComponent } from '../../shared/ui/drawer/drawer.component';

type ModoDrawer = 'nuevo' | 'rol' | 'password';

@Component({
  selector: 'app-usuarios-list',
  standalone: true,
  imports: [DrawerComponent, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <div class="ph-title">Usuarios</div>
          <div class="ph-sub">Quién entra al sistema y con qué permisos</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" type="button" (click)="abrirNuevo()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            Nuevo usuario
          </button>
        </div>
      </div>

      @if (cargando()) {
        <div class="card"><div class="card-body">Cargando usuarios…</div></div>
      } @else {
        <div class="card">
          <div class="table-scroll">
            <table class="data">
              <thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                @for (u of usuarios(); track u.id) {
                  <tr>
                    <td class="cell-mono">
                      {{ u.username }}
                      @if (u.id === miId()) { <span class="cell-sub"> · tú</span> }
                    </td>
                    <td>{{ u.role.name }}</td>
                    <td>
                      @if (u.isActive) {
                        <span class="badge badge-ok"><span class="dot"></span>Activo</span>
                      } @else {
                        <span class="badge badge-neutral"><span class="dot"></span>Inactivo</span>
                      }
                    </td>
                    <td class="cell-actions">
                      <button class="btn btn-ghost btn-sm" type="button" (click)="abrirRol(u)">Cambiar rol</button>
                      <button class="btn btn-ghost btn-sm" type="button" (click)="abrirPassword(u)">Contraseña</button>
                      @if (u.isActive) {
                        <button class="btn btn-ghost btn-sm" type="button" [disabled]="u.id === miId()" (click)="cambiarEstado(u, false)">Desactivar</button>
                      } @else {
                        <button class="btn btn-ghost btn-sm" type="button" (click)="cambiarEstado(u, true)">Reactivar</button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
        <p class="cell-sub" style="margin-top:var(--sp-3)">
          Los usuarios no se eliminan: quedan firmando los despachos e incidencias que
          autorizaron. Desactivar le quita el acceso y cierra sus sesiones abiertas.
        </p>
      }
      @if (errorTabla()) {
        <p style="color:var(--error);font-size:var(--text-sm);margin-top:var(--sp-3)">{{ errorTabla() }}</p>
      }
    </div>

    <app-drawer [open]="drawerAbierto()" [title]="tituloDrawer()" (closed)="cerrar()">
      <form (ngSubmit)="guardar()">
        @if (modo() === 'nuevo') {
          <div class="field">
            <label class="label" for="username">Usuario <span class="req">*</span></label>
            <input class="input" id="username" name="username" [(ngModel)]="username" autocomplete="off" />
          </div>
        }
        @if (modo() === 'nuevo' || modo() === 'password') {
          <div class="field">
            <label class="label" for="password">Contraseña <span class="req">*</span></label>
            <input class="input" id="password" name="password" type="password" [(ngModel)]="password" autocomplete="new-password" />
            <small class="cell-sub">Mínimo 8 caracteres.</small>
          </div>
        }
        @if (modo() === 'nuevo' || modo() === 'rol') {
          <div class="field">
            <label class="label" for="rol">Rol <span class="req">*</span></label>
            <select class="input" id="rol" name="rol" [(ngModel)]="roleId">
              @for (r of roles(); track r.id) {
                <option [value]="r.id">{{ r.name }}</option>
              }
            </select>
          </div>
        }
        @if (error()) { <p style="color:var(--error);font-size:var(--text-sm);margin-bottom:var(--sp-3)">{{ error() }}</p> }
        <button class="btn btn-primary btn-block" type="submit" [class.is-loading]="loading()" [disabled]="loading()">
          {{ textoBoton() }}
        </button>
      </form>
    </app-drawer>
  `,
})
export class UsuariosListComponent {
  private readonly api = inject(UsuariosApi);
  private readonly auth = inject(AuthService);

  usuarios = signal<Usuario[]>([]);
  roles = signal<RolUsuario[]>([]);
  cargando = signal(true);
  drawerAbierto = signal(false);
  modo = signal<ModoDrawer>('nuevo');
  loading = signal(false);
  error = signal('');
  errorTabla = signal('');

  /** Para no ofrecerle desactivarse a sí mismo: el backend lo rechaza igual. */
  readonly miId = signal<number | null>(this.auth.userId());

  private editId: number | null = null;
  username = '';
  password = '';
  roleId: number | null = null;

  constructor() {
    this.cargar();
    this.api.roles().subscribe({ next: (rs) => this.roles.set(rs) });
  }

  tituloDrawer(): string {
    if (this.modo() === 'nuevo') return 'Nuevo usuario';
    if (this.modo() === 'rol') return 'Cambiar rol';
    return 'Nueva contraseña';
  }

  textoBoton(): string {
    if (this.modo() === 'nuevo') return 'Crear usuario';
    if (this.modo() === 'rol') return 'Guardar rol';
    return 'Cambiar contraseña';
  }

  cargar(): void {
    this.cargando.set(true);
    this.api.listar().subscribe({
      next: (us) => { this.usuarios.set(us); this.cargando.set(false); },
      error: () => { this.cargando.set(false); this.errorTabla.set('No se pudieron cargar los usuarios'); },
    });
  }

  abrirNuevo(): void {
    this.modo.set('nuevo');
    this.editId = null;
    this.username = '';
    this.password = '';
    this.roleId = this.roles()[0]?.id ?? null;
    this.error.set('');
    this.drawerAbierto.set(true);
  }

  abrirRol(u: Usuario): void {
    this.modo.set('rol');
    this.editId = u.id;
    this.roleId = u.role.id;
    this.error.set('');
    this.drawerAbierto.set(true);
  }

  abrirPassword(u: Usuario): void {
    this.modo.set('password');
    this.editId = u.id;
    this.password = '';
    this.error.set('');
    this.drawerAbierto.set(true);
  }

  cerrar(): void { this.drawerAbierto.set(false); }

  guardar(): void {
    if (this.loading()) return;
    const modo = this.modo();

    if (modo === 'nuevo') {
      if (!this.username.trim() || !this.roleId) { this.error.set('Usuario y rol son obligatorios'); return; }
      if (this.password.length < 8) { this.error.set('La contraseña debe tener al menos 8 caracteres'); return; }
      this.ejecutar(this.api.crear({
        username: this.username.trim(),
        password: this.password,
        roleId: Number(this.roleId),
      }));
      return;
    }

    if (modo === 'rol') {
      if (!this.roleId) { this.error.set('Elige un rol'); return; }
      this.ejecutar(this.api.actualizar(this.editId!, { roleId: Number(this.roleId) }));
      return;
    }

    if (this.password.length < 8) { this.error.set('La contraseña debe tener al menos 8 caracteres'); return; }
    this.ejecutar(this.api.resetearPassword(this.editId!, this.password));
  }

  private ejecutar(obs: { subscribe: (o: { next: () => void; error: (e: unknown) => void }) => void }): void {
    this.error.set('');
    this.loading.set(true);
    obs.subscribe({
      next: () => { this.loading.set(false); this.cerrar(); this.cargar(); },
      error: (e: any) => {
        this.loading.set(false);
        // El backend explica el porqué (último ADMIN, username repetido…) y esa
        // razón le sirve más al usuario que un mensaje genérico.
        this.error.set(e?.error?.message ?? 'No se pudo completar la operación');
      },
    });
  }

  cambiarEstado(u: Usuario, isActive: boolean): void {
    this.errorTabla.set('');
    this.api.actualizar(u.id, { isActive }).subscribe({
      next: () => this.cargar(),
      error: (e: any) => this.errorTabla.set(e?.error?.message ?? 'No se pudo cambiar el estado'),
    });
  }
}
