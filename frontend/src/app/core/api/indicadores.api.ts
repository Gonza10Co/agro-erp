import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Indicadores } from './models/indicadores.models';

@Injectable({ providedIn: 'root' })
export class IndicadoresApi {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  indicadores() {
    return this.http.get<Indicadores>(`${this.base}/indicadores`);
  }
}
