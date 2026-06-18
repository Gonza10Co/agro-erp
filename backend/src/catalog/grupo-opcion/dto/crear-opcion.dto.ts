import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CrearOpcionDto {
  @IsString() @IsNotEmpty() @MaxLength(40) codigo!: string;
  @IsString() @IsNotEmpty() @MaxLength(120) nombre!: string;
}
