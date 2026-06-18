import { IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { TipoMarcaDto } from './crear-marca.dto';

// No se permite cambiar el codigo en la actualizacion (es la llave de negocio).
export class ActualizarMarcaDto {
  @IsOptional() @IsString() @MaxLength(120) nombre?: string;
  @IsOptional() @IsEnum(TipoMarcaDto) tipo?: TipoMarcaDto;
  @IsOptional() @Type(() => Number) @IsInt() clienteId?: number;
}
