import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type TipoMarca = 'PROPIA' | 'MAQUILA';

export interface Marca {
  id: number;
  codigo: string;
  nombre: string;
  tipo: TipoMarca;
  clienteId?: number | null;
  activo: boolean;
}

export interface CrearMarcaDto {
  codigo: string;
  nombre: string;
  tipo: TipoMarca;
  clienteId?: number;
}

export interface ActualizarMarcaDto {
  nombre?: string;
  tipo?: TipoMarca;
  clienteId?: number;
}

@Injectable({ providedIn: 'root' })
export class MarcasApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/catalog/marcas`;

  listar() { return this.http.get<Marca[]>(this.base); }
  crear(dto: CrearMarcaDto) { return this.http.post<Marca>(this.base, dto); }
  actualizar(id: number, dto: ActualizarMarcaDto) { return this.http.patch<Marca>(`${this.base}/${id}`, dto); }
  desactivar(id: number) { return this.http.patch<Marca>(`${this.base}/${id}/desactivar`, {}); }
}
