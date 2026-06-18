import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

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

  listar() { return this.http.get<Proveedor[]>(this.base); }
  crear(dto: CrearProveedorDto) { return this.http.post<Proveedor>(this.base, dto); }
  actualizar(id: number, dto: ActualizarProveedorDto) {
    return this.http.patch<Proveedor>(`${this.base}/${id}`, dto);
  }
  desactivar(id: number) {
    return this.http.patch<Proveedor>(`${this.base}/${id}/desactivar`, {});
  }
}
