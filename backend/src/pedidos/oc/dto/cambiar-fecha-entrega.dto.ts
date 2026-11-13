import { IsDateString, ValidateIf } from 'class-validator';

export class CambiarFechaEntregaDto {
  // 'YYYY-MM-DD'; null la borra y el pedido vuelve al compromiso estimado.
  @ValidateIf((o) => o.fechaEntrega !== null)
  @IsDateString()
  fechaEntrega!: string | null;
}
