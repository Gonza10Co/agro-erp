import { Component, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientesApi } from '../../core/api/clientes.api';
import { Cliente, CrearClienteDto, TipoCredito } from '../../core/api/models/pedidos.models';
import { SedesClienteComponent } from './sedes-cliente.component';

@Component({
  selector: 'app-cliente-form',
  standalone: true,
  imports: [FormsModule, SedesClienteComponent],
  template: `
    <form (ngSubmit)="guardar()">
      <div class="field">
        <label class="label" for="nit">NIT <span class="req">*</span></label>
        <input class="input" id="nit" name="nit" [(ngModel)]="nit" autocomplete="off" />
      </div>
      <div class="field">
        <label class="label" for="nombre">Nombre <span class="req">*</span></label>
        <input class="input" id="nombre" name="nombre" [(ngModel)]="nombre" autocomplete="off" />
      </div>
      <div class="field">
        <label class="label" for="ciudad">Ciudad</label>
        <input class="input" id="ciudad" name="ciudad" [(ngModel)]="ciudad" autocomplete="off" />
      </div>
      <div class="field">
        <label class="label" for="telefono">Teléfono</label>
        <input class="input" id="telefono" name="telefono" [(ngModel)]="telefono" autocomplete="off" />
      </div>
      <div class="field">
        <label class="label" for="direccion">Dirección fiscal</label>
        <input class="input" id="direccion" name="direccion" [(ngModel)]="direccion" autocomplete="off" />
        <small style="color:var(--text-muted);font-size:var(--text-xs)">La de la factura. A dónde se entrega se define abajo, en las sedes.</small>
      </div>
      <div class="field">
        <label class="label" for="tipoCredito">Tipo de crédito</label>
        <select class="select" id="tipoCredito" name="tipoCredito" [(ngModel)]="tipoCredito">
          <option value="CONTADO">Contado</option>
          <option value="D30">30 días</option>
          <option value="D60">60 días</option>
          <option value="D90">90 días</option>
        </select>
      </div>
      <div class="field">
        <label class="label" for="cupo">Cupo (COP)</label>
        <input class="input" id="cupo" name="cupo" type="number" [(ngModel)]="cupo" />
      </div>
      @if (error()) { <p style="color:var(--error);font-size:var(--text-sm);margin-bottom:var(--sp-3)">{{ error() }}</p> }
      <button class="btn btn-primary btn-block" type="submit" [class.is-loading]="loading()" [disabled]="loading()">
        {{ editar() ? 'Guardar cambios' : 'Crear cliente' }}
      </button>
    </form>

    <!-- Las sedes necesitan un cliente ya creado (cuelgan de su id). -->
    @if (editar(); as c) {
      <app-sedes-cliente [clienteId]="c.id" />
    } @else {
      <p style="color:var(--text-muted);font-size:var(--text-xs);margin-top:var(--sp-3)">
        Crea el cliente y luego podrás agregarle sus sedes de entrega.
      </p>
    }
  `,
})
export class ClienteFormComponent {
  private readonly api = inject(ClientesApi);
  // Si viene un cliente, el form entra en modo edición (el NIT no se cambia).
  editar = input<Cliente | null>(null);
  created = output<Cliente>();

  nit = '';
  nombre = '';
  ciudad = '';
  telefono = '';
  direccion = '';
  tipoCredito: TipoCredito = 'CONTADO';
  cupo?: number;
  loading = signal(false);
  error = signal('');

  constructor() {
    effect(() => {
      const c = this.editar();
      if (c) {
        this.nit = c.nit;
        this.nombre = c.nombre;
        this.ciudad = c.ciudad ?? '';
        this.telefono = c.telefono ?? '';
        this.direccion = c.direccion ?? '';
        this.tipoCredito = c.tipoCredito;
        this.cupo = c.cupo != null ? Number(c.cupo) : undefined;
      }
    });
  }

  guardar(): void {
    if (!this.nit.trim() || !this.nombre.trim()) {
      this.error.set('NIT y Nombre son obligatorios');
      return;
    }
    if (this.loading()) return;
    this.error.set('');
    this.loading.set(true);
    const editando = this.editar();
    const dto: CrearClienteDto = {
      nit: this.nit.trim(),
      nombre: this.nombre.trim(),
      ciudad: this.ciudad.trim() || undefined,
      telefono: this.telefono.trim() || undefined,
      direccion: this.direccion.trim() || undefined,
      tipoCredito: this.tipoCredito,
      cupo: this.cupo,
    };
    const op = editando
      ? this.api.actualizar(editando.id, {
          nombre: dto.nombre,
          ciudad: dto.ciudad,
          telefono: dto.telefono,
          direccion: dto.direccion,
          tipoCredito: dto.tipoCredito,
          cupo: dto.cupo,
        })
      : this.api.crear(dto);
    op.subscribe({
      next: (c) => { this.loading.set(false); this.created.emit(c); },
      error: (e) => { this.loading.set(false); this.error.set(e?.error?.message ?? 'No se pudo guardar el cliente'); },
    });
  }
}
