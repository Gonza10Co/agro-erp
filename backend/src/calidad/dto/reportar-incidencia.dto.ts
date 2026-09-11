import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { AutorizacionDto } from './autorizacion.dto';

export class ReportarIncidenciaDto {
  @IsInt() @Min(1) tipoDanoId!: number;
  @IsInt() @Min(1) operarioId!: number;
  @IsOptional() @IsString() @MaxLength(500) descripcion?: string;

  /** Usuario y clave de quien autoriza (calidad para una segunda, gerente para una baja). */
  @IsOptional()
  @ValidateNested()
  @Type(() => AutorizacionDto)
  autorizacion?: AutorizacionDto;
}
