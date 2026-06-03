import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Cliente, CrearClienteDto } from './models/pedidos.models';

@Injectable({ providedIn: 'root' })
export class ClientesApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/clientes`;

  listar() { return this.http.get<Cliente[]>(this.base); }
  obtener(id: number) { return this.http.get<Cliente>(`${this.base}/${id}`); }
  crear(dto: CrearClienteDto) { return this.http.post<Cliente>(this.base, dto); }
}
