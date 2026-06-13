import { IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { MotivoMovimiento, TipoMovimiento } from '@prisma/client';

export class MovimientoMaterialDto {
  @Type(() => Number) @IsInt() materialId!: number;
  @IsEnum(TipoMovimiento) tipo!: TipoMovimiento;
  @IsEnum(MotivoMovimiento) motivo!: MotivoMovimiento;
  @Type(() => Number) @IsNumber() @IsPositive() cantidad!: number;
  @IsOptional() @IsString() referencia?: string;
  @IsOptional() @IsString() observaciones?: string;
}
