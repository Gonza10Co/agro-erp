import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, Min, ValidateNested } from 'class-validator';

export class DeliveryEstimateSizeDto {
  @Type(() => Number) @IsInt() tallaId!: number;
  @Type(() => Number) @IsInt() @Min(1) cantidad!: number;
}

export class DeliveryEstimateLineDto {
  @Type(() => Number) @IsInt() productoConfiguradoId!: number;
  @IsOptional() @IsIn(['PRIMERA', 'SEGUNDA']) calidad?: 'PRIMERA' | 'SEGUNDA';
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DeliveryEstimateSizeDto)
  tallas!: DeliveryEstimateSizeDto[];
}

/** Las líneas del pedido que se está montando (mismo formato que crear la OC). */
export class DeliveryEstimateDto {
  // Pedido de mínimos: no toma de la bodega. Declararlo o el ValidationPipe lo bota.
  @IsOptional() @IsBoolean() paraStock?: boolean;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DeliveryEstimateLineDto)
  lineas!: DeliveryEstimateLineDto[];
}
