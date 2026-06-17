import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CrearAliasDto {
  @IsString() @IsNotEmpty() @MaxLength(160) textoLegacy!: string;
}
