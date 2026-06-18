import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface ReferenciaAbm {
  id: number;
  codigo: string;
  nombreInterno: string;
  activo: boolean;
  ejes?: unknown[];
  marcas?: unknown[];
}

export interface CrearReferenciaDto {
  codigo: string;
  nombreInterno: string;
  tallaMinId: number;
  tallaMaxId: number;
}

@Injectable({ providedIn: 'root' })
export class ReferenciasAbmApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/catalog/referencias-abm`;

  listar() { return this.http.get<ReferenciaAbm[]>(this.base); }
  obtener(id: number) { return this.http.get<ReferenciaAbm>(`${this.base}/${id}`); }
  crear(dto: CrearReferenciaDto) { return this.http.post<ReferenciaAbm>(this.base, dto); }
  actualizar(id: number, dto: Partial<CrearReferenciaDto>) { return this.http.patch<ReferenciaAbm>(`${this.base}/${id}`, dto); }
  desactivar(id: number) { return this.http.patch<ReferenciaAbm>(`${this.base}/${id}/desactivar`, {}); }
}
