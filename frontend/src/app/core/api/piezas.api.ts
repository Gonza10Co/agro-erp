import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

/** Pieza del despiece de la bota: capellada, lateral, talón, lengüeta… */
export interface Pieza {
  id: number;
  codigo: string;
  nombre: string;
  orden: number;
  activo: boolean;
}

export interface CrearPiezaDto {
  codigo: string;
  nombre: string;
  orden?: number;
}

export interface ActualizarPiezaDto {
  nombre?: string;
  orden?: number;
}

@Injectable({ providedIn: 'root' })
export class PiezasApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/catalog/piezas`;

  listar() { return this.http.get<Pieza[]>(this.base); }
  crear(dto: CrearPiezaDto) { return this.http.post<Pieza>(this.base, dto); }
  actualizar(id: number, dto: ActualizarPiezaDto) { return this.http.patch<Pieza>(`${this.base}/${id}`, dto); }
  desactivar(id: number) { return this.http.patch<Pieza>(`${this.base}/${id}/desactivar`, {}); }
}
