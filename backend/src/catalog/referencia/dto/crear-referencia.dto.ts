import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

// DTO para crear una Referencia (cabecera).
export class CrearReferenciaDto {
  @IsString() @IsNotEmpty() @MaxLength(40) codigo!: string;
  @IsString() @IsNotEmpty() @MaxLength(160) nombreInterno!: string;
  @Type(() => Number) @IsInt() tallaMinId!: number;
  @Type(() => Number) @IsInt() tallaMaxId!: number;
  /** Piezas que se cortan por par (del despiece del cliente). */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) piezasPorPar?: number;
}
