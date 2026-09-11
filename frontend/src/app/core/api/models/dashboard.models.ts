export interface DashboardResumen {
  pedidos: {
    porEstado: { BORRADOR: number; CONFIRMADA: number; EN_PRODUCCION: number; CERRADA: number; ANULADA: number };
    enCurso: number;
  };
  produccion: {
    ofActivas: number;
    paresEnProceso: number;
    /** Columnas por ESTACIÓN, las mismas del tablero (Corte = lo que falta por nacer). */
    porEstacion: { codigo: string; nombre: string; pares: number }[];
    programado: number;
  };
  despachosMes: number;
  facturacionMes: { total: number; count: number };
  cartera: { saldoTotal: number; saldoVencido: number; clientesVencidos: number };
}
