import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  Cliente,
  CrearClienteDto,
  CrearSedeDto,
  SedeCliente,
} from './models/pedidos.models';

@Injectable({ providedIn: 'root' })
export class ClientesApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/clientes`;

  listar() { return this.http.get<Cliente[]>(this.base); }
  obtener(id: number) { return this.http.get<Cliente>(`${this.base}/${id}`); }
  crear(dto: CrearClienteDto) { return this.http.post<Cliente>(this.base, dto); }
  actualizar(id: number, dto: Partial<CrearClienteDto>) { return this.http.patch<Cliente>(`${this.base}/${id}`, dto); }
  desactivar(id: number) { return this.http.patch<Cliente>(`${this.base}/${id}/desactivar`, {}); }

  // Sedes de entrega del cliente.
  listarSedes(clienteId: number) { return this.http.get<SedeCliente[]>(`${this.base}/${clienteId}/sedes`); }
  crearSede(clienteId: number, dto: CrearSedeDto) { return this.http.post<SedeCliente>(`${this.base}/${clienteId}/sedes`, dto); }
  actualizarSede(clienteId: number, sedeId: number, dto: Partial<CrearSedeDto>) { return this.http.patch<SedeCliente>(`${this.base}/${clienteId}/sedes/${sedeId}`, dto); }
  desactivarSede(clienteId: number, sedeId: number) { return this.http.patch<SedeCliente>(`${this.base}/${clienteId}/sedes/${sedeId}/desactivar`, {}); }
}
