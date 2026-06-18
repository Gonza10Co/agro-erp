import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ReferenciasAbmApi, ReferenciaAbm, CrearReferenciaDto } from '../../../core/api/referencias-abm.api';
import { CatalogoApi } from '../../../core/api/catalogo.api';
import { Talla } from '../../../core/api/models/pedidos.models';
import { DrawerComponent } from '../../../shared/ui/drawer/drawer.component';

@Component({
  selector: 'app-referencias-list',
  standalone: true,
  imports: [DrawerComponent, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div><div class="ph-title">Referencias</div></div>
        <div class="page-actions">
          <button class="btn btn-primary" type="button" (click)="abrir()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            Nueva referencia
          </button>
        </div>
      </div>

      @if (cargando()) {
        <div class="card"><div class="card-body">Cargando referencias…</div></div>
      } @else if (referencias().length === 0) {
        <div class="card"><div class="card-body">
          <div class="empty">
            <span class="e-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 7h16M4 12h16M4 17h10"/></svg></span>
            <h4>Sin referencias todavía</h4>
            <p>Creá la primera referencia para empezar a configurar productos.</p>
          </div>
        </div></div>
      } @else {
        <div class="card">
          <div class="table-scroll">
            <table class="data">
              <thead><tr><th>Código</th><th>Nombre interno</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                @for (r of referencias(); track r.id) {
                  <tr>
                    <td class="cell-mono">{{ r.codigo }}</td>
                    <td>{{ r.nombreInterno }}</td>
                    <td>
                      @if (r.activo) {
                        <span class="badge badge-success"><span class="dot"></span>Activa</span>
                      } @else {
                        <span class="badge badge-neutral"><span class="dot"></span>Inactiva</span>
                      }
                    </td>
                    <td class="cell-actions">
                      @if (r.activo) {
                        <button class="btn btn-ghost btn-sm" type="button" (click)="desactivar(r)">Desactivar</button>
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

    <app-drawer [open]="drawerAbierto()" title="Nueva referencia" (closed)="cerrar()">
      <form (ngSubmit)="guardar()">
        <div class="field">
          <label class="label" for="codigo">Código <span class="req">*</span></label>
          <input class="input" id="codigo" name="codigo" [(ngModel)]="codigo" autocomplete="off" />
        </div>
        <div class="field">
          <label class="label" for="nombreInterno">Nombre interno <span class="req">*</span></label>
          <input class="input" id="nombreInterno" name="nombreInterno" [(ngModel)]="nombreInterno" autocomplete="off" />
        </div>
        <div class="field">
          <label class="label" for="tallaMinId">Talla mínima <span class="req">*</span></label>
          <select class="select" id="tallaMinId" name="tallaMinId" [(ngModel)]="tallaMinId">
            <option [ngValue]="undefined">Seleccioná…</option>
            @for (t of tallas(); track t.id) {
              <option [ngValue]="t.id">{{ t.valor }}</option>
            }
          </select>
        </div>
        <div class="field">
          <label class="label" for="tallaMaxId">Talla máxima <span class="req">*</span></label>
          <select class="select" id="tallaMaxId" name="tallaMaxId" [(ngModel)]="tallaMaxId">
            <option [ngValue]="undefined">Seleccioná…</option>
            @for (t of tallas(); track t.id) {
              <option [ngValue]="t.id">{{ t.valor }}</option>
            }
          </select>
        </div>
        @if (error()) { <p style="color:var(--error);font-size:var(--text-sm);margin-bottom:var(--sp-3)">{{ error() }}</p> }
        <button class="btn btn-primary btn-block" type="submit" [class.is-loading]="loading()" [disabled]="loading()">Crear referencia</button>
      </form>
    </app-drawer>
  `,
})
export class ReferenciasListComponent {
  private readonly api = inject(ReferenciasAbmApi);
  private readonly catalogo = inject(CatalogoApi);

  referencias = signal<ReferenciaAbm[]>([]);
  tallas = signal<Talla[]>([]);
  cargando = signal(true);
  drawerAbierto = signal(false);

  codigo = '';
  nombreInterno = '';
  tallaMinId?: number;
  tallaMaxId?: number;
  loading = signal(false);
  error = signal('');

  constructor() {
    this.cargar();
    this.catalogo.listarTallas().subscribe({ next: (ts) => this.tallas.set(ts) });
  }

  cargar(): void {
    this.cargando.set(true);
    this.api.listar().subscribe({
      next: (rs) => { this.referencias.set(rs); this.cargando.set(false); },
      error: () => this.cargando.set(false),
    });
  }

  abrir(): void { this.drawerAbierto.set(true); }
  cerrar(): void { this.drawerAbierto.set(false); }

  guardar(): void {
    if (!this.codigo.trim() || !this.nombreInterno.trim() || this.tallaMinId == null || this.tallaMaxId == null) {
      this.error.set('Código, nombre y rango de tallas son obligatorios');
      return;
    }
    if (this.loading()) return;
    this.error.set('');
    this.loading.set(true);
    const dto: CrearReferenciaDto = {
      codigo: this.codigo.trim(),
      nombreInterno: this.nombreInterno.trim(),
      tallaMinId: this.tallaMinId,
      tallaMaxId: this.tallaMaxId,
    };
    this.api.crear(dto).subscribe({
      next: () => { this.loading.set(false); this.resetForm(); this.cerrar(); this.cargar(); },
      error: (e) => { this.loading.set(false); this.error.set(e?.error?.message ?? 'No se pudo crear la referencia'); },
    });
  }

  desactivar(r: ReferenciaAbm): void {
    this.api.desactivar(r.id).subscribe({ next: () => this.cargar() });
  }

  private resetForm(): void {
    this.codigo = '';
    this.nombreInterno = '';
    this.tallaMinId = undefined;
    this.tallaMaxId = undefined;
  }
}
