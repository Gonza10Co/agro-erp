import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Despacho, DespachoListItem, DespacharParams } from './models/pedidos.models';

@Injectable({ providedIn: 'root' })
export class DespachosApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/despachos`;

  listar() { return this.http.get<DespachoListItem[]>(this.base); }
  despachar(p: DespacharParams) { return this.http.post<Despacho>(this.base, p); }
}
