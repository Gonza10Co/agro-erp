import { IsBoolean, IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

// DTO para asignar un eje (grupo de opciones) a una referencia.
export class AsignarEjeDto {
  @Type(() => Number) @IsInt() grupoOpcionId!: number;
  @IsOptional() @IsBoolean() obligatorio?: boolean;
}
