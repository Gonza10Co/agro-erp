import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class RegistrarPagoDto {
  @Type(() => Number) @IsInt() facturaId!: number;
  @Type(() => Number) @IsNumber() @Min(0.01) monto!: number;
  @IsOptional() @IsString() medio?: string;
}
