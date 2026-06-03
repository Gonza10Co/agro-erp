import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { OrdenCompra, OrdenProduccion, CrearOCDto } from './models/pedidos.models';

@Injectable({ providedIn: 'root' })
export class PedidosApi {
  private readonly http = inject(HttpClient);
  private readonly oc = `${environment.apiUrl}/pedidos/oc`;
  private readonly op = `${environment.apiUrl}/pedidos/op`;

  crearOC(dto: CrearOCDto) { return this.http.post<OrdenCompra>(this.oc, dto); }
  listarOC() { return this.http.get<OrdenCompra[]>(this.oc); }
  obtenerOC(id: number) { return this.http.get<OrdenCompra>(`${this.oc}/${id}`); }
  confirmarOC(id: number) { return this.http.post<OrdenCompra>(`${this.oc}/${id}/confirmar`, {}); }

  generarOP(ocId: number) { return this.http.post<OrdenProduccion>(`${this.op}/desde-oc/${ocId}`, {}); }
  listarOP() { return this.http.get<OrdenProduccion[]>(this.op); }
  obtenerOP(id: number) { return this.http.get<OrdenProduccion>(`${this.op}/${id}`); }
  anularOP(id: number) { return this.http.post<OrdenProduccion>(`${this.op}/${id}/anular`, {}); }
}
