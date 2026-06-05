import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Requerimiento } from './models/compras.models';

@Injectable({ providedIn: 'root' })
export class ComprasApi {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  calcular(opId: number) {
    return this.http.post<Requerimiento>(`${this.base}/ops/${opId}/requerimiento`, {});
  }
  obtener(id: number) {
    return this.http.get<Requerimiento>(`${this.base}/requerimientos/${id}`);
  }
}
