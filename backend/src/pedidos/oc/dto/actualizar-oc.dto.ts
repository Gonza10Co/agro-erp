import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';
import { CrearOCLineaDto } from './crear-oc.dto';

// Edición completa de una OC en BORRADOR: reemplaza cabecera y líneas.
// Reusa la forma de línea/talla de la creación.
export class ActualizarOCDto {
  @Type(() => Number) @IsInt() clienteId!: number;
  @IsOptional() @IsString() ocCliente?: string;
  @IsOptional() @IsString() observaciones?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CrearOCLineaDto)
  lineas!: CrearOCLineaDto[];
}
