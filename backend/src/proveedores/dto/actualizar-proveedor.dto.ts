import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ActualizarProveedorDto {
  @IsOptional() @IsString() @MaxLength(160) nombre?: string;
  @IsOptional() @IsString() @MaxLength(80) ciudad?: string;
}
