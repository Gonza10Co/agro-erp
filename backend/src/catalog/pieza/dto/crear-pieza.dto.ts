import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CrearPiezaDto {
  @IsString() @IsNotEmpty() @MaxLength(40) codigo!: string;
  @IsString() @IsNotEmpty() @MaxLength(80) nombre!: string;
  /** Orden natural del despiece (capellada antes que talón), solo para listar. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) orden?: number;
}
