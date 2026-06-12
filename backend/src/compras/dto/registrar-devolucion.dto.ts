import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';

export class LineaDevolucionDto {
  @IsInt()
  materialId!: number;

  @IsNumber()
  @IsPositive()
  cantidad!: number;
}

export class RegistrarDevolucionDto {
  @IsString()
  @IsNotEmpty()
  causa!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineaDevolucionDto)
  lineas!: LineaDevolucionDto[];

  @IsOptional()
  @IsString()
  observaciones?: string;
}
