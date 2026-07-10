import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CrearSedeDto {
  @IsString() @IsNotEmpty() @MaxLength(80) nombre!: string;
  @IsString() @IsNotEmpty() @MaxLength(80) ciudad!: string;
  @IsString() @IsNotEmpty() @MaxLength(240) direccion!: string;
  @IsOptional() @IsString() @MaxLength(40) telefono?: string;
  // La primera sede de un cliente nace principal aunque no se pida.
  @IsOptional() @IsBoolean() esPrincipal?: boolean;
}
