import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Nacimiento de pares en la estación inicial: una etiqueta por lengua. */
export class NacerDto {
  @IsInt()
  @Min(1)
  productoConfiguradoId!: number;

  @IsInt()
  @Min(1)
  tallaId!: number;

  /** Cuántos pares de esa talla nacen en esta tanda (una canasta = 20). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  cantidad?: number;

  @IsInt()
  @Min(1)
  operarioId!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maquinaId?: number;
}
