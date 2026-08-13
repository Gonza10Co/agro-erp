import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface RolUsuario {
  id: number;
  name: string;
}

/** Nunca trae `passwordHash`: el backend lo excluye de toda proyección. */
export interface Usuario {
  id: number;
  username: string;
  isActive: boolean;
  createdAt: string;
  role: RolUsuario;
}

export interface CrearUsuarioDto {
  username: string;
  password: string;
  roleId: number;
}

/** El username no se edita: con él quedaron firmados despachos e incidencias. */
export interface ActualizarUsuarioDto {
  roleId?: number;
  isActive?: boolean;
}

@Injectable({ providedIn: 'root' })
export class UsuariosApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/usuarios`;

  listar() { return this.http.get<Usuario[]>(this.base); }
  roles() { return this.http.get<RolUsuario[]>(`${this.base}/roles`); }
  crear(dto: CrearUsuarioDto) { return this.http.post<Usuario>(this.base, dto); }
  actualizar(id: number, dto: ActualizarUsuarioDto) {
    return this.http.patch<Usuario>(`${this.base}/${id}`, dto);
  }
  resetearPassword(id: number, password: string) {
    return this.http.patch<{ ok: boolean }>(`${this.base}/${id}/password`, { password });
  }
}
