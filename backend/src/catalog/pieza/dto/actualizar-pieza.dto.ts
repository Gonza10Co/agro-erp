import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

// El código (llave de negocio) no se modifica acá.
export class ActualizarPiezaDto {
  @IsOptional() @IsString() @MaxLength(80) nombre?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) orden?: number;
}
