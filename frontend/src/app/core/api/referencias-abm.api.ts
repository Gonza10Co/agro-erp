import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { inactivas } from './inactivas.params';

export interface ReferenciaAbm {
  id: number;
  codigo: string;
  nombreInterno: string;
  activo: boolean;
  /** Piezas que se cortan por par; null = no informado. */
  piezasPorPar?: number | null;
  ejes?: unknown[];
  marcas?: unknown[];
}

export interface CrearReferenciaDto {
  codigo: string;
  nombreInterno: string;
  tallaMinId: number;
  tallaMaxId: number;
  piezasPorPar?: number;
}

@Injectable({ providedIn: 'root' })
export class ReferenciasAbmApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/catalog/referencias-abm`;

  /** Solo activas por defecto; `incluirInactivas` es opt-in (pantalla de maestros). */
  listar(opts?: { incluirInactivas?: boolean }) { return this.http.get<ReferenciaAbm[]>(this.base, { params: inactivas(opts) }); }
  obtener(id: number) { return this.http.get<ReferenciaAbm>(`${this.base}/${id}`); }
  crear(dto: CrearReferenciaDto) { return this.http.post<ReferenciaAbm>(this.base, dto); }
  actualizar(id: number, dto: Partial<CrearReferenciaDto>) { return this.http.patch<ReferenciaAbm>(`${this.base}/${id}`, dto); }
  desactivar(id: number) { return this.http.patch<ReferenciaAbm>(`${this.base}/${id}/desactivar`, {}); }
  reactivar(id: number) { return this.http.patch<ReferenciaAbm>(`${this.base}/${id}/reactivar`, {}); }
}
