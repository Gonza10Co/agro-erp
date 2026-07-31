import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Qué días de la semana trabaja la planta. Todos opcionales: se manda solo lo que
 * cambia (el caso típico es voltear el sábado).
 */
export class GuardarCalendarioDto {
  @IsOptional() @IsBoolean() lunes?: boolean;
  @IsOptional() @IsBoolean() martes?: boolean;
  @IsOptional() @IsBoolean() miercoles?: boolean;
  @IsOptional() @IsBoolean() jueves?: boolean;
  @IsOptional() @IsBoolean() viernes?: boolean;
  @IsOptional() @IsBoolean() sabado?: boolean;
  @IsOptional() @IsBoolean() domingo?: boolean;
}
