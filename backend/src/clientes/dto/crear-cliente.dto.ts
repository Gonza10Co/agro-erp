import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum TipoCreditoDto {
  CONTADO = 'CONTADO',
  D30 = 'D30',
  D60 = 'D60',
  D90 = 'D90',
}

export class CrearClienteDto {
  @IsString() @IsNotEmpty() @MaxLength(20) nit!: string;
  @IsString() @IsNotEmpty() @MaxLength(160) nombre!: string;
  @IsOptional() @IsString() @MaxLength(80) ciudad?: string;
  @IsOptional() @IsEnum(TipoCreditoDto) tipoCredito?: TipoCreditoDto;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) cupo?: number;
}
