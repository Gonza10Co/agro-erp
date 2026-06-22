import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MarcasApi, Marca, TipoMarca, CrearMarcaDto, ActualizarMarcaDto } from '../../../core/api/marcas.api';
import { DrawerComponent } from '../../../shared/ui/drawer/drawer.component';

@Component({
  selector: 'app-marcas-list',
  standalone: true,
  imports: [DrawerComponent, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div><div class="ph-title">Marcas</div></div>
        <div class="page-actions">
          <button class="btn btn-primary" type="button" (click)="abrirNueva()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            Nueva marca
          </button>
        </div>
      </div>

      @if (cargando()) {
        <div class="card"><div class="card-body">Cargando marcas…</div></div>
      } @else if (marcas().length === 0) {
        <div class="card"><div class="card-body">
          <div class="empty">
            <h4>Sin marcas todavía</h4>
            <p>Crea la primera marca para empezar a configurar productos.</p>
          </div>
        </div></div>
      } @else {
        <div class="card">
          <div class="table-scroll">
            <table class="data">
              <thead><tr><th>Código</th><th>Nombre</th><th>Tipo</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                @for (m of marcas(); track m.id) {
                  <tr>
                    <td class="cell-mono">{{ m.codigo }}</td>
                    <td>{{ m.nombre }}</td>
                    <td><span class="badge badge-neutral"><span class="dot"></span>{{ m.tipo }}</span></td>
                    <td>{{ m.activo ? 'Activa' : 'Inactiva' }}</td>
                    <td class="cell-actions">
                      <button class="btn btn-ghost" type="button" (click)="abrirEditar(m)">Editar</button>
                      @if (m.activo) {
                        <button class="btn btn-ghost" type="button" (click)="desactivar(m)">Desactivar</button>
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

    <app-drawer [open]="drawerAbierto()" [title]="editando() ? 'Editar marca' : 'Nueva marca'" (closed)="cerrar()">
      <form (ngSubmit)="guardar()">
        <div class="field">
          <label class="label" for="codigo">Código <span class="req">*</span></label>
          <input class="input" id="codigo" name="codigo" [(ngModel)]="codigo" autocomplete="off" [disabled]="!!editando()" />
        </div>
        <div class="field">
          <label class="label" for="nombre">Nombre <span class="req">*</span></label>
          <input class="input" id="nombre" name="nombre" [(ngModel)]="nombre" autocomplete="off" />
        </div>
        <div class="field">
          <label class="label" for="tipo">Tipo</label>
          <select class="select" id="tipo" name="tipo" [(ngModel)]="tipo">
            <option value="PROPIA">Propia</option>
            <option value="MAQUILA">Maquila</option>
          </select>
        </div>
        @if (error()) { <p style="color:var(--error);font-size:var(--text-sm);margin-bottom:var(--sp-3)">{{ error() }}</p> }
        <button class="btn btn-primary btn-block" type="submit" [class.is-loading]="loading()" [disabled]="loading()">
          {{ editando() ? 'Guardar cambios' : 'Crear marca' }}
        </button>
      </form>
    </app-drawer>
  `,
})
export class MarcasListComponent {
  private readonly api = inject(MarcasApi);
  marcas = signal<Marca[]>([]);
  cargando = signal(true);
  drawerAbierto = signal(false);
  editando = signal<Marca | null>(null);

  codigo = '';
  nombre = '';
  tipo: TipoMarca = 'PROPIA';
  loading = signal(false);
  error = signal('');

  constructor() {
    this.cargar();
  }

  cargar(): void {
    this.cargando.set(true);
    this.api.listar().subscribe({
      next: (ms) => { this.marcas.set(ms); this.cargando.set(false); },
      error: () => this.cargando.set(false),
    });
  }

  abrirNueva(): void {
    this.editando.set(null);
    this.codigo = '';
    this.nombre = '';
    this.tipo = 'PROPIA';
    this.error.set('');
    this.drawerAbierto.set(true);
  }

  abrirEditar(m: Marca): void {
    this.editando.set(m);
    this.codigo = m.codigo;
    this.nombre = m.nombre;
    this.tipo = m.tipo;
    this.error.set('');
    this.drawerAbierto.set(true);
  }

  cerrar(): void { this.drawerAbierto.set(false); }

  guardar(): void {
    if (this.loading()) return;
    const editar = this.editando();
    if (!editar && !this.codigo.trim()) {
      this.error.set('El código es obligatorio');
      return;
    }
    if (!this.nombre.trim()) {
      this.error.set('El nombre es obligatorio');
      return;
    }
    this.error.set('');
    this.loading.set(true);

    if (editar) {
      const dto: ActualizarMarcaDto = { nombre: this.nombre.trim(), tipo: this.tipo };
      this.api.actualizar(editar.id, dto).subscribe({
        next: () => { this.loading.set(false); this.cerrar(); this.cargar(); },
        error: (e) => { this.loading.set(false); this.error.set(e?.error?.message ?? 'No se pudo actualizar la marca'); },
      });
    } else {
      const dto: CrearMarcaDto = { codigo: this.codigo.trim(), nombre: this.nombre.trim(), tipo: this.tipo };
      this.api.crear(dto).subscribe({
        next: () => { this.loading.set(false); this.cerrar(); this.cargar(); },
        error: (e) => { this.loading.set(false); this.error.set(e?.error?.message ?? 'No se pudo crear la marca'); },
      });
    }
  }

  desactivar(m: Marca): void {
    this.api.desactivar(m.id).subscribe({ next: () => this.cargar() });
  }
}
