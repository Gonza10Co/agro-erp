import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type OrigenMaterial = 'COMPRADO' | 'FABRICADO';
export type ClaseBom = 'DIRECTO_CURVA' | 'DIRECTO_FIJO' | 'INDIRECTO';

export interface Material {
  id: number;
  codigo: string;
  nombreCanonico: string;
  origen: OrigenMaterial;
  unidad: string;
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

  listar() { return this.http.get<Material[]>(`${this.base}/materiales`); }
  crear(dto: CrearMaterialDto) { return this.http.post<Material>(`${this.base}/materiales`, dto); }
  actualizar(id: number, dto: Partial<CrearMaterialDto>) {
    return this.http.patch<Material>(`${this.base}/materiales/${id}`, dto);
  }
  desactivar(id: number) {
    return this.http.patch<Material>(`${this.base}/materiales/${id}/desactivar`, {});
  }
  agregarAlias(id: number, body: { textoLegacy: string }) {
    return this.http.post(`${this.base}/materiales/${id}/alias`, body);
  }
  quitarAlias(aliasId: number) {
    return this.http.delete(`${this.base}/materiales/alias/${aliasId}`);
  }
}
