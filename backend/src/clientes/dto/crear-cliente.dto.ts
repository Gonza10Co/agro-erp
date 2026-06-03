import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum TipoCreditoDto { CONTADO = 'CONTADO', D30 = 'D30', D60 = 'D60', D90 = 'D90' }

export class CrearClienteDto {
  @IsString() nit!: string;
  @IsString() nombre!: string;
  @IsOptional() @IsString() ciudad?: string;
  @IsOptional() @IsEnum(TipoCreditoDto) tipoCredito?: TipoCreditoDto;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) cupo?: number;
}
