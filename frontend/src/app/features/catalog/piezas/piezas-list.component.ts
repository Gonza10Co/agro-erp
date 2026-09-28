import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PiezasApi, Pieza } from '../../../core/api/piezas.api';
import { DrawerComponent } from '../../../shared/ui/drawer/drawer.component';
import { ConfirmarAccionComponent } from '../../../shared/ui/confirmar-accion/confirmar-accion.component';

/**
 * Despiece de la bota. Cada línea del BOM puede apuntar a una pieza para decir
 * "esta micropiel es la del lateral" y darle su propio consumo por talla.
 */
@Component({
  selector: 'app-piezas-list',
  standalone: true,
  imports: [FormsModule, DrawerComponent, ConfirmarAccionComponent],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <div class="ph-title">Piezas de la bota</div>
          <div class="cell-sub">El despiece: a qué parte de la bota va cada material.</div>
        </div>
        <div class="page-actions">
          <label class="check">
            <input type="checkbox" [checked]="mostrarInactivas()" (change)="alternarInactivas()" />
            <span class="box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5L20 7"/></svg></span>
            Mostrar archivadas
          </label>
          <button class="btn btn-primary" type="button" (click)="abrirNueva()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            Nueva pieza
          </button>
        </div>
      </div>

      @if (cargando()) {
        <div class="card"><div class="card-body">Cargando piezas…</div></div>
      } @else if (piezas().length === 0) {
        <div class="card"><div class="card-body">
          <div class="empty">
            <h4>Sin piezas todavía</h4>
            <p>Crea las piezas del despiece: capellada, lateral, talón, lengüeta…</p>
          </div>
        </div></div>
      } @else {
        <div class="card">
          <div class="table-scroll">
            <table class="data">
              <thead><tr><th>Código</th><th>Nombre</th><th class="num">Orden</th><th></th></tr></thead>
              <tbody>
                @for (p of piezas(); track p.id) {
                  <tr [class.is-inactive]="!p.activo">
                    <td class="cell-mono">{{ p.codigo }}</td>
                    <td>
                      {{ p.nombre }}
                      @if (!p.activo) { <span class="badge badge-neutral" style="margin-left:var(--sp-2)"><span class="dot"></span>Archivada</span> }
                    </td>
                    <td class="num cell-sub">{{ p.orden }}</td>
                    <td class="cell-actions" style="text-align:right;white-space:nowrap">
                      <button class="btn btn-ghost btn-sm" type="button" (click)="editar(p)">Editar</button>
                      @if (p.activo) {
                        <app-confirmar-accion
                          [abierto]="confirmandoId() === p.id"
                          [pregunta]="'¿Archivar ' + p.nombre + '?'"
                          etiqueta="Archivar"
                          textoConfirmar="Sí, archivar"
                          (pedir)="confirmandoId.set(p.id)"
                          (cancelar)="confirmandoId.set(null)"
                          (confirmar)="desactivar(p)" />
                      } @else {
                        <button class="btn btn-ghost btn-sm" type="button" (click)="reactivar(p)">Reactivar</button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
      @if (error()) { <p class="msg-err">{{ error() }}</p> }
    </div>

    <app-drawer [open]="abierto()" [title]="editando() ? 'Editar pieza' : 'Nueva pieza'" (closed)="cerrar()">
      <div class="field">
        <label class="label">Código</label>
        <input class="input" name="codigo" [(ngModel)]="codigo" [disabled]="editando() !== null" autocomplete="off" placeholder="CAPELLADA" />
        <small class="hint">Llave del catálogo; no se cambia después.</small>
      </div>
      <div class="field">
        <label class="label">Nombre</label>
        <input class="input" name="nombre" [(ngModel)]="nombre" autocomplete="off" placeholder="Capellada" />
      </div>
      <div class="field">
        <label class="label">Orden</label>
        <input class="input" name="orden" type="number" min="0" [(ngModel)]="orden" />
        <small class="hint">Solo afecta cómo se listan (de la puntera hacia atrás).</small>
      </div>
      @if (errorDrawer()) { <p class="msg-err">{{ errorDrawer() }}</p> }
      <button class="btn btn-primary btn-block" type="button" [disabled]="guardando()" (click)="guardar()">
        {{ editando() ? 'Guardar cambios' : 'Crear pieza' }}
      </button>
    </app-drawer>
  `,
  styles: [`
    .hint{display:block;color:var(--text-muted);font-size:var(--text-xs);margin-top:var(--sp-2)}
    .msg-err{color:var(--error);font-size:var(--text-sm);margin-top:var(--sp-3)}
    .num{text-align:right}
  `],
})
export class PiezasListComponent implements OnInit {
  private readonly api = inject(PiezasApi);

  piezas = signal<Pieza[]>([]);
  cargando = signal(false);
  guardando = signal(false);
  abierto = signal(false);
  editando = signal<Pieza | null>(null);
  /** Casilla "Mostrar archivadas": pide también las archivadas para poder reactivarlas. */
  mostrarInactivas = signal(false);
  /** Fila que está pidiendo "¿Desactivar…?" (una a la vez). */
  confirmandoId = signal<number | null>(null);
  error = signal('');
  errorDrawer = signal('');

  codigo = '';
  nombre = '';
  orden = 100;

  ngOnInit(): void { this.cargar(); }

  private cargar(): void {
    this.cargando.set(true);
    this.api.listar({ incluirInactivas: this.mostrarInactivas() }).subscribe({
      next: (p) => { this.piezas.set(p); this.cargando.set(false); },
      error: () => { this.cargando.set(false); this.error.set('No se pudieron cargar las piezas'); },
    });
  }

  abrirNueva(): void {
    this.editando.set(null);
    this.codigo = ''; this.nombre = ''; this.orden = 100;
    this.errorDrawer.set('');
    this.abierto.set(true);
  }

  editar(p: Pieza): void {
    this.editando.set(p);
    this.codigo = p.codigo; this.nombre = p.nombre; this.orden = p.orden;
    this.errorDrawer.set('');
    this.abierto.set(true);
  }

  cerrar(): void { this.abierto.set(false); }

  guardar(): void {
    if (!this.nombre.trim() || (!this.editando() && !this.codigo.trim())) {
      this.errorDrawer.set('Código y nombre son obligatorios');
      return;
    }
    if (this.guardando()) return;
    this.guardando.set(true);
    this.errorDrawer.set('');
    const ed = this.editando();
    const op = ed
      ? this.api.actualizar(ed.id, { nombre: this.nombre.trim(), orden: this.orden })
      : this.api.crear({ codigo: this.codigo.trim(), nombre: this.nombre.trim(), orden: this.orden });
    op.subscribe({
      next: () => { this.guardando.set(false); this.abierto.set(false); this.cargar(); },
      error: (e) => { this.guardando.set(false); this.errorDrawer.set(e?.error?.message ?? 'No se pudo guardar la pieza'); },
    });
  }

  alternarInactivas(): void {
    this.mostrarInactivas.update((v) => !v);
    this.cargar();
  }

  reactivar(p: Pieza): void {
    this.error.set('');
    this.api.reactivar(p.id).subscribe({
      next: () => this.cargar(),
      error: (e) => this.error.set(e?.error?.message ?? 'No se pudo reactivar la pieza'),
    });
  }

  /** Solo se llama desde "Sí, archivar": el primer clic únicamente abre la confirmación. */
  desactivar(p: Pieza): void {
    this.confirmandoId.set(null);
    this.error.set('');
    this.api.desactivar(p.id).subscribe({
      next: () => this.cargar(),
      // El backend rechaza archivar una pieza que alguna receta esté usando.
      error: (e) => this.error.set(e?.error?.message ?? 'No se pudo archivar la pieza'),
    });
  }
}
