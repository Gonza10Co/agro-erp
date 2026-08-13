import { IsBoolean, IsInt, IsOptional } from 'class-validator';

/**
 * El username NO se edita: es la identidad con la que la persona entra y con
 * la que quedaron firmados sus despachos e incidencias. Cambiarlo reescribiría
 * de facto quién autorizó qué.
 */
export class ActualizarUsuarioDto {
  @IsOptional() @IsInt() roleId?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
