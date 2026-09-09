import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class AvanzarDto {
  @IsInt()
  @Min(1)
  operarioId!: number;

  /** Opcional desde el piloto: en Bodega o Producto terminado no hay máquina. */
  @IsOptional()
  @IsInt()
  @Min(1)
  maquinaId?: number;

  /**
   * Estación desde la que se hace el pistolazo (el dispositivo está amarrado a
   * una). Si viene, el backend valida que sea la que le toca al par y rechaza
   * el escaneo si se saltó una. Sin ella, avanza a la siguiente activa.
   */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  estacion?: string;
}
