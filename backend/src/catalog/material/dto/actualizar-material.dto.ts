import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ClaseBomDto, OrigenMaterialDto } from './crear-material.dto';

export class ActualizarMaterialDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(160) nombreCanonico?: string;
  @IsOptional() @Type(() => Number) @IsInt() categoriaId?: number;
  @IsOptional() @Type(() => Number) @IsInt() unidadMedidaId?: number;
  @IsOptional() @IsEnum(OrigenMaterialDto) origen?: OrigenMaterialDto;
  @IsOptional() @IsEnum(ClaseBomDto) claseBom?: ClaseBomDto;
  @IsOptional() @Type(() => Number) @IsInt() proveedorId?: number;
}
