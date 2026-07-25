import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';

export class LineaOcpManualDto {
  @IsInt()
  materialId!: number;

  @IsNumber()
  @IsPositive()
  cantPedida!: number;

  // Precio pactado con el proveedor. Opcional: si no se conoce, se captura en la recepción.
  @IsOptional()
  @IsNumber()
  @IsPositive()
  costoUnitario?: number;
}

// OCP manual: compra directa sin requerimiento (reposición de stock, insumos
// no ligados a una OP).
export class CrearOcpManualDto {
  @IsInt()
  proveedorId!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineaOcpManualDto)
  lineas!: LineaOcpManualDto[];

  @IsOptional()
  @IsString()
  observaciones?: string;
}
