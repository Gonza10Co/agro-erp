import { IsInt, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CrearUsuarioDto {
  @IsString() @IsNotEmpty() @MaxLength(60) username!: string;
  // 8 es el mínimo que ya cumplen las credenciales sembradas; subirlo dejaría
  // al cliente sin poder replicar las suyas.
  @IsString() @MinLength(8) @MaxLength(72) password!: string;
  @IsInt() roleId!: number;
}
