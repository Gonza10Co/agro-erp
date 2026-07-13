import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  OFGenerada, OFListItem, OFDetalle, ParTablero, ParDetalle, Operario, Maquina,
} from './models/fabricacion.models';

@Injectable({ providedIn: 'root' })
export class FabricacionApi {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  generarOF(opId: number) {
    return this.http.post<OFGenerada>(`${this.base}/fabricacion/of`, { opId });
  }
  listarOF() {
    return this.http.get<OFListItem[]>(`${this.base}/fabricacion/of`);
  }
  obtenerOF(id: number) {
    return this.http.get<OFDetalle>(`${this.base}/fabricacion/of/${id}`);
  }
  avanzar(codigo: string, operarioId: number, maquinaId: number) {
    return this.http.post<unknown>(
      `${this.base}/fabricacion/par/${codigo}/avanzar`,
      { operarioId, maquinaId },
    );
  }
  par(codigo: string) {
    return this.http.get<ParDetalle>(`${this.base}/fabricacion/par/${codigo}`);
  }
  tablero(ofId?: number) {
    let params = new HttpParams();
    if (ofId != null) params = params.set('ofId', ofId);
    return this.http.get<ParTablero[]>(`${this.base}/fabricacion/tablero`, { params });
  }
  operarios(celula?: string) {
    let params = new HttpParams();
    if (celula) params = params.set('celula', celula);
    return this.http.get<Operario[]>(`${this.base}/fabricacion/operarios`, { params });
  }
  maquinas(celula?: string) {
    let params = new HttpParams();
    if (celula) params = params.set('celula', celula);
    return this.http.get<Maquina[]>(`${this.base}/fabricacion/maquinas`, { params });
  }
}
