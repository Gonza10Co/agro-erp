import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { CelulaDto } from './crear-linea.dto';

// No se permite cambiar el codigo en la actualizacion (es la llave de negocio).
export class ActualizarLineaDto {
  @IsOptional() @IsString() @MaxLength(120) nombre?: string;
  @IsOptional() @IsEnum(CelulaDto) celulaInicial?: CelulaDto;
}
