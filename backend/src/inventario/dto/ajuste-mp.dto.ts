import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class FilaAjusteMpDto {
  @Type(() => Number) @IsInt() fila!: number;
  @IsString() @MaxLength(120) codigo!: string;
  // Sin @Min ni maxDecimalPlaces: un conteo negativo o con más de 4 decimales
  // llega al core y vuelve como error de su fila, no como 400 del archivo entero.
  @Type(() => Number) @IsNumber({ allowNaN: false, allowInfinity: false }) conteo!: number;
}

export class AjusteMpDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20000)
  @ValidateNested({ each: true })
  @Type(() => FilaAjusteMpDto)
  filas!: FilaAjusteMpDto[];

  @IsOptional() @IsString() @MaxLength(500) observaciones?: string;
}
