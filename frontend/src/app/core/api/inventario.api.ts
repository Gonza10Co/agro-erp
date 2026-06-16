import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  Bodega,
  InventarioConsolidado,
  InventarioPTRow,
  MovimientoKardex,
  MovimientoMaterialInput,
} from './models/inventario.models';

@Injectable({ providedIn: 'root' })
export class InventarioApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/inventario`;

  crearBodega(dto: { codigo: string; nombre: string; tipo?: string; prioridad?: number }) {
    return this.http.post<Bodega>(`${this.base}/bodegas`, dto);
  }
  registrarStock(dto: { productoConfiguradoId: number; tallaId: number; bodegaId: number; cantidad: number }) {
    return this.http.post<InventarioPTRow>(`${this.base}/pt`, dto);
  }

  consolidado() {
    return this.http.get<InventarioConsolidado>(`${this.base}/consolidado`);
  }

  movimientos(limit?: number) {
    return this.http.get<MovimientoKardex[]>(`${this.base}/movimientos`, {
      params: limit ? { limit } : {},
    });
  }

  movimientoMaterial(dto: MovimientoMaterialInput) {
    return this.http.post<{ id: number }>(`${this.base}/material/movimiento`, dto);
  }
}
