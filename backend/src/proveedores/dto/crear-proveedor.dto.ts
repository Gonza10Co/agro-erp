import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CrearProveedorDto {
  @IsString() @IsNotEmpty() @MaxLength(20) nit!: string;
  @IsString() @IsNotEmpty() @MaxLength(160) nombre!: string;
  @IsOptional() @IsString() @MaxLength(80) ciudad?: string;
}
