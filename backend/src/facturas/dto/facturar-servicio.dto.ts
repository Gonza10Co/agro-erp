import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class LineaServicioDto {
  // Uno de los dos alcanza: servicio del catálogo o descripción libre (la hoja
  // del cliente factura maquila con texto suelto). El core valida la regla.
  @IsOptional() @Type(() => Number) @IsInt() servicioId?: number;
  @IsOptional() @IsString() @MaxLength(240) descripcion?: string;
  @Type(() => Number) @IsInt() @Min(1) cantidad!: number;
  @Type(() => Number) @IsNumber() @Min(0) precioUnitario!: number;
}

export class FacturarServicioDto {
  @Type(() => Number) @IsInt() clienteId!: number;
  // Línea a la que se le atribuye el ingreso (Feroz factura su inyección).
  @IsOptional() @Type(() => Number) @IsInt() lineaId?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) ivaPct?: number;
  @IsOptional() @IsString() fecha?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineaServicioDto)
  lineas!: LineaServicioDto[];
}
