import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

// DTO para actualizar una Referencia. Todos los campos son opcionales.
export class ActualizarReferenciaDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(160) nombreInterno?: string;
  @IsOptional() @Type(() => Number) @IsInt() tallaMinId?: number;
  @IsOptional() @Type(() => Number) @IsInt() tallaMaxId?: number;
}
