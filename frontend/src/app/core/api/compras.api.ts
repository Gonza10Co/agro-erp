import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  OcpDetalle,
  OcpResumen,
  RegistrarDevolucionDto,
  RegistrarRecepcionDto,
  Requerimiento,
  ResultadoGenerarOrdenes,
} from './models/compras.models';

@Injectable({ providedIn: 'root' })
export class ComprasApi {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  calcular(opId: number) {
    return this.http.post<Requerimiento>(`${this.base}/ops/${opId}/requerimiento`, {});
  }
  obtener(id: number) {
    return this.http.get<Requerimiento>(`${this.base}/requerimientos/${id}`);
  }

  // ── Demo 13: OCP a proveedor ──
  generarOrdenes(reqId: number) {
    return this.http.post<ResultadoGenerarOrdenes>(
      `${this.base}/requerimientos/${reqId}/ordenes`,
      {},
    );
  }
  listarOrdenes() {
    return this.http.get<OcpResumen[]>(`${this.base}/compras/ordenes`);
  }
  obtenerOrden(id: number) {
    return this.http.get<OcpDetalle>(`${this.base}/compras/ordenes/${id}`);
  }
  registrarRecepcion(ocpId: number, dto: RegistrarRecepcionDto) {
    return this.http.post<{ id: number; consecutivo: number; estado: string }>(
      `${this.base}/compras/ordenes/${ocpId}/recepciones`,
      dto,
    );
  }
  registrarDevolucion(ocpId: number, dto: RegistrarDevolucionDto) {
    return this.http.post<{ id: number; consecutivo: number }>(
      `${this.base}/compras/ordenes/${ocpId}/devoluciones`,
      dto,
    );
  }
}
