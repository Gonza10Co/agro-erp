import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class RegistrarStockDto {
  @Type(() => Number) @IsInt() productoConfiguradoId!: number;
  @Type(() => Number) @IsInt() tallaId!: number;
  @Type(() => Number) @IsInt() bodegaId!: number;
  @Type(() => Number) @IsInt() @Min(0) cantidad!: number;
}
