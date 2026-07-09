import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { TipoCreditoDto } from './crear-cliente.dto';

// Actualización parcial de cliente. El NIT (llave de negocio) no se modifica aquí.
export class ActualizarClienteDto {
  @IsOptional() @IsString() @MaxLength(160) nombre?: string;
  @IsOptional() @IsString() @MaxLength(80) ciudad?: string;
  @IsOptional() @IsString() @MaxLength(40) telefono?: string;
  @IsOptional() @IsString() @MaxLength(240) direccion?: string;
  @IsOptional() @IsString() @MaxLength(240) direccionDespacho?: string;
  @IsOptional() @IsEnum(TipoCreditoDto) tipoCredito?: TipoCreditoDto;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) cupo?: number;
}
