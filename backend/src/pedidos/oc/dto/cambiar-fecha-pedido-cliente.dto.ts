import { IsDateString, ValidateIf } from 'class-validator';

export class CambiarFechaPedidoClienteDto {
  // 'YYYY-MM-DD' en que el cliente puso el pedido; null la borra.
  @ValidateIf((o) => o.fechaPedidoCliente !== null)
  @IsDateString()
  fechaPedidoCliente!: string | null;
}
