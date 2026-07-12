import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { MetaItem, ReporteDiario } from './models/reporte-diario.models';

@Injectable({ providedIn: 'root' })
export class ReportesApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/reportes`;

  // lineaId opcional: sin él, el reporte agrega toda la fábrica (metas globales).
  diario(anio: number, mes: number, lineaId?: number) {
    return this.http.get<ReporteDiario>(`${this.base}/diario`, {
      params: { anio, mes, ...(lineaId != null ? { lineaId } : {}) },
    });
  }

  metas(anio: number, mes: number, lineaId?: number) {
    return this.http.get<MetaItem[]>(`${this.base}/metas`, {
      params: { anio, mes, ...(lineaId != null ? { lineaId } : {}) },
    });
  }

  guardarMetas(anio: number, mes: number, items: MetaItem[], lineaId?: number) {
    return this.http.put<MetaItem[]>(`${this.base}/metas`, { items }, {
      params: { anio, mes, ...(lineaId != null ? { lineaId } : {}) },
    });
  }
}
