import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { inactivas } from './inactivas.params';

export type TipoMarca = 'PROPIA' | 'MAQUILA';

export interface Marca {
  id: number;
  codigo: string;
  nombre: string;
  tipo: TipoMarca;
  clienteId?: number | null;
  lineaId?: number | null;
  activo: boolean;
}

export interface CrearMarcaDto {
  codigo: string;
  nombre: string;
  tipo: TipoMarca;
  clienteId?: number;
  lineaId?: number;
}

export interface ActualizarMarcaDto {
  nombre?: string;
  tipo?: TipoMarca;
  clienteId?: number;
  lineaId?: number;
}

/** Material resumido tal como lo devuelve el backend en los reemplazos de marca. */
export interface MaterialResumen {
  id: number;
  codigo: string;
  nombre: string;
}

/**
 * Material propio de la marca: en el BOM de CUALQUIER referencia, cuando el pedido lleva
 * esta marca, `materialObjetivo` se cambia por `materialNuevo` (mismo consumo por talla).
 */
export interface MaterialMarca {
  id: number;
  materialObjetivo: MaterialResumen | null;
  materialNuevo: MaterialResumen | null;
}

@Injectable({ providedIn: 'root' })
export class MarcasApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/catalog/marcas`;

  /** Solo activas por defecto; `incluirInactivas` es opt-in (pantalla de maestros). */
  listar(opts?: { incluirInactivas?: boolean }) { return this.http.get<Marca[]>(this.base, { params: inactivas(opts) }); }
  crear(dto: CrearMarcaDto) { return this.http.post<Marca>(this.base, dto); }
  actualizar(id: number, dto: ActualizarMarcaDto) { return this.http.patch<Marca>(`${this.base}/${id}`, dto); }
  desactivar(id: number) { return this.http.patch<Marca>(`${this.base}/${id}/desactivar`, {}); }
  reactivar(id: number) { return this.http.patch<Marca>(`${this.base}/${id}/reactivar`, {}); }

  // Materiales propios de la marca (reemplazos que aplican a todas las referencias).
  listarMateriales(id: number) { return this.http.get<MaterialMarca[]>(`${this.base}/${id}/materiales`); }
  agregarMaterial(id: number, dto: { materialObjetivoId: number; materialNuevoId: number }) {
    return this.http.post<MaterialMarca>(`${this.base}/${id}/materiales`, dto);
  }
  quitarMaterial(id: number, reglaId: number) { return this.http.delete<{ id: number }>(`${this.base}/${id}/materiales/${reglaId}`); }
}
