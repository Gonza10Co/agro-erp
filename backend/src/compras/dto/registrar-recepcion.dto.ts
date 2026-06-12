import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';

export class LineaRecepcionDto {
  @IsInt()
  ocpLineaId!: number;

  @IsNumber()
  @IsPositive()
  cantidad!: number;
}

export class RegistrarRecepcionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineaRecepcionDto)
  lineas!: LineaRecepcionDto[];

  @IsOptional()
  @IsString()
  observaciones?: string;
}
