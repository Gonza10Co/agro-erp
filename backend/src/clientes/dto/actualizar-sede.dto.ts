import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ActualizarSedeDto {
  @IsOptional() @IsString() @MaxLength(80) nombre?: string;
  @IsOptional() @IsString() @MaxLength(80) ciudad?: string;
  @IsOptional() @IsString() @MaxLength(240) direccion?: string;
  @IsOptional() @IsString() @MaxLength(40) telefono?: string;
  @IsOptional() @IsBoolean() esPrincipal?: boolean;
}
