import { Transform, Type } from 'class-transformer';
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
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  opcionIds?: number[];
}
