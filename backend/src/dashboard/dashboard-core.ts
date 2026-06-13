// Núcleo puro del dashboard. Sin Prisma ni Nest.

export interface RangoFechas {
  desde: Date;
  hasta: Date;
}

/** Rango del mes calendario que contiene `hoy`: [1° del mes, 1° del mes siguiente). En UTC. */
export function rangoMes(hoy: Date): RangoFechas {
  const y = hoy.getUTCFullYear();
  const m = hoy.getUTCMonth();
  return {
    desde: new Date(Date.UTC(y, m, 1)),
    hasta: new Date(Date.UTC(y, m + 1, 1)),
  };
}
