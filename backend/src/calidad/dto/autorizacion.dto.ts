import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Quién autoriza un reporte que el usuario de la sesión no puede firmar solo.
 * El celular de la estación queda logueado todo el turno con la operaria; cuando
 * un par sale de segunda, la persona de calidad se acerca y pone su usuario y
 * clave en el mismo escaneo (JP, 2026-09-11: "lo tiene que autorizar la persona
 * de calidad"). Queda firmado con su usuario en `IncidenciaCalidad.autorizadoPorId`.
 */
export class AutorizacionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  username!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password!: string;
}
