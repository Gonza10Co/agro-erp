import { Celula } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class ActualizarOperarioDto {
  @IsOptional() @IsString() @MaxLength(120) nombre?: string;
  @IsOptional() @IsEnum(Celula) celula?: Celula;
  @IsOptional() @IsBoolean() activo?: boolean;
}
