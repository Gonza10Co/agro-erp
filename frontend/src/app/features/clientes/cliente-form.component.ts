import { Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientesApi } from '../../core/api/clientes.api';
import { Cliente, CrearClienteDto, TipoCredito } from '../../core/api/models/pedidos.models';

@Component({
  selector: 'app-cliente-form',
  standalone: true,
  imports: [FormsModule],
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
      <button class="btn btn-primary btn-block" type="submit" [class.is-loading]="loading()" [disabled]="loading()">Crear cliente</button>
    </form>
  `,
})
export class ClienteFormComponent {
  private readonly api = inject(ClientesApi);
  created = output<Cliente>();

  nit = '';
  nombre = '';
  ciudad = '';
  tipoCredito: TipoCredito = 'CONTADO';
  cupo?: number;
  loading = signal(false);
  error = signal('');

  guardar(): void {
    if (!this.nit.trim() || !this.nombre.trim()) {
      this.error.set('NIT y Nombre son obligatorios');
      return;
    }
    if (this.loading()) return;
    this.error.set('');
    this.loading.set(true);
    const dto: CrearClienteDto = {
      nit: this.nit.trim(),
      nombre: this.nombre.trim(),
      ciudad: this.ciudad.trim() || undefined,
      tipoCredito: this.tipoCredito,
      cupo: this.cupo,
    };
    this.api.crear(dto).subscribe({
      next: (c) => { this.loading.set(false); this.created.emit(c); },
      error: (e) => { this.loading.set(false); this.error.set(e?.error?.message ?? 'No se pudo crear el cliente'); },
    });
  }
}
