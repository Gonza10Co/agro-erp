import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  ProductoConfiguradoFull, ReferenciaListItem, ReferenciaConfig, BomResuelto, ResolverParams,
} from './models/catalogo.models';
import { Talla } from './models/pedidos.models';

@Injectable({ providedIn: 'root' })
export class CatalogoApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/catalog`;

  listarProductos() { return this.http.get<ProductoConfiguradoFull[]>(`${this.base}/productos`); }
  listarTallas() { return this.http.get<Talla[]>(`${this.base}/tallas`); }

  listarReferencias() { return this.http.get<ReferenciaListItem[]>(`${this.base}/referencias`); }
  configReferencia(id: number) { return this.http.get<ReferenciaConfig>(`${this.base}/referencias/${id}/config`); }

  resolver(p: ResolverParams) {
    let params = new HttpParams()
      .set('referenciaId', p.referenciaId)
      .set('talla', p.talla);
    if (p.marcaId != null) params = params.set('marcaId', p.marcaId);
    for (const o of p.opcionIds ?? []) params = params.append('opcionIds', o);
    return this.http.get<BomResuelto>(`${this.base}/bom/resolve`, { params });
  }
}
