import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class FilaAjustePtDto {
  @Type(() => Number) @IsInt() fila!: number;
  @IsString() @MaxLength(120) codigo!: string;
  @Type(() => Number) @IsInt() talla!: number;
  @IsString() @MaxLength(40) bodega!: string;
  @IsString() @MaxLength(20) calidad!: string;
  // Sin @Min: un conteo negativo llega al core y vuelve como error de su fila.
  @Type(() => Number) @IsInt() conteo!: number;
}

export class AjustePtDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20000)
  @ValidateNested({ each: true })
  @Type(() => FilaAjustePtDto)
  filas!: FilaAjustePtDto[];

  @IsOptional() @IsString() @MaxLength(500) observaciones?: string;
}
