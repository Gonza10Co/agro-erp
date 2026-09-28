import { IsInt, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

/** Material propio de la marca: en el BOM de cualquier referencia, objetivo → nuevo. */
export class MaterialMarcaDto {
  @Type(() => Number) @IsInt() @IsPositive() materialObjetivoId!: number;
  @Type(() => Number) @IsInt() @IsPositive() materialNuevoId!: number;
}
