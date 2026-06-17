import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum OrigenMaterialDto {
  COMPRADO = 'COMPRADO',
  FABRICADO = 'FABRICADO',
}

export enum ClaseBomDto {
  DIRECTO_CURVA = 'DIRECTO_CURVA',
  DIRECTO_FIJO = 'DIRECTO_FIJO',
  INDIRECTO = 'INDIRECTO',
}

export class CrearMaterialDto {
  @IsString() @IsNotEmpty() @MaxLength(60) codigo!: string;
  @IsString() @IsNotEmpty() @MaxLength(160) nombreCanonico!: string;
  @Type(() => Number) @IsInt() categoriaId!: number;
  @Type(() => Number) @IsInt() unidadMedidaId!: number;
  @IsEnum(OrigenMaterialDto) origen!: OrigenMaterialDto;
  @IsEnum(ClaseBomDto) claseBom!: ClaseBomDto;
  @IsOptional() @Type(() => Number) @IsInt() proveedorId?: number;
}
