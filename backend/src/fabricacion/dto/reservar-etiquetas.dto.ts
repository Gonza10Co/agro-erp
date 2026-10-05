import { IsInt, Max, Min } from 'class-validator';

/** Etiquetas de la lengua impresas por adelantado: se reserva el código, el par no nace. */
export class ReservarEtiquetasDto {
  @IsInt()
  @Min(1)
  productoConfiguradoId!: number;

  @IsInt()
  @Min(1)
  tallaId!: number;

  /** Cuántas etiquetas de esa talla (una talla entera de una OF cabe de una vez). */
  @IsInt()
  @Min(1)
  @Max(500)
  cantidad!: number;
}
