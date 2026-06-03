import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum TipoBodegaDto { PROPIA = 'PROPIA', HERMANA = 'HERMANA' }

export class CrearBodegaDto {
  @IsString() codigo!: string;
  @IsString() nombre!: string;
  @IsOptional() @IsEnum(TipoBodegaDto) tipo?: TipoBodegaDto;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) prioridad?: number;
}
