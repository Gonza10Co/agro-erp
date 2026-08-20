import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ConsumoMaterialDto {
  @IsInt() @Min(1) materialId!: number;
  @IsNumber() @Min(0) cantTeorica!: number;
  @IsNumber() @Min(0) cantReal!: number;
}

export class RegistrarAvanceDto {
  @IsInt() @Min(0) piezasCortadas!: number;
  @IsOptional() @IsInt() @Min(0) piezasDanadas?: number;
  /** Las piezas que hubo que volver a cortar: el indicador que pidió Gabriel. */
  @IsOptional() @IsInt() @Min(0) piezasRepuestas?: number;
  @IsOptional() @IsInt() @Min(1) operarioId?: number;
  @IsOptional() @IsString() @MaxLength(500) observaciones?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConsumoMaterialDto)
  consumos?: ConsumoMaterialDto[];
}
