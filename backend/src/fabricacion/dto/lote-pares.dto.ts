import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, MaxLength, MinLength } from 'class-validator';

/** Lo que el tablero de fabricación deja seleccionar de una vez. */
export const MAX_PARES_LOTE = 500;

export class CerrarLoteDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PARES_LOTE)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  codigos!: string[];

  /** Queda en la trazabilidad de cada par: por qué se cerró sin pistolazo. */
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  motivo!: string;
}

export class MoverLoteDto extends CerrarLoteDto {
  /** Estación a la que entran los pares. */
  @IsString()
  @MaxLength(40)
  estacion!: string;
}
