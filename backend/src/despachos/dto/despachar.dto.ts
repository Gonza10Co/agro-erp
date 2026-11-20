import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

/** Cuántos pares de una talla de la OP salen en este despacho (despacho parcial). */
export class DispatchLineDto {
  @IsInt()
  opLineaTallaId!: number;

  @IsInt()
  @Min(0)
  quantity!: number;
}

export class DespacharDto {
  @IsInt()
  opId!: number;

  @IsOptional()
  @IsBoolean()
  autorizar?: boolean;

  @IsOptional()
  @IsString()
  motivo?: string;

  /**
   * Sin `lines` sale todo lo reservado y el pedido tiene que estar completo (el
   * despacho de siempre). Con `lines` sale solo lo indicado por talla, hasta lo
   * reservado en bodega, y la OP queda abierta si no cubre todo lo pedido.
   */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DispatchLineDto)
  lines?: DispatchLineDto[];
}
