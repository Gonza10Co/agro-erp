import { EstadoOC, EstadoOP } from '../../../core/api/models/pedidos.models';

export interface EstadoBadge { clase: string; label: string; }

const OC: Record<EstadoOC, EstadoBadge> = {
  BORRADOR:      { clase: 'badge-neutral', label: 'Borrador' },
  CONFIRMADA:    { clase: 'badge-info',    label: 'Confirmada' },
  EN_PRODUCCION: { clase: 'badge-accent',  label: 'En producción' },
  CERRADA:       { clase: 'badge-success', label: 'Cerrada' },
  ANULADA:       { clase: 'badge-neutral', label: 'Anulada' },
};

const OP: Record<EstadoOP, EstadoBadge> = {
  CREADA:        { clase: 'badge-neutral', label: 'Creada' },
  AMARRADA:      { clase: 'badge-info',    label: 'Amarrada' },
  EN_PRODUCCION: { clase: 'badge-accent',  label: 'En producción' },
  DESPACHADA:    { clase: 'badge-success', label: 'Despachada' },
  ANULADA:       { clase: 'badge-neutral', label: 'Anulada' },
};

export const badgeOC = (estado: EstadoOC): EstadoBadge => OC[estado];
export const badgeOP = (estado: EstadoOP): EstadoBadge => OP[estado];
