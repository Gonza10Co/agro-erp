import { IsInt, Min } from 'class-validator';

export class AvanzarDto {
  @IsInt()
  @Min(1)
  operarioId!: number;

  @IsInt()
  @Min(1)
  maquinaId!: number;
}
