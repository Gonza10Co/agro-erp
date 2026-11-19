import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { OrdenCompra, OrdenProduccion, CrearOCDto, ResumenCosteoOC } from './models/pedidos.models';
import { Proyeccion } from './models/proyeccion.models';
import { PtReassignment, ReassignPtBody, ReassignmentOption, ReleasePtBody } from './models/pt-reassignment.models';

@Injectable({ providedIn: 'root' })
export class PedidosApi {
  private readonly http = inject(HttpClient);
  private readonly oc = `${environment.apiUrl}/pedidos/oc`;
  private readonly op = `${environment.apiUrl}/pedidos/op`;

  crearOC(dto: CrearOCDto) { return this.http.post<OrdenCompra>(this.oc, dto); }
  listarOC() { return this.http.get<OrdenCompra[]>(this.oc); }
  obtenerOC(id: number) { return this.http.get<OrdenCompra>(`${this.oc}/${id}`); }
  obtenerCosteoOC(id: number) { return this.http.get<ResumenCosteoOC>(`${this.oc}/${id}/costeo`); }
  actualizarOC(id: number, dto: CrearOCDto) { return this.http.patch<OrdenCompra>(`${this.oc}/${id}`, dto); }
  /** La fecha prometida se cambia en cualquier estado del pedido; null la borra. */
  cambiarFechaEntregaOC(id: number, fechaEntrega: string | null) { return this.http.patch<OrdenCompra>(`${this.oc}/${id}/fecha-entrega`, { fechaEntrega }); }
  /** El día en que el cliente puso el pedido (no futuro); null la borra. */
  cambiarFechaPedidoClienteOC(id: number, fechaPedidoCliente: string | null) { return this.http.patch<OrdenCompra>(`${this.oc}/${id}/fecha-pedido-cliente`, { fechaPedidoCliente }); }
  confirmarOC(id: number) { return this.http.post<OrdenCompra>(`${this.oc}/${id}/confirmar`, {}); }
  eliminarOC(id: number) { return this.http.delete<void>(`${this.oc}/${id}`); }

  generarOP(ocId: number) { return this.http.post<OrdenProduccion>(`${this.op}/desde-oc/${ocId}`, {}); }
  listarOP() { return this.http.get<OrdenProduccion[]>(this.op); }
  obtenerOP(id: number) { return this.http.get<OrdenProduccion>(`${this.op}/${id}`); }
  anularOP(id: number) { return this.http.post<OrdenProduccion>(`${this.op}/${id}/anular`, {}); }

  /** Lo reservado de la OP y a qué pedidos se puede pasar (solo gerencia). */
  reassignmentOptions(opId: number) { return this.http.get<ReassignmentOption[]>(`${this.op}/${opId}/reassignment-options`); }
  /** Pares que la OP cedió, liberó o recibió. */
  reassignments(opId: number) { return this.http.get<PtReassignment[]>(`${this.op}/${opId}/reassignments`); }
  /** Pasar pares reservados de esta OP a otra (solo gerencia, motivo obligatorio). */
  reassignPairs(opId: number, body: ReassignPtBody) { return this.http.post<PtReassignment>(`${this.op}/${opId}/reassign`, body); }
  /** Liberar pares reservados de esta OP: quedan libres en bodega para otra venta. */
  releasePairs(opId: number, body: ReleasePtBody) { return this.http.post<PtReassignment>(`${this.op}/${opId}/release`, body); }

  /** Pedidos vivos contra la capacidad de la planta (solo lectura). */
  proyeccion() { return this.http.get<Proyeccion>(`${environment.apiUrl}/pedidos/proyeccion`); }
}
