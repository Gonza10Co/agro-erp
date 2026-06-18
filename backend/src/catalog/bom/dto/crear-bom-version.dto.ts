import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum ClaseConsumoDto {
  CURVA = 'CURVA',
  FIJO = 'FIJO',
}

export class BomLineaTallaInput {
  @Type(() => Number) @IsInt() tallaId!: number;
  @Type(() => Number) @IsNumber() @Min(0) consumo!: number;
}

export class BomLineaInput {
  @Type(() => Number) @IsInt() materialId!: number;
  @IsEnum(ClaseConsumoDto) claseConsumo!: ClaseConsumoDto;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) consumoFijo?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) mermaPct?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true })
  @Type(() => BomLineaTallaInput)
  tallas?: BomLineaTallaInput[];
}

// Crea una NUEVA versión del BOM de una referencia O de un material FABRICADO
// (exactamente uno de los dos). Nunca muta la versión vigente: la desactiva y
// crea otra activa, preservando la trazabilidad de OPs/OFs ya emitidas.
export class CrearBomVersionDto {
  @IsOptional() @Type(() => Number) @IsInt() referenciaId?: number;
  @IsOptional() @Type(() => Number) @IsInt() materialId?: number;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true })
  @Type(() => BomLineaInput)
  lineas!: BomLineaInput[];
}
