export interface DashboardResumen {
  pedidos: {
    porEstado: { BORRADOR: number; CONFIRMADA: number; EN_PRODUCCION: number; CERRADA: number; ANULADA: number };
    enCurso: number;
  };
  produccion: {
    ofActivas: number;
    paresEnProceso: number;
    porCelula: { celula: string; pares: number }[];
  };
  despachosMes: number;
  facturacionMes: { total: number; count: number };
  cartera: { saldoTotal: number; saldoVencido: number; clientesVencidos: number };
}
