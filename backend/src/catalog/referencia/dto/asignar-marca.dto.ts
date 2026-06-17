import { IsInt } from 'class-validator';
import { Type } from 'class-transformer';

// DTO para asignar una marca a una referencia.
export class AsignarMarcaDto {
  @Type(() => Number) @IsInt() marcaId!: number;
}
