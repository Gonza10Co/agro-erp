import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { CrearOCLineaDto } from './crear-oc.dto';

// Edición completa de una OC en BORRADOR: reemplaza cabecera y líneas.
// Reusa la forma de línea/talla de la creación.
export class ActualizarOCDto {
  @Type(() => Number) @IsInt() clienteId!: number;
  @IsOptional() @IsString() ocCliente?: string;
  @IsOptional() @IsString() observaciones?: string;
  @IsOptional() @Type(() => Number) @IsInt() sedeEntregaId?: number;
  @IsOptional() @IsString() @MaxLength(240) direccionDespacho?: string;
  // Si no viene, la OC conserva la línea que ya tenía (undefined no toca el campo).
  @IsOptional() @Type(() => Number) @IsInt() lineaId?: number;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CrearOCLineaDto)
  lineas!: CrearOCLineaDto[];
}
