import {
  debeNacerPrincipal,
  elegirSedePorDefecto,
  formatearDireccionEntrega,
  SedeBase,
} from './sedes-core';

const sede = (p: Partial<SedeBase> = {}): SedeBase => ({
  id: 1,
  nombre: 'Principal',
  ciudad: 'Ibagué',
  direccion: 'Cra 5 # 10-20',
  esPrincipal: false,
  activo: true,
  ...p,
});

describe('formatearDireccionEntrega', () => {
  it('junta dirección y ciudad', () => {
    expect(formatearDireccionEntrega(sede())).toBe('Cra 5 # 10-20, Ibagué');
  });

  it('omite la ciudad si viene vacía', () => {
    expect(formatearDireccionEntrega(sede({ ciudad: '   ' }))).toBe('Cra 5 # 10-20');
  });

  it('recorta espacios sobrantes', () => {
    expect(
      formatearDireccionEntrega(sede({ direccion: '  Calle 1  ', ciudad: ' Cali ' })),
    ).toBe('Calle 1, Cali');
  });
});

describe('elegirSedePorDefecto', () => {
  it('prefiere la principal activa', () => {
    const principal = sede({ id: 2, esPrincipal: true });
    expect(elegirSedePorDefecto([sede({ id: 1 }), principal])?.id).toBe(2);
  });

  it('ignora la principal si está inactiva', () => {
    const elegida = elegirSedePorDefecto([
      sede({ id: 1, esPrincipal: true, activo: false }),
      sede({ id: 2 }),
    ]);
    expect(elegida?.id).toBe(2);
  });

  it('cae en la primera activa cuando ninguna es principal', () => {
    expect(elegirSedePorDefecto([sede({ id: 7 }), sede({ id: 8 })])?.id).toBe(7);
  });

  it('devuelve null si no hay sedes activas', () => {
    expect(elegirSedePorDefecto([sede({ activo: false })])).toBeNull();
    expect(elegirSedePorDefecto([])).toBeNull();
  });
});

describe('debeNacerPrincipal', () => {
  it('la primera sede del cliente siempre es principal', () => {
    expect(debeNacerPrincipal(0, undefined)).toBe(true);
    expect(debeNacerPrincipal(0, false)).toBe(true);
  });

  it('con sedes existentes respeta lo pedido', () => {
    expect(debeNacerPrincipal(3, true)).toBe(true);
    expect(debeNacerPrincipal(3, false)).toBe(false);
    expect(debeNacerPrincipal(3, undefined)).toBe(false);
  });
});
