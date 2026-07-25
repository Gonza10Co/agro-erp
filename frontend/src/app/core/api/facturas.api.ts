import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Factura, FacturaListItem, FacturarParams } from './models/pedidos.models';
import {
  FacturarServicioParams,
  ServicioCatalogo,
  SugerenciaServicio,
} from './models/servicios.models';

@Injectable({ providedIn: 'root' })
export class FacturasApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/facturas`;

  listar() { return this.http.get<FacturaListItem[]>(this.base); }
  obtener(id: number) { return this.http.get<Factura>(`${this.base}/${id}`); }
  facturar(p: FacturarParams) { return this.http.post<Factura>(this.base, p); }

  // ── Facturas de servicio (maquila / mantenimiento) ──
  catalogoServicios() {
    return this.http.get<ServicioCatalogo[]>(`${this.base}/servicio/catalogo`);
  }

  /** Pares que la línea llevó a PT en el mes: prellena la cantidad a facturar. */
  sugerenciaServicio(lineaId: number, anio: number, mes: number) {
    const params = new HttpParams()
      .set('lineaId', lineaId)
      .set('anio', anio)
      .set('mes', mes);
    return this.http.get<SugerenciaServicio>(`${this.base}/servicio/sugerencia`, { params });
  }

  facturarServicio(p: FacturarServicioParams) {
    return this.http.post<Factura>(`${this.base}/servicio`, p);
  }
}
