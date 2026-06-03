export interface DisponibilidadBodega {
  bodegaId: number;
  inventarioPTId: number;
  disponible: number; // cantDisponible - cantReservada
  prioridad: number; // menor = se consume primero
}

export interface SolicitudTalla {
  tallaId: number;
  cantPedida: number;
}

export interface ReservaCalculada {
  inventarioPTId: number;
  cantidad: number;
}

export interface ResultadoAmarreTalla {
  tallaId: number;
  cantPedida: number;
  cantAmarrada: number;
  cantAProducir: number;
  reservas: ReservaCalculada[];
}

export function amarrarTalla(
  solicitud: SolicitudTalla,
  disponibilidades: DisponibilidadBodega[],
): ResultadoAmarreTalla {
  const ordenadas = [...disponibilidades].sort(
    (a, b) => a.prioridad - b.prioridad,
  );
  let restante = solicitud.cantPedida;
  const reservas: ReservaCalculada[] = [];

  for (const d of ordenadas) {
    if (restante <= 0) break;
    const tomar = Math.min(restante, d.disponible);
    if (tomar > 0) {
      reservas.push({ inventarioPTId: d.inventarioPTId, cantidad: tomar });
      restante -= tomar;
    }
  }

  const cantAmarrada = solicitud.cantPedida - restante;
  return {
    tallaId: solicitud.tallaId,
    cantPedida: solicitud.cantPedida,
    cantAmarrada,
    cantAProducir: restante,
    reservas,
  };
}
