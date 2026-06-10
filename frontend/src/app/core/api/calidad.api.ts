import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { IndicadoresCalidad, ReporteResultado, TipoDano } from './models/calidad.models';

@Injectable({ providedIn: 'root' })
export class CalidadApi {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  tiposDano() {
    return this.http.get<TipoDano[]>(`${this.base}/calidad/tipos-dano`);
  }
  reportar(codigo: string, body: { tipoDanoId: number; operarioId: number; descripcion?: string }) {
    return this.http.post<ReporteResultado>(
      `${this.base}/calidad/pares/${codigo}/incidencias`,
      body,
    );
  }
  indicadores() {
    return this.http.get<IndicadoresCalidad>(`${this.base}/calidad/indicadores`);
  }
}
