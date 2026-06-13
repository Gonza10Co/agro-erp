import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { CarteraItem, CarteraCliente, RegistrarPagoParams } from './models/pedidos.models';

@Injectable({ providedIn: 'root' })
export class CarteraApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/cartera`;

  listar() { return this.http.get<CarteraItem[]>(this.base); }
  obtenerCliente(id: number) { return this.http.get<CarteraCliente>(`${this.base}/cliente/${id}`); }
  registrarPago(p: RegistrarPagoParams) { return this.http.post<{ facturaId: number; saldo: number }>(`${this.base}/pagos`, p); }
}
