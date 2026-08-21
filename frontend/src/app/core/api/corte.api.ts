import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { FiltrosCorte, OrdenCorteDetalle, OrdenCorteItem, TableroCorte } from './models/corte.models';

@Injectable({ providedIn: 'root' })
export class CorteApi {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  private params(f: FiltrosCorte): HttpParams {
    let p = new HttpParams();
    if (f.lineaId) p = p.set('lineaId', f.lineaId);
    if (f.estado) p = p.set('estado', f.estado);
    if (f.desde) p = p.set('desde', f.desde);
    if (f.hasta) p = p.set('hasta', f.hasta);
    return p;
  }

  tablero(f: FiltrosCorte = {}) {
    return this.http.get<TableroCorte>(`${this.base}/corte/tablero`, { params: this.params(f) });
  }

  listar(f: FiltrosCorte = {}) {
    return this.http.get<OrdenCorteItem[]>(`${this.base}/corte/ordenes`, { params: this.params(f) });
  }

  obtener(id: number) {
    return this.http.get<OrdenCorteDetalle>(`${this.base}/corte/ordenes/${id}`);
  }

  avanzar(id: number, estado: string, cantidades?: Record<number, number>) {
    return this.http.patch<OrdenCorteDetalle>(`${this.base}/corte/ordenes/${id}/estado`, {
      estado,
      cantidades,
    });
  }

  registrarAvance(
    id: number,
    avance: {
      piezasCortadas: number;
      piezasDanadas?: number;
      piezasRepuestas?: number;
      observaciones?: string;
    },
  ) {
    return this.http.post<unknown>(`${this.base}/corte/ordenes/${id}/avances`, avance);
  }
}
