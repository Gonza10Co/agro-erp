import { Celula } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CrearOperarioDto {
  @IsString() @IsNotEmpty() @MaxLength(120) nombre!: string;
  @IsEnum(Celula) celula!: Celula;
}
