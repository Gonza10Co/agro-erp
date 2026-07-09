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

  // Costo al que llegó esta línea. Si se captura, alimenta el costo promedio del material.
  @IsOptional()
  @IsNumber()
  @IsPositive()
  costoUnitario?: number;
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
