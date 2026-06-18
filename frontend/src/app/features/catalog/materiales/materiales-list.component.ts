import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MaterialesApi, Material, CrearMaterialDto, OrigenMaterial, ClaseBom } from '../../../core/api/materiales.api';
import { DrawerComponent } from '../../../shared/ui/drawer/drawer.component';

@Component({
  selector: 'app-materiales-list',
  standalone: true,
  imports: [DrawerComponent, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div><div class="ph-title">Materiales</div></div>
        <div class="page-actions">
          <button class="btn btn-primary" type="button" (click)="abrir()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            Nuevo material
          </button>
        </div>
      </div>

      @if (cargando()) {
        <div class="card"><div class="card-body">Cargando materiales…</div></div>
      } @else if (materiales().length === 0) {
        <div class="card"><div class="card-body">
          <div class="empty">
            <span class="e-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/></svg></span>
            <h4>Sin materiales todavía</h4>
            <p>Creá el primer material para empezar a armar los BOM.</p>
          </div>
        </div></div>
      } @else {
        <div class="card">
          <div class="table-scroll">
            <table class="data">
              <thead><tr><th>Código</th><th>Nombre</th><th>Origen</th><th>Unidad</th><th></th></tr></thead>
              <tbody>
                @for (m of materiales(); track m.id) {
                  <tr>
                    <td class="cell-mono">{{ m.codigo }}</td>
                    <td>{{ m.nombreCanonico }}</td>
                    <td>
                      @if (m.origen === 'FABRICADO') {
                        <span class="badge badge-info"><span class="dot"></span>Fabricado</span>
                      } @else {
                        <span class="badge badge-neutral"><span class="dot"></span>Comprado</span>
                      }
                    </td>
                    <td class="cell-sub">{{ m.unidad }}</td>
                    <td class="cell-actions">
                      <button class="btn btn-ghost btn-sm" type="button" (click)="desactivar(m)">Desactivar</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </div>

    <app-drawer [open]="drawerAbierto()" title="Nuevo material" (closed)="cerrar()">
      <form (ngSubmit)="guardar()">
        <div class="field">
          <label class="label" for="codigo">Código <span class="req">*</span></label>
          <input class="input" id="codigo" name="codigo" [(ngModel)]="codigo" autocomplete="off" />
        </div>
        <div class="field">
          <label class="label" for="nombreCanonico">Nombre canónico <span class="req">*</span></label>
          <input class="input" id="nombreCanonico" name="nombreCanonico" [(ngModel)]="nombreCanonico" autocomplete="off" />
        </div>
        <div class="field">
          <label class="label" for="categoriaId">Categoría (id) <span class="req">*</span></label>
          <input class="input" id="categoriaId" name="categoriaId" type="number" [(ngModel)]="categoriaId" />
        </div>
        <div class="field">
          <label class="label" for="unidadMedidaId">Unidad de medida (id) <span class="req">*</span></label>
          <input class="input" id="unidadMedidaId" name="unidadMedidaId" type="number" [(ngModel)]="unidadMedidaId" />
        </div>
        <div class="field">
          <label class="label" for="origen">Origen</label>
          <select class="select" id="origen" name="origen" [(ngModel)]="origen">
            <option value="COMPRADO">Comprado</option>
            <option value="FABRICADO">Fabricado</option>
          </select>
        </div>
        <div class="field">
          <label class="label" for="claseBom">Clase BOM</label>
          <select class="select" id="claseBom" name="claseBom" [(ngModel)]="claseBom">
            <option value="DIRECTO_CURVA">Directo (curva)</option>
            <option value="DIRECTO_FIJO">Directo (fijo)</option>
            <option value="INDIRECTO">Indirecto</option>
          </select>
        </div>
        @if (error()) { <p style="color:var(--error);font-size:var(--text-sm);margin-bottom:var(--sp-3)">{{ error() }}</p> }
        <button class="btn btn-primary btn-block" type="submit" [class.is-loading]="loading()" [disabled]="loading()">Crear material</button>
      </form>
    </app-drawer>
  `,
})
export class MaterialesListComponent {
  private readonly api = inject(MaterialesApi);
  materiales = signal<Material[]>([]);
  cargando = signal(true);
  drawerAbierto = signal(false);

  // form
  codigo = '';
  nombreCanonico = '';
  categoriaId?: number;
  unidadMedidaId?: number;
  origen: OrigenMaterial = 'COMPRADO';
  claseBom: ClaseBom = 'DIRECTO_CURVA';
  loading = signal(false);
  error = signal('');

  constructor() {
    this.cargar();
  }

  cargar(): void {
    this.cargando.set(true);
    this.api.listar().subscribe({
      next: (ms) => { this.materiales.set(ms); this.cargando.set(false); },
      error: () => this.cargando.set(false),
    });
  }

  abrir(): void { this.resetForm(); this.drawerAbierto.set(true); }
  cerrar(): void { this.drawerAbierto.set(false); }

  guardar(): void {
    if (!this.codigo.trim() || !this.nombreCanonico.trim()) {
      this.error.set('Código y Nombre canónico son obligatorios');
      return;
    }
    if (this.categoriaId == null || this.unidadMedidaId == null) {
      this.error.set('Categoría y Unidad de medida son obligatorias');
      return;
    }
    if (this.loading()) return;
    this.error.set('');
    this.loading.set(true);
    const dto: CrearMaterialDto = {
      codigo: this.codigo.trim(),
      nombreCanonico: this.nombreCanonico.trim(),
      categoriaId: this.categoriaId,
      unidadMedidaId: this.unidadMedidaId,
      origen: this.origen,
      claseBom: this.claseBom,
    };
    this.api.crear(dto).subscribe({
      next: () => { this.loading.set(false); this.cerrar(); this.cargar(); },
      error: (e) => { this.loading.set(false); this.error.set(e?.error?.message ?? 'No se pudo crear el material'); },
    });
  }

  desactivar(m: Material): void {
    this.api.desactivar(m.id).subscribe({ next: () => this.cargar() });
  }

  private resetForm(): void {
    this.codigo = '';
    this.nombreCanonico = '';
    this.categoriaId = undefined;
    this.unidadMedidaId = undefined;
    this.origen = 'COMPRADO';
    this.claseBom = 'DIRECTO_CURVA';
    this.error.set('');
    this.loading.set(false);
  }
}
