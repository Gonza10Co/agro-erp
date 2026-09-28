import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { inactivas } from './inactivas.params';

export type OrigenMaterial = 'COMPRADO' | 'FABRICADO';
export type ClaseBom = 'DIRECTO_CURVA' | 'DIRECTO_FIJO' | 'INDIRECTO';

export interface Material {
  id: number;
  codigo: string;
  nombreCanonico: string;
  origen: OrigenMaterial;
  unidad: string;
  /** Viene del listado de maestros; los consumidores viejos no lo necesitan. */
  activo?: boolean;
}

export interface CrearMaterialDto {
  codigo: string;
  nombreCanonico: string;
  categoriaId: number;
  unidadMedidaId: number;
  origen: OrigenMaterial;
  claseBom: ClaseBom;
  proveedorId?: number;
}

@Injectable({ providedIn: 'root' })
export class MaterialesApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/catalog`;

  /** Solo activas por defecto; `incluirInactivas` es opt-in (pantalla de maestros). */
  listar(opts?: { incluirInactivas?: boolean }) {
    return this.http.get<Material[]>(`${this.base}/materiales`, { params: inactivas(opts) });
  }
  crear(dto: CrearMaterialDto) { return this.http.post<Material>(`${this.base}/materiales`, dto); }
  actualizar(id: number, dto: Partial<CrearMaterialDto>) {
    return this.http.patch<Material>(`${this.base}/materiales/${id}`, dto);
  }
  desactivar(id: number) {
    return this.http.patch<Material>(`${this.base}/materiales/${id}/desactivar`, {});
  }
  reactivar(id: number) {
    return this.http.patch<Material>(`${this.base}/materiales/${id}/reactivar`, {});
  }
  agregarAlias(id: number, body: { textoLegacy: string }) {
    return this.http.post(`${this.base}/materiales/${id}/alias`, body);
  }
  quitarAlias(aliasId: number) {
    return this.http.delete(`${this.base}/materiales/alias/${aliasId}`);
  }
}
