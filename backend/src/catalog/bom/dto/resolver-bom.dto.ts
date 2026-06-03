import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional } from 'class-validator';

export class ResolverBomDto {
  @Type(() => Number)
  @IsInt()
  referenciaId!: number;

  @Type(() => Number)
  @IsInt()
  talla!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  marcaId?: number;

  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  opcionIds?: number[];
}
