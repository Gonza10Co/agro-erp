import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CrearOCTallaDto {
  @Type(() => Number) @IsInt() tallaId!: number;
  @Type(() => Number) @IsInt() @Min(1) cantidad!: number;
}

export class CrearOCLineaDto {
  @Type(() => Number) @IsInt() productoConfiguradoId!: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) precioUnitario?: number;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CrearOCTallaDto)
  tallas!: CrearOCTallaDto[];
}

export class CrearOCDto {
  @Type(() => Number) @IsInt() clienteId!: number;
  @IsOptional() @IsString() ocCliente?: string;
  @IsOptional() @IsString() observaciones?: string;
  // Dirección de entrega del pedido; si se omite, hereda la del cliente.
  @IsOptional() @IsString() @MaxLength(240) direccionDespacho?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CrearOCLineaDto)
  lineas!: CrearOCLineaDto[];
}
