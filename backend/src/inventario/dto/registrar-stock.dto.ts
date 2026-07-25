import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

const CALIDADES = ['PRIMERA', 'SEGUNDA'] as const;

export class RegistrarStockDto {
  @Type(() => Number) @IsInt() productoConfiguradoId!: number;
  @Type(() => Number) @IsInt() tallaId!: number;
  @Type(() => Number) @IsInt() bodegaId!: number;
  @Type(() => Number) @IsInt() @Min(0) cantidad!: number;
  // Opcional y por defecto PRIMERA: las cargas que ya existen no cambian, y con
  // 'SEGUNDA' se puede subir el saldo real de segundas (p. ej. las de Feroz).
  @IsOptional() @IsIn(CALIDADES) calidad?: (typeof CALIDADES)[number];
}
