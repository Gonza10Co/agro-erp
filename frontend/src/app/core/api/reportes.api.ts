import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { MetaItem, ReporteDiario } from './models/reporte-diario.models';
import { CommercialQuery, CommercialReport } from './models/commercial-report.models';

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

  /** Reporte comercial (pedidos por cliente y mes). Listas como '1,2,3'; vacías no viajan. */
  commercial(q: CommercialQuery) {
    const params: Record<string, string> = { from: q.from, to: q.to, rows: q.rows };
    const list = (k: string, v?: (string | number)[]) => { if (v?.length) params[k] = v.join(','); };
    list('clientIds', q.clientIds);
    list('brandIds', q.brandIds);
    list('referenceIds', q.referenceIds);
    list('lineIds', q.lineIds);
    list('statuses', q.statuses);
    if (q.includeStock) params['includeStock'] = 'true';
    return this.http.get<CommercialReport>(`${environment.apiUrl}/reports/commercial`, { params });
  }
}
