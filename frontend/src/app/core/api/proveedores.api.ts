import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { inactivas } from './inactivas.params';

export interface Proveedor {
  id: number;
  nit: string;
  nombre: string;
  ciudad?: string | null;
  activo: boolean;
}

export interface CrearProveedorDto {
  nit: string;
  nombre: string;
  ciudad?: string;
}

export interface ActualizarProveedorDto {
  nombre?: string;
  ciudad?: string;
}

@Injectable({ providedIn: 'root' })
export class ProveedoresApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/proveedores`;

  /** Solo activas por defecto; `incluirInactivas` es opt-in (pantalla de maestros). */
  listar(opts?: { incluirInactivas?: boolean }) { return this.http.get<Proveedor[]>(this.base, { params: inactivas(opts) }); }
  crear(dto: CrearProveedorDto) { return this.http.post<Proveedor>(this.base, dto); }
  actualizar(id: number, dto: ActualizarProveedorDto) {
    return this.http.patch<Proveedor>(`${this.base}/${id}`, dto);
  }
  desactivar(id: number) {
    return this.http.patch<Proveedor>(`${this.base}/${id}/desactivar`, {});
  }
  reactivar(id: number) {
    return this.http.patch<Proveedor>(`${this.base}/${id}/reactivar`, {});
  }
}
