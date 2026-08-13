import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OperariosApi, Operario } from '../../core/api/operarios.api';
import { Celula } from '../../core/api/models/fabricacion.models';
import { DrawerComponent } from '../../shared/ui/drawer/drawer.component';

const CELULAS: Celula[] = ['CORTE', 'GUARNICION', 'ALMACEN', 'INYECCION', 'PT'];

@Component({
  selector: 'app-operarios-list',
  standalone: true,
  imports: [DrawerComponent, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <div class="ph-title">Operarios</div>
          <div class="ph-sub">La gente de planta que queda registrada en cada escaneo</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" type="button" (click)="abrirNuevo()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            Nuevo operario
          </button>
        </div>
      </div>

      <div class="card" style="margin-bottom:var(--sp-4)">
        <div class="card-body" style="display:flex;gap:var(--sp-3);align-items:center;flex-wrap:wrap">
          <label class="label" for="filtro-celula" style="margin:0">Célula</label>
          <select class="input" id="filtro-celula" name="filtroCelula" style="max-width:220px"
                  [ngModel]="filtroCelula()" (ngModelChange)="filtrar($event)">
            <option value="">Todas</option>
            @for (c of celulas; track c) { <option [value]="c">{{ c }}</option> }
          </select>
        </div>
      </div>

      @if (cargando()) {
        <div class="card"><div class="card-body">Cargando operarios…</div></div>
      } @else if (operarios().length === 0) {
        <div class="card"><div class="card-body">
          <div class="empty">
            <h4>Sin operarios todavía</h4>
            <p>Crea el primero para que pueda quedar registrado en los escaneos.</p>
          </div>
        </div></div>
      } @else {
        <div class="card">
          <div class="table-scroll">
            <table class="data">
              <thead><tr><th>Nombre</th><th>Célula</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                @for (o of operarios(); track o.id) {
                  <tr>
                    <td>{{ o.nombre }}</td>
                    <td class="cell-mono">{{ o.celula }}</td>
                    <td>
                      @if (o.activo) {
                        <span class="badge badge-ok"><span class="dot"></span>Activo</span>
                      } @else {
                        <span class="badge badge-neutral"><span class="dot"></span>Retirado</span>
                      }
                    </td>
                    <td class="cell-actions">
                      <button class="btn btn-ghost btn-sm" type="button" (click)="abrirEditar(o)">Editar</button>
                      @if (o.activo) {
                        <button class="btn btn-ghost btn-sm" type="button" (click)="cambiarEstado(o, false)">Retirar</button>
                      } @else {
                        <button class="btn btn-ghost btn-sm" type="button" (click)="cambiarEstado(o, true)">Reactivar</button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
        <p class="cell-sub" style="margin-top:var(--sp-3)">
          Los operarios no se eliminan: quedan firmando los eventos de trazabilidad e
          incidencias que registraron. Retirarlo lo saca del selector del piso.
        </p>
      }
      @if (errorTabla()) {
        <p style="color:var(--error);font-size:var(--text-sm);margin-top:var(--sp-3)">{{ errorTabla() }}</p>
      }
    </div>

    <app-drawer [open]="drawerAbierto()" [title]="editando() ? 'Editar operario' : 'Nuevo operario'" (closed)="cerrar()">
      <form (ngSubmit)="guardar()">
        <div class="field">
          <label class="label" for="nombre">Nombre <span class="req">*</span></label>
          <input class="input" id="nombre" name="nombre" [(ngModel)]="nombre" autocomplete="off" />
        </div>
        <div class="field">
          <label class="label" for="celula">Célula <span class="req">*</span></label>
          <select class="input" id="celula" name="celula" [(ngModel)]="celula">
            @for (c of celulas; track c) { <option [value]="c">{{ c }}</option> }
          </select>
        </div>
        @if (error()) { <p style="color:var(--error);font-size:var(--text-sm);margin-bottom:var(--sp-3)">{{ error() }}</p> }
        <button class="btn btn-primary btn-block" type="submit" [class.is-loading]="loading()" [disabled]="loading()">
          {{ editando() ? 'Guardar cambios' : 'Crear operario' }}
        </button>
      </form>
    </app-drawer>
  `,
})
export class OperariosListComponent {
  private readonly api = inject(OperariosApi);
  readonly celulas = CELULAS;

  operarios = signal<Operario[]>([]);
  cargando = signal(true);
  filtroCelula = signal<Celula | ''>('');
  drawerAbierto = signal(false);
  editando = computed(() => this.editId !== null);
  loading = signal(false);
  error = signal('');
  errorTabla = signal('');

  private editId: number | null = null;
  nombre = '';
  celula: Celula = 'CORTE';

  constructor() {
    this.cargar();
  }

  cargar(): void {
    this.cargando.set(true);
    const celula = this.filtroCelula() || undefined;
    // Sin `soloActivos`: acá hay que ver a los retirados para poder reactivarlos.
    this.api.listar({ celula }).subscribe({
      next: (os) => { this.operarios.set(os); this.cargando.set(false); },
      error: () => { this.cargando.set(false); this.errorTabla.set('No se pudieron cargar los operarios'); },
    });
  }

  filtrar(celula: Celula | ''): void {
    this.filtroCelula.set(celula);
    this.cargar();
  }

  abrirNuevo(): void {
    this.editId = null;
    this.nombre = '';
    this.celula = this.filtroCelula() || 'CORTE';
    this.error.set('');
    this.drawerAbierto.set(true);
  }

  abrirEditar(o: Operario): void {
    this.editId = o.id;
    this.nombre = o.nombre;
    this.celula = o.celula;
    this.error.set('');
    this.drawerAbierto.set(true);
  }

  cerrar(): void {
    this.drawerAbierto.set(false);
    this.editId = null;
  }

  guardar(): void {
    if (this.loading()) return;
    if (!this.nombre.trim()) { this.error.set('El nombre es obligatorio'); return; }
    this.error.set('');
    this.loading.set(true);

    const dto = { nombre: this.nombre.trim(), celula: this.celula };
    const obs = this.editId !== null
      ? this.api.actualizar(this.editId, dto)
      : this.api.crear(dto);

    obs.subscribe({
      next: () => { this.loading.set(false); this.cerrar(); this.cargar(); },
      error: (e: any) => {
        this.loading.set(false);
        // El backend avisa el nombre repetido en la célula; ese detalle importa.
        this.error.set(e?.error?.message ?? 'No se pudo guardar el operario');
      },
    });
  }

  cambiarEstado(o: Operario, activo: boolean): void {
    this.errorTabla.set('');
    this.api.actualizar(o.id, { activo }).subscribe({
      next: () => this.cargar(),
      error: (e: any) => this.errorTabla.set(e?.error?.message ?? 'No se pudo cambiar el estado'),
    });
  }
}
