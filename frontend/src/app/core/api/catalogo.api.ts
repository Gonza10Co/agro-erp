import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { ProductoConfiguradoFull } from './models/catalogo.models';
import { Talla } from './models/pedidos.models';

@Injectable({ providedIn: 'root' })
export class CatalogoApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/catalog`;

  listarProductos() { return this.http.get<ProductoConfiguradoFull[]>(`${this.base}/productos`); }
  listarTallas() { return this.http.get<Talla[]>(`${this.base}/tallas`); }
}
