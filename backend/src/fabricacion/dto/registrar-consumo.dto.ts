import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class LineaConsumoDto {
  @IsInt()
  @Min(1)
  materialId!: number;

  /** Lo que el almacenista entregó de verdad, en la unidad del material. */
  @IsPositive()
  cantidad!: number;
}

export class RegistrarConsumoDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => LineaConsumoDto)
  lineas!: LineaConsumoDto[];

  @IsOptional()
  @IsString()
  observaciones?: string;
}
