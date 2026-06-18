import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface Opcion {
  id: number;
  codigo: string;
  nombre: string;
  activo: boolean;
}

export interface GrupoOpcion {
  id: number;
  codigo: string;
  nombre: string;
  obligatorio: boolean;
  orden: number;
  opciones: Opcion[];
}

export interface CrearGrupoDto {
  codigo: string;
  nombre: string;
  obligatorio?: boolean;
  orden?: number;
}

export interface ActualizarGrupoDto {
  nombre?: string;
  obligatorio?: boolean;
  orden?: number;
}

export interface CrearOpcionDto {
  codigo: string;
  nombre: string;
}

@Injectable({ providedIn: 'root' })
export class GruposOpcionApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/catalog`;

  listar() {
    return this.http.get<GrupoOpcion[]>(`${this.base}/grupos-opcion`);
  }

  crearGrupo(dto: CrearGrupoDto) {
    return this.http.post<GrupoOpcion>(`${this.base}/grupos-opcion`, dto);
  }

  actualizarGrupo(id: number, dto: ActualizarGrupoDto) {
    return this.http.patch<GrupoOpcion>(`${this.base}/grupos-opcion/${id}`, dto);
  }

  agregarOpcion(grupoId: number, dto: CrearOpcionDto) {
    return this.http.post<Opcion>(`${this.base}/grupos-opcion/${grupoId}/opciones`, dto);
  }

  desactivarOpcion(opcionId: number) {
    return this.http.patch<Opcion>(`${this.base}/grupos-opcion/opciones/${opcionId}/desactivar`, {});
  }
}
