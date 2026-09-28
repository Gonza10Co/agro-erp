import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  Bodega,
  FilaAjusteMp,
  FilaAjusteMpRevisada,
  FilaAjustePt,
  FilaPlantillaMp,
  ResumenAjusteMp,
  FilaAjustePtRevisada,
  FilaPlantillaPt,
  ResumenAjustePt,
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

  consolidado(lineaId?: number) {
    return this.http.get<InventarioConsolidado>(`${this.base}/consolidado`, {
      params: lineaId ? { lineaId } : {},
    });
  }

  movimientos(limit?: number) {
    return this.http.get<MovimientoKardex[]>(`${this.base}/movimientos`, {
      params: limit ? { limit } : {},
    });
  }

  plantillaAjustePt() {
    return this.http.get<FilaPlantillaPt[]>(`${this.base}/pt/plantilla`);
  }
  previsualizarAjustePt(filas: FilaAjustePt[]) {
    return this.http.post<{ filas: FilaAjustePtRevisada[]; resumen: ResumenAjustePt }>(
      `${this.base}/pt/ajuste/previsualizar`,
      { filas },
    );
  }
  aplicarAjustePt(filas: FilaAjustePt[], observaciones?: string) {
    return this.http.post<{ referencia: string; resumen: ResumenAjustePt }>(
      `${this.base}/pt/ajuste`,
      { filas, observaciones },
    );
  }

  plantillaAjusteMp() {
    return this.http.get<FilaPlantillaMp[]>(`${this.base}/material/plantilla`);
  }
  previsualizarAjusteMp(filas: FilaAjusteMp[]) {
    return this.http.post<{ filas: FilaAjusteMpRevisada[]; resumen: ResumenAjusteMp }>(
      `${this.base}/material/ajuste/previsualizar`,
      { filas },
    );
  }
  aplicarAjusteMp(filas: FilaAjusteMp[], observaciones?: string) {
    return this.http.post<{ referencia: string; resumen: ResumenAjusteMp }>(
      `${this.base}/material/ajuste`,
      { filas, observaciones },
    );
  }

  movimientoMaterial(dto: MovimientoMaterialInput) {
    return this.http.post<{ id: number }>(`${this.base}/material/movimiento`, dto);
  }
}
