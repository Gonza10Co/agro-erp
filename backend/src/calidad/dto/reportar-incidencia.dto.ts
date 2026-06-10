import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class ReportarIncidenciaDto {
  @IsInt() @Min(1) tipoDanoId!: number;
  @IsInt() @Min(1) operarioId!: number;
  @IsOptional() @IsString() @MaxLength(500) descripcion?: string;
}
