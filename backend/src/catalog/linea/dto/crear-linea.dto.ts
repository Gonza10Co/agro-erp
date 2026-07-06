import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export enum CelulaDto {
  CORTE = 'CORTE',
  GUARNICION = 'GUARNICION',
  ALMACEN = 'ALMACEN',
  INYECCION = 'INYECCION',
  PT = 'PT',
}

export class CrearLineaDto {
  @IsString() @IsNotEmpty() @MaxLength(40) codigo!: string;
  @IsString() @IsNotEmpty() @MaxLength(120) nombre!: string;
  // Opcional: si no viene, la BD aplica el default CORTE. La línea Feroz usa INYECCION.
  @IsOptional() @IsEnum(CelulaDto) celulaInicial?: CelulaDto;
}
