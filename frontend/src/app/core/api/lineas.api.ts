import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type Celula = 'CORTE' | 'GUARNICION' | 'ALMACEN' | 'INYECCION' | 'PT';

export interface Linea {
  id: number;
  codigo: string;
  nombre: string;
  celulaInicial: Celula;
  activo: boolean;
}
export interface CrearLineaDto { codigo: string; nombre: string; celulaInicial?: Celula; }
export interface ActualizarLineaDto { nombre?: string; celulaInicial?: Celula; }

@Injectable({ providedIn: 'root' })
export class LineasApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/catalog/lineas`;

  listar() { return this.http.get<Linea[]>(this.base); }
  crear(dto: CrearLineaDto) { return this.http.post<Linea>(this.base, dto); }
  actualizar(id: number, dto: ActualizarLineaDto) { return this.http.patch<Linea>(`${this.base}/${id}`, dto); }
  desactivar(id: number) { return this.http.patch<Linea>(`${this.base}/${id}/desactivar`, {}); }
}
