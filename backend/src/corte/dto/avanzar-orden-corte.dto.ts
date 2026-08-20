import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { EstadoOrdenCorte } from '@prisma/client';

export class AvanzarOrdenCorteDto {
  @IsEnum(EstadoOrdenCorte) estado!: EstadoOrdenCorte;
  /**
   * Pares efectivamente cortados por línea, al pasar a ENTREGADA. Sin esto el
   * cumplimiento de corte no se puede calcular.
   */
  @IsOptional() cantidades?: Record<string, number>;
}

export class CantidadCortadaDto {
  @IsInt() @Min(1) lineaId!: number;
  @IsInt() @Min(0) cantCortada!: number;
}
