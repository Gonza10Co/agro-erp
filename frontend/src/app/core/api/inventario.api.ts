import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class InventarioApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/inventario`;

  crearBodega(dto: { codigo: string; nombre: string; tipo?: string; prioridad?: number }) {
    return this.http.post(`${this.base}/bodegas`, dto);
  }
  registrarStock(dto: { productoConfiguradoId: number; tallaId: number; bodegaId: number; cantidad: number }) {
    return this.http.post(`${this.base}/pt`, dto);
  }
}
