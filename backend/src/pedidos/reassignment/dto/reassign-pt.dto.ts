import { IsIn, IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

/** Liberar pares reservados de un pedido: quedan libres en bodega. */
export class ReleasePtDto {
  @IsInt()
  productoConfiguradoId!: number;

  @IsInt()
  tallaId!: number;

  @IsIn(['PRIMERA', 'SEGUNDA'])
  calidad!: 'PRIMERA' | 'SEGUNDA';

  @IsInt()
  @Min(1)
  quantity!: number;

  /** Obligatorio: queda en el registro auditable. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

/** Pasar pares reservados de un pedido (el de la URL) a otro. */
export class ReassignPtDto extends ReleasePtDto {
  @IsInt()
  toOpId!: number;
}
