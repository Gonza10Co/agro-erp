import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum TipoMarcaDto {
  PROPIA = 'PROPIA',
  MAQUILA = 'MAQUILA',
}

export class CrearMarcaDto {
  @IsString() @IsNotEmpty() @MaxLength(40) codigo!: string;
  @IsString() @IsNotEmpty() @MaxLength(120) nombre!: string;
  @IsEnum(TipoMarcaDto) tipo!: TipoMarcaDto;
  @IsOptional() @Type(() => Number) @IsInt() clienteId?: number;
}
