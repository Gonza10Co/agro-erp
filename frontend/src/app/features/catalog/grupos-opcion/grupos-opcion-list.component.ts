import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DrawerComponent } from '../../../shared/ui/drawer/drawer.component';
import { GruposOpcionApi, GrupoOpcion } from '../../../core/api/grupos-opcion.api';

@Component({
  selector: 'app-grupos-opcion-list',
  standalone: true,
  imports: [FormsModule, DrawerComponent],
  template: `
    <div class="page">
      <div class="page-header">
        <div><div class="ph-title">Grupos de opción</div></div>
        <div class="page-actions">
          <button class="btn btn-primary" type="button" (click)="abrir()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            Nuevo grupo
          </button>
        </div>
      </div>

      @if (cargando()) {
        <div class="card"><div class="card-body">Cargando grupos…</div></div>
      } @else if (grupos().length === 0) {
        <div class="card"><div class="card-body">
          <div class="empty">
            <span class="e-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/></svg></span>
            <h4>Sin grupos todavía</h4>
            <p>Creá el primer grupo de opción para configurar referencias.</p>
          </div>
        </div></div>
      } @else {
        @for (g of grupos(); track g.id) {
          <div class="card" style="margin-bottom:var(--sp-4)">
            <div class="card-body">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:var(--sp-3);margin-bottom:var(--sp-3)">
                <div>
                  <div class="t-h3" style="display:flex;align-items:center;gap:var(--sp-2)">
                    {{ g.nombre }}
                    <span class="cell-mono cell-sub">({{ g.codigo }})</span>
                    @if (g.obligatorio) { <span class="badge badge-neutral"><span class="dot"></span>Obligatorio</span> }
                  </div>
                  <div class="cell-sub">Orden: {{ g.orden }}</div>
                </div>
              </div>

              <div style="display:flex;flex-wrap:wrap;gap:var(--sp-2);margin-bottom:var(--sp-3)">
                @for (o of g.opciones; track o.id) {
                  <span class="badge" [class.badge-neutral]="!o.activo"
                        style="display:inline-flex;align-items:center;gap:var(--sp-1)">
                    <span class="dot"></span>{{ o.nombre }}
                    <span class="cell-mono cell-sub">{{ o.codigo }}</span>
                    @if (o.activo) {
                      <button class="icon-btn" type="button" title="Desactivar" (click)="desactivar(o.id)"
                              style="width:18px;height:18px">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                      </button>
                    } @else {
                      <span class="cell-sub">(inactiva)</span>
                    }
                  </span>
                } @empty {
                  <span class="cell-sub">Sin opciones.</span>
                }
              </div>

              <form (ngSubmit)="agregarOpcion(g)" style="display:flex;gap:var(--sp-2);align-items:flex-end;flex-wrap:wrap">
                <div class="field" style="margin:0">
                  <label class="label" [attr.for]="'opcod-' + g.id">Código opción</label>
                  <input class="input" [id]="'opcod-' + g.id" [name]="'opcod-' + g.id"
                         [(ngModel)]="g._nuevoCodigo" autocomplete="off" />
                </div>
                <div class="field" style="margin:0">
                  <label class="label" [attr.for]="'opnom-' + g.id">Nombre opción</label>
                  <input class="input" [id]="'opnom-' + g.id" [name]="'opnom-' + g.id"
                         [(ngModel)]="g._nuevoNombre" autocomplete="off" />
                </div>
                <button class="btn" type="submit" [disabled]="g._guardando">Agregar opción</button>
              </form>
            </div>
          </div>
        }
      }
    </div>

    <app-drawer [open]="drawerAbierto()" title="Nuevo grupo de opción" (closed)="cerrar()">
      <form (ngSubmit)="crearGrupo()">
        <div class="field">
          <label class="label" for="codigo">Código <span class="req">*</span></label>
          <input class="input" id="codigo" name="codigo" [(ngModel)]="codigo" autocomplete="off" />
        </div>
        <div class="field">
          <label class="label" for="nombre">Nombre <span class="req">*</span></label>
          <input class="input" id="nombre" name="nombre" [(ngModel)]="nombre" autocomplete="off" />
        </div>
        <div class="field">
          <label class="label" style="display:flex;align-items:center;gap:var(--sp-2);cursor:pointer">
            <input type="checkbox" name="obligatorio" [(ngModel)]="obligatorio" />
            Obligatorio
          </label>
        </div>
        <div class="field">
          <label class="label" for="orden">Orden</label>
          <input class="input" id="orden" name="orden" type="number" [(ngModel)]="orden" />
        </div>
        @if (error()) { <p style="color:var(--error);font-size:var(--text-sm);margin-bottom:var(--sp-3)">{{ error() }}</p> }
        <button class="btn btn-primary btn-block" type="submit" [class.is-loading]="loading()" [disabled]="loading()">Crear grupo</button>
      </form>
    </app-drawer>
  `,
})
export class GruposOpcionListComponent {
  private readonly api = inject(GruposOpcionApi);

  grupos = signal<GrupoOpcionVM[]>([]);
  cargando = signal(true);
  drawerAbierto = signal(false);

  codigo = '';
  nombre = '';
  obligatorio = false;
  orden?: number;
  loading = signal(false);
  error = signal('');

  constructor() {
    this.cargar();
  }

  cargar(): void {
    this.cargando.set(true);
    this.api.listar().subscribe({
      next: (gs) => { this.grupos.set(gs); this.cargando.set(false); },
      error: () => this.cargando.set(false),
    });
  }

  abrir(): void { this.drawerAbierto.set(true); }
  cerrar(): void { this.drawerAbierto.set(false); }

  crearGrupo(): void {
    if (!this.codigo.trim() || !this.nombre.trim()) {
      this.error.set('Código y Nombre son obligatorios');
      return;
    }
    if (this.loading()) return;
    this.error.set('');
    this.loading.set(true);
    this.api.crearGrupo({
      codigo: this.codigo.trim(),
      nombre: this.nombre.trim(),
      obligatorio: this.obligatorio,
      orden: this.orden,
    }).subscribe({
      next: () => {
        this.loading.set(false);
        this.codigo = '';
        this.nombre = '';
        this.obligatorio = false;
        this.orden = undefined;
        this.cerrar();
        this.cargar();
      },
      error: (e) => { this.loading.set(false); this.error.set(e?.error?.message ?? 'No se pudo crear el grupo'); },
    });
  }

  agregarOpcion(g: GrupoOpcionVM): void {
    const codigo = (g._nuevoCodigo ?? '').trim();
    const nombre = (g._nuevoNombre ?? '').trim();
    if (!codigo || !nombre || g._guardando) return;
    g._guardando = true;
    this.api.agregarOpcion(g.id, { codigo, nombre }).subscribe({
      next: () => { g._guardando = false; g._nuevoCodigo = ''; g._nuevoNombre = ''; this.cargar(); },
      error: () => { g._guardando = false; },
    });
  }

  desactivar(opcionId: number): void {
    this.api.desactivarOpcion(opcionId).subscribe({ next: () => this.cargar() });
  }
}

interface GrupoOpcionVM extends GrupoOpcion {
  _nuevoCodigo?: string;
  _nuevoNombre?: string;
  _guardando?: boolean;
}
