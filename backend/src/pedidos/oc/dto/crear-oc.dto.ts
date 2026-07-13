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
  // Sede de entrega del cliente. Si se omite, se usa su sede principal.
  @IsOptional() @Type(() => Number) @IsInt() sedeEntregaId?: number;
  // Entrega puntual escrita a mano (una obra, un evento). Gana sobre la sede principal.
  @IsOptional() @IsString() @MaxLength(240) direccionDespacho?: string;
  // Línea de producción del pedido (el mapeo marca→línea no es fijo: se decide acá).
  @IsOptional() @Type(() => Number) @IsInt() lineaId?: number;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CrearOCLineaDto)
  lineas!: CrearOCLineaDto[];
}
