import { IsArray, IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

// Crea un ProductoConfigurado a partir de una referencia + marca + opciones.
export class CrearProductoDto {
  @Type(() => Number) @IsInt() referenciaId!: number;
  @Type(() => Number) @IsInt() marcaId!: number;
  @IsOptional() @IsArray() @Type(() => Number) @IsInt({ each: true })
  opcionIds?: number[];
}
