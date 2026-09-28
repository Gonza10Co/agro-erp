import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MarcasApi, Marca, TipoMarca, CrearMarcaDto, ActualizarMarcaDto, MaterialMarca } from '../../../core/api/marcas.api';
import { MaterialesApi, Material } from '../../../core/api/materiales.api';
import { AuthService } from '../../../core/auth/auth.service';
import { puedeVerSeccion } from '../../../core/auth/modulos';
import { BuscadorSelectComponent } from '../../../shared/ui/buscador-select/buscador-select.component';
import { LineasApi, Linea } from '../../../core/api/lineas.api';
import { DrawerComponent } from '../../../shared/ui/drawer/drawer.component';
import { ConfirmarAccionComponent } from '../../../shared/ui/confirmar-accion/confirmar-accion.component';

@Component({
  selector: 'app-marcas-list',
  standalone: true,
  imports: [DrawerComponent, FormsModule, ConfirmarAccionComponent, BuscadorSelectComponent],
  template: `
    <div class="page">
      <div class="page-header">
        <div><div class="ph-title">Marcas</div></div>
        <div class="page-actions">
          <label class="check">
            <input type="checkbox" [checked]="mostrarInactivas()" (change)="alternarInactivas()" />
            <span class="box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5L20 7"/></svg></span>
            Mostrar inactivas
          </label>
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
              <thead><tr><th>Código</th><th>Nombre</th><th>Tipo</th><th>Línea</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                @for (m of marcas(); track m.id) {
                  <tr [class.is-inactive]="!m.activo">
                    <td class="cell-mono">{{ m.codigo }}</td>
                    <td>{{ m.nombre }}</td>
                    <td><span class="badge badge-neutral"><span class="dot"></span>{{ m.tipo }}</span></td>
                    <td>{{ nombreLinea(m.lineaId) }}</td>
                    <td>
                      @if (m.activo) {
                        <span class="badge badge-success"><span class="dot"></span>Activa</span>
                      } @else {
                        <span class="badge badge-neutral"><span class="dot"></span>Inactiva</span>
                      }
                    </td>
                    <td class="cell-actions">
                      <button class="btn btn-ghost" type="button" (click)="abrirEditar(m)">Editar</button>
                      @if (puedeVerMateriales) {
                        <button class="btn btn-ghost" type="button" (click)="abrirMateriales(m)">Materiales</button>
                      }
                      @if (m.activo) {
                        <app-confirmar-accion
                          [abierto]="confirmandoId() === m.id"
                          [pregunta]="'¿Desactivar ' + m.codigo + '?'"
                          (pedir)="confirmandoId.set(m.id)"
                          (cancelar)="confirmandoId.set(null)"
                          (confirmar)="desactivar(m)" />
                      } @else {
                        <button class="btn btn-ghost btn-sm" type="button" (click)="reactivar(m)">Reactivar</button>
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
        <div class="field">
          <label class="label" for="linea">Línea de producción</label>
          <select class="select" id="linea" name="linea" [(ngModel)]="lineaId">
            <option [ngValue]="null">— Sin línea —</option>
            @for (l of lineas(); track l.id) {
              <option [ngValue]="l.id">{{ l.nombre }}</option>
            }
          </select>
        </div>
        @if (error()) { <p style="color:var(--error);font-size:var(--text-sm);margin-bottom:var(--sp-3)">{{ error() }}</p> }
        <button class="btn btn-primary btn-block" type="submit" [class.is-loading]="loading()" [disabled]="loading()">
          {{ editando() ? 'Guardar cambios' : 'Crear marca' }}
        </button>
      </form>
    </app-drawer>

    <app-drawer [open]="!!marcaMateriales()" [title]="'Materiales propios de ' + (marcaMateriales()?.nombre ?? '')" (closed)="cerrarMateriales()">
      <p class="mm-guia">Cuando un pedido lleve esta marca, en el BOM de cualquier referencia se cambia el material de la izquierda por el de la derecha.</p>

      @if (cargandoMateriales()) {
        <p class="mm-vacio">Cargando…</p>
      } @else if (materialesMarca().length === 0) {
        <p class="mm-vacio">Esta marca todavía no tiene materiales propios: usa el BOM base tal cual.</p>
      } @else {
        <ul class="mm-lista">
          @for (r of materialesMarca(); track r.id) {
            <li class="mm-fila">
              <span class="mm-par">
                <span>{{ r.materialObjetivo?.nombre }}</span>
                <span class="mm-flecha" aria-hidden="true">→</span>
                <span class="mm-nuevo">{{ r.materialNuevo?.nombre }}</span>
              </span>
              <app-confirmar-accion
                etiqueta="Quitar"
                pregunta="¿Quitar este reemplazo?"
                textoConfirmar="Sí, quitar"
                [abierto]="quitandoId() === r.id"
                (pedir)="quitandoId.set(r.id)"
                (cancelar)="quitandoId.set(null)"
                (confirmar)="quitarMaterial(r)" />
            </li>
          }
        </ul>
      }

      <div class="mm-form">
        <!-- El @for sobre la versión recrea los buscadores (y limpia su texto) tras agregar. -->
        @for (v of [versionForm()]; track v) {
          <div class="field">
            <span class="label">Material del BOM base</span>
            <app-buscador-select [items]="materialesActivos()" [etiqueta]="etiquetaMaterial" [sub]="codigoMaterial"
              placeholder="Ej. MARQUILLA AGRO" (seleccionar)="elegirObjetivo($event)" />
          </div>
          <div class="field">
            <span class="label">Material de la marca</span>
            <app-buscador-select [items]="materialesActivos()" [etiqueta]="etiquetaMaterial" [sub]="codigoMaterial"
              placeholder="Ej. MARQUILLA ABRUZZO" (seleccionar)="elegirNuevo($event)" />
          </div>
        }
        @if (errorMateriales()) { <p class="mm-error">{{ errorMateriales() }}</p> }
        <button class="btn btn-primary btn-block" type="button" [class.is-loading]="guardandoMaterial()"
          [disabled]="guardandoMaterial()" (click)="agregarMaterial()">Agregar</button>
      </div>
    </app-drawer>
  `,
  styles: [`
    .mm-guia{font-size:var(--text-sm);color:var(--text-muted);margin-bottom:var(--sp-4)}
    .mm-vacio{font-size:var(--text-sm);color:var(--text-subtle);margin-bottom:var(--sp-4)}
    .mm-lista{list-style:none;margin:0 0 var(--sp-4);padding:0;display:flex;flex-direction:column;gap:var(--sp-2)}
    .mm-fila{display:flex;align-items:center;justify-content:space-between;gap:var(--sp-3);padding:var(--sp-2) var(--sp-3);border:var(--bw) solid var(--border);border-radius:var(--r-md);font-size:var(--text-sm)}
    .mm-par{display:flex;flex-wrap:wrap;align-items:center;gap:var(--sp-2);min-width:0}
    .mm-flecha{color:var(--text-subtle)}
    .mm-nuevo{font-weight:var(--fw-medium)}
    .mm-form{border-top:var(--bw) solid var(--border);padding-top:var(--sp-4)}
    .mm-error{color:var(--error);font-size:var(--text-sm);margin-bottom:var(--sp-3)}
  `],
})
export class MarcasListComponent {
  private readonly api = inject(MarcasApi);
  private readonly lineasApi = inject(LineasApi);
  private readonly materialesApi = inject(MaterialesApi);
  private readonly auth = inject(AuthService);
  marcas = signal<Marca[]>([]);
  lineas = signal<Linea[]>([]);
  cargando = signal(true);
  drawerAbierto = signal(false);
  editando = signal<Marca | null>(null);
  /** Casilla "Mostrar inactivas": pide también las desactivadas para poder reactivarlas. */
  mostrarInactivas = signal(false);
  /** Fila que está pidiendo "¿Desactivar…?" (una a la vez). */
  confirmandoId = signal<number | null>(null);

  codigo = '';
  nombre = '';
  tipo: TipoMarca = 'PROPIA';
  lineaId: number | null = null;
  loading = signal(false);
  error = signal('');

  // ── Materiales propios de la marca ──
  readonly puedeVerMateriales = puedeVerSeccion(this.auth.rol(), 'materiales-marca');
  /** Marca cuyo panel de materiales está abierto (null = cerrado). */
  marcaMateriales = signal<Marca | null>(null);
  materialesMarca = signal<MaterialMarca[]>([]);
  /** Catálogo de materiales activos para los dos buscadores (se carga una vez). */
  materialesActivos = signal<Material[]>([]);
  cargandoMateriales = signal(false);
  objetivo = signal<Material | null>(null);
  nuevo = signal<Material | null>(null);
  guardandoMaterial = signal(false);
  errorMateriales = signal('');
  /** Reemplazo que está pidiendo "¿Quitar…?" (uno a la vez). */
  quitandoId = signal<number | null>(null);
  versionForm = signal(0);
  readonly etiquetaMaterial = (m: Material) => m.nombreCanonico;
  readonly codigoMaterial = (m: Material) => m.codigo;

  constructor() {
    this.cargar();
    this.lineasApi.listar().subscribe({ next: (ls) => this.lineas.set(ls) });
  }

  nombreLinea(id?: number | null): string {
    if (id == null) return '—';
    return this.lineas().find((l) => l.id === id)?.nombre ?? '—';
  }

  cargar(): void {
    this.cargando.set(true);
    this.api.listar({ incluirInactivas: this.mostrarInactivas() }).subscribe({
      next: (ms) => { this.marcas.set(ms); this.cargando.set(false); },
      error: () => this.cargando.set(false),
    });
  }

  abrirNueva(): void {
    this.editando.set(null);
    this.codigo = '';
    this.nombre = '';
    this.tipo = 'PROPIA';
    this.lineaId = null;
    this.error.set('');
    this.drawerAbierto.set(true);
  }

  abrirEditar(m: Marca): void {
    this.editando.set(m);
    this.codigo = m.codigo;
    this.nombre = m.nombre;
    this.tipo = m.tipo;
    this.lineaId = m.lineaId ?? null;
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

    // lineaId solo viaja cuando hay línea elegida (asignar); "— Sin línea —" lo omite.
    const linea = this.lineaId != null ? { lineaId: this.lineaId } : {};
    if (editar) {
      const dto: ActualizarMarcaDto = { nombre: this.nombre.trim(), tipo: this.tipo, ...linea };
      this.api.actualizar(editar.id, dto).subscribe({
        next: () => { this.loading.set(false); this.cerrar(); this.cargar(); },
        error: (e) => { this.loading.set(false); this.error.set(e?.error?.message ?? 'No se pudo actualizar la marca'); },
      });
    } else {
      const dto: CrearMarcaDto = { codigo: this.codigo.trim(), nombre: this.nombre.trim(), tipo: this.tipo, ...linea };
      this.api.crear(dto).subscribe({
        next: () => { this.loading.set(false); this.cerrar(); this.cargar(); },
        error: (e) => { this.loading.set(false); this.error.set(e?.error?.message ?? 'No se pudo crear la marca'); },
      });
    }
  }

  alternarInactivas(): void {
    this.mostrarInactivas.update((v) => !v);
    this.cargar();
  }

  /** Solo se llama desde "Sí, desactivar": el primer clic únicamente abre la confirmación. */
  desactivar(m: Marca): void {
    this.confirmandoId.set(null);
    this.api.desactivar(m.id).subscribe({ next: () => this.cargar() });
  }

  reactivar(m: Marca): void {
    this.api.reactivar(m.id).subscribe({ next: () => this.cargar() });
  }

  abrirMateriales(m: Marca): void {
    this.marcaMateriales.set(m);
    this.materialesMarca.set([]);
    this.limpiarFormMateriales();
    this.cargandoMateriales.set(true);
    this.api.listarMateriales(m.id).subscribe({
      next: (rs) => { this.materialesMarca.set(rs); this.cargandoMateriales.set(false); },
      error: (e) => { this.cargandoMateriales.set(false); this.errorMateriales.set(mensaje(e, 'No se pudieron cargar los materiales de la marca')); },
    });
    if (this.materialesActivos().length === 0)
      this.materialesApi.listar().subscribe({ next: (ms) => this.materialesActivos.set(ms) });
  }

  cerrarMateriales(): void { this.marcaMateriales.set(null); }

  elegirObjetivo(m: Material): void { this.objetivo.set(m); this.errorMateriales.set(''); }
  elegirNuevo(m: Material): void { this.nuevo.set(m); this.errorMateriales.set(''); }

  agregarMaterial(): void {
    const marca = this.marcaMateriales();
    const objetivo = this.objetivo();
    const nuevo = this.nuevo();
    if (!marca || this.guardandoMaterial()) return;
    if (!objetivo || !nuevo) {
      this.errorMateriales.set('Elige el material del BOM base y el de la marca');
      return;
    }
    if (objetivo.id === nuevo.id) {
      this.errorMateriales.set('El material de la marca debe ser distinto al del BOM base');
      return;
    }
    this.guardandoMaterial.set(true);
    this.api.agregarMaterial(marca.id, { materialObjetivoId: objetivo.id, materialNuevoId: nuevo.id }).subscribe({
      next: (r) => {
        this.guardandoMaterial.set(false);
        this.materialesMarca.update((rs) => [...rs, r]);
        this.limpiarFormMateriales();
      },
      error: (e) => { this.guardandoMaterial.set(false); this.errorMateriales.set(mensaje(e, 'No se pudo agregar el material')); },
    });
  }

  /** Solo se llama desde "Sí, quitar". */
  quitarMaterial(r: MaterialMarca): void {
    const marca = this.marcaMateriales();
    this.quitandoId.set(null);
    if (!marca) return;
    this.api.quitarMaterial(marca.id, r.id).subscribe({
      next: () => this.materialesMarca.update((rs) => rs.filter((x) => x.id !== r.id)),
      error: (e) => this.errorMateriales.set(mensaje(e, 'No se pudo quitar el reemplazo')),
    });
  }

  private limpiarFormMateriales(): void {
    this.objetivo.set(null);
    this.nuevo.set(null);
    this.errorMateriales.set('');
    this.quitandoId.set(null);
    this.versionForm.update((v) => v + 1);
  }
}

/** Mensaje del backend (string o arreglo del ValidationPipe) o el genérico. */
function mensaje(e: unknown, generico: string): string {
  const m = (e as { error?: { message?: string | string[] } })?.error?.message;
  if (Array.isArray(m)) return m.join('. ');
  return m || generico;
}
