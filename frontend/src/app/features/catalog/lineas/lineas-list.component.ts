import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LineasApi, Linea, Celula, CrearLineaDto, ActualizarLineaDto } from '../../../core/api/lineas.api';
import { DrawerComponent } from '../../../shared/ui/drawer/drawer.component';

const CELULAS: { valor: Celula; label: string }[] = [
  { valor: 'CORTE', label: 'Corte' },
  { valor: 'GUARNICION', label: 'Guarnición' },
  { valor: 'ALMACEN', label: 'Almacén' },
  { valor: 'INYECCION', label: 'Inyección' },
  { valor: 'PT', label: 'Producto Terminado' },
];
const LABEL: Record<Celula, string> = Object.fromEntries(
  CELULAS.map((c) => [c.valor, c.label]),
) as Record<Celula, string>;

@Component({
  selector: 'app-lineas-list',
  standalone: true,
  imports: [DrawerComponent, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div><div class="ph-title">Líneas de producción</div></div>
        <div class="page-actions">
          <button class="btn btn-primary" type="button" (click)="abrirNueva()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            Nueva línea
          </button>
        </div>
      </div>

      @if (cargando()) {
        <div class="card"><div class="card-body">Cargando líneas…</div></div>
      } @else if (lineas().length === 0) {
        <div class="card"><div class="card-body">
          <div class="empty">
            <h4>Sin líneas todavía</h4>
            <p>Crea la primera línea de producción (Basarili, Agro, Alta, Feroz…).</p>
          </div>
        </div></div>
      } @else {
        <div class="card">
          <div class="table-scroll">
            <table class="data">
              <thead><tr><th>Código</th><th>Nombre</th><th>Arranca en</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                @for (l of lineas(); track l.id) {
                  <tr>
                    <td class="cell-mono">{{ l.codigo }}</td>
                    <td>{{ l.nombre }}</td>
                    <td><span class="badge badge-neutral"><span class="dot"></span>{{ label(l.celulaInicial) }}</span></td>
                    <td>{{ l.activo ? 'Activa' : 'Inactiva' }}</td>
                    <td class="cell-actions">
                      <button class="btn btn-ghost" type="button" (click)="abrirEditar(l)">Editar</button>
                      @if (l.activo) {
                        <button class="btn btn-ghost" type="button" (click)="desactivar(l)">Desactivar</button>
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

    <app-drawer [open]="drawerAbierto()" [title]="editando() ? 'Editar línea' : 'Nueva línea'" (closed)="cerrar()">
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
          <label class="label" for="celula">Arranca en célula</label>
          <select class="select" id="celula" name="celula" [(ngModel)]="celulaInicial">
            @for (c of celulas; track c.valor) {
              <option [value]="c.valor">{{ c.label }}</option>
            }
          </select>
        </div>
        @if (error()) { <p style="color:var(--error);font-size:var(--text-sm);margin-bottom:var(--sp-3)">{{ error() }}</p> }
        <button class="btn btn-primary btn-block" type="submit" [class.is-loading]="loading()" [disabled]="loading()">
          {{ editando() ? 'Guardar cambios' : 'Crear línea' }}
        </button>
      </form>
    </app-drawer>
  `,
})
export class LineasListComponent {
  private readonly api = inject(LineasApi);
  readonly celulas = CELULAS;
  lineas = signal<Linea[]>([]);
  cargando = signal(true);
  drawerAbierto = signal(false);
  editando = signal<Linea | null>(null);

  codigo = '';
  nombre = '';
  celulaInicial: Celula = 'CORTE';
  loading = signal(false);
  error = signal('');

  constructor() { this.cargar(); }

  label(c: Celula): string { return LABEL[c] ?? c; }

  cargar(): void {
    this.cargando.set(true);
    this.api.listar().subscribe({
      next: (ls) => { this.lineas.set(ls); this.cargando.set(false); },
      error: () => this.cargando.set(false),
    });
  }

  abrirNueva(): void {
    this.editando.set(null);
    this.codigo = ''; this.nombre = ''; this.celulaInicial = 'CORTE';
    this.error.set(''); this.drawerAbierto.set(true);
  }

  abrirEditar(l: Linea): void {
    this.editando.set(l);
    this.codigo = l.codigo; this.nombre = l.nombre; this.celulaInicial = l.celulaInicial;
    this.error.set(''); this.drawerAbierto.set(true);
  }

  cerrar(): void { this.drawerAbierto.set(false); }

  guardar(): void {
    if (this.loading()) return;
    const editar = this.editando();
    if (!editar && !this.codigo.trim()) { this.error.set('El código es obligatorio'); return; }
    if (!this.nombre.trim()) { this.error.set('El nombre es obligatorio'); return; }
    this.error.set(''); this.loading.set(true);

    if (editar) {
      const dto: ActualizarLineaDto = { nombre: this.nombre.trim(), celulaInicial: this.celulaInicial };
      this.api.actualizar(editar.id, dto).subscribe({
        next: () => { this.loading.set(false); this.cerrar(); this.cargar(); },
        error: (e) => { this.loading.set(false); this.error.set(e?.error?.message ?? 'No se pudo actualizar la línea'); },
      });
    } else {
      const dto: CrearLineaDto = { codigo: this.codigo.trim(), nombre: this.nombre.trim(), celulaInicial: this.celulaInicial };
      this.api.crear(dto).subscribe({
        next: () => { this.loading.set(false); this.cerrar(); this.cargar(); },
        error: (e) => { this.loading.set(false); this.error.set(e?.error?.message ?? 'No se pudo crear la línea'); },
      });
    }
  }

  desactivar(l: Linea): void {
    this.api.desactivar(l.id).subscribe({ next: () => this.cargar() });
  }
}
