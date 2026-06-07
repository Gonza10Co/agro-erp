import { IsInt } from 'class-validator';

export class AvanzarDto {
  @IsInt()
  operarioId!: number;

  @IsInt()
  maquinaId!: number;
}
