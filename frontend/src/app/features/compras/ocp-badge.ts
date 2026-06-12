import { EstadoOcp } from '../../core/api/models/compras.models';

export interface OcpBadge {
  clase: string;
  label: string;
}

const OCP: Record<EstadoOcp, OcpBadge> = {
  PENDIENTE: { clase: 'badge-neutral', label: 'Pendiente' },
  PARCIAL:   { clase: 'badge-accent',  label: 'Parcial' },
  COMPLETA:  { clase: 'badge-success', label: 'Completa' },
};

export const badgeOcp = (estado: EstadoOcp): OcpBadge => OCP[estado];
