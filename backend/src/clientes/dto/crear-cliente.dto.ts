import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum TipoCreditoDto {
  CONTADO = 'CONTADO',
  D30 = 'D30',
  D60 = 'D60',
  D90 = 'D90',
}

export class CrearClienteDto {
  @IsString() @MaxLength(20) nit!: string;
  @IsString() @MaxLength(160) nombre!: string;
  @IsOptional() @IsString() @MaxLength(80) ciudad?: string;
  @IsOptional() @IsEnum(TipoCreditoDto) tipoCredito?: TipoCreditoDto;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) cupo?: number;
}
