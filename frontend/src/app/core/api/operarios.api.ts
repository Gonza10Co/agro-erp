import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Celula } from './models/fabricacion.models';

/** Persona de planta. NO tiene login — queda firmada en cada escaneo del MES. */
export interface Operario {
  id: number;
  nombre: string;
  celula: Celula;
  activo: boolean;
}

export interface CrearOperarioDto {
  nombre: string;
  celula: Celula;
}

export interface ActualizarOperarioDto {
  nombre?: string;
  celula?: Celula;
  activo?: boolean;
}

@Injectable({ providedIn: 'root' })
export class OperariosApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/operarios`;

  /**
   * Sin `soloActivos` trae también a los retirados — es lo que necesita la
   * pantalla de administración para poder reactivar a quien volvió.
   */
  listar(opts?: { celula?: Celula; soloActivos?: boolean }) {
    let params = new HttpParams();
    if (opts?.celula) params = params.set('celula', opts.celula);
    if (opts?.soloActivos) params = params.set('soloActivos', 'true');
    return this.http.get<Operario[]>(this.base, { params });
  }

  crear(dto: CrearOperarioDto) { return this.http.post<Operario>(this.base, dto); }
  actualizar(id: number, dto: ActualizarOperarioDto) {
    return this.http.patch<Operario>(`${this.base}/${id}`, dto);
  }
}
