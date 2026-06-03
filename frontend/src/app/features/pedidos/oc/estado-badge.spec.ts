import { badgeOC, badgeOP } from './estado-badge';

describe('estado-badge', () => {
  it('mapea cada estado de OC a una clase de badge existente y un label legible', () => {
    expect(badgeOC('BORRADOR')).toEqual({ clase: 'badge-neutral', label: 'Borrador' });
    expect(badgeOC('CONFIRMADA')).toEqual({ clase: 'badge-info', label: 'Confirmada' });
    expect(badgeOC('EN_PRODUCCION')).toEqual({ clase: 'badge-accent', label: 'En producción' });
    expect(badgeOC('CERRADA')).toEqual({ clase: 'badge-success', label: 'Cerrada' });
    expect(badgeOC('ANULADA')).toEqual({ clase: 'badge-neutral', label: 'Anulada' });
  });

  it('mapea los estados de OP a badge + label', () => {
    expect(badgeOP('CREADA')).toEqual({ clase: 'badge-neutral', label: 'Creada' });
    expect(badgeOP('AMARRADA')).toEqual({ clase: 'badge-info', label: 'Amarrada' });
    expect(badgeOP('EN_PRODUCCION')).toEqual({ clase: 'badge-accent', label: 'En producción' });
    expect(badgeOP('ANULADA')).toEqual({ clase: 'badge-neutral', label: 'Anulada' });
  });
});
