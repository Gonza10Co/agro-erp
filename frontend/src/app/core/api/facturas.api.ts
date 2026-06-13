import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Factura, FacturaListItem, FacturarParams } from './models/pedidos.models';

@Injectable({ providedIn: 'root' })
export class FacturasApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/facturas`;

  listar() { return this.http.get<FacturaListItem[]>(this.base); }
  obtener(id: number) { return this.http.get<Factura>(`${this.base}/${id}`); }
  facturar(p: FacturarParams) { return this.http.post<Factura>(this.base, p); }
}
