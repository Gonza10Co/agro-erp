import { armarProducto, ConfiguracionInvalida, esViolacionUnica, ReferenciaConfigData } from './producto-configurado-core';

const CONFIG: ReferenciaConfigData = {
  referencia: { id: 1, codigo: '101', nombreInterno: 'PODEROSA base' },
  marcas: [
    { id: 5, codigo: 'PODEROSA', nombre: 'Poderosa' },
    { id: 6, codigo: 'ALPACA', nombre: 'Alpaca' },
  ],
  ejes: [
    { grupo: { id: 10, codigo: 'COLOR', nombre: 'Color', obligatorio: true },
      opciones: [{ id: 100, codigo: 'CAFE', nombre: 'Café' }, { id: 101, codigo: 'NEGRO', nombre: 'Negro' }] },
    { grupo: { id: 20, codigo: 'SUELA', nombre: 'Suela', obligatorio: false },
      opciones: [{ id: 200, codigo: 'RIVER', nombre: 'River' }] },
  ],
};

describe('armarProducto', () => {
  it('arma codigo y nombre determinísticos con marca y opciones válidas', () => {
    const p = armarProducto(CONFIG, { marcaId: 5, opcionIds: [200, 100] });
    // ordenadas por código de grupo: COLOR antes que SUELA
    expect(p.codigo).toBe('101-PODEROSA-CAFE-RIVER');
    expect(p.nombreComercial).toBe('PODEROSA base · Poderosa · Café · River');
    expect(p.opcionIds).toEqual([100, 200]);
  });

  it('rechaza marca no habilitada para la referencia', () => {
    expect(() => armarProducto(CONFIG, { marcaId: 99, opcionIds: [100] })).toThrow(ConfiguracionInvalida);
  });

  it('rechaza una opción ajena a la referencia', () => {
    expect(() => armarProducto(CONFIG, { marcaId: 5, opcionIds: [999] })).toThrow(/no pertenece/i);
  });

  it('rechaza dos opciones del mismo grupo', () => {
    expect(() => armarProducto(CONFIG, { marcaId: 5, opcionIds: [100, 101] })).toThrow(/más de una/i);
  });

  it('rechaza si falta un eje obligatorio', () => {
    expect(() => armarProducto(CONFIG, { marcaId: 5, opcionIds: [200] })).toThrow(/obligatorio/i);
  });

  it('acepta omitir un eje no obligatorio', () => {
    const p = armarProducto(CONFIG, { marcaId: 5, opcionIds: [100] });
    expect(p.codigo).toBe('101-PODEROSA-CAFE');
  });

  it('no repite la referencia cuando la marca ya arranca con su nombre', () => {
    const cfg: ReferenciaConfigData = {
      referencia: { id: 1, codigo: '101', nombreInterno: 'PODEROSA' },
      marcas: [
        { id: 60, codigo: '60', nombre: 'PODEROSA' },
        { id: 61, codigo: '61', nombre: 'Poderosa Café' },
        { id: 62, codigo: '62', nombre: 'PODEROSAS' },
      ],
      ejes: [],
    };
    expect(armarProducto(cfg, { marcaId: 60, opcionIds: [] }).nombreComercial).toBe('PODEROSA');
    expect(armarProducto(cfg, { marcaId: 61, opcionIds: [] }).nombreComercial).toBe('Poderosa Café');
    // Solo palabra completa: "PODEROSAS" no es la referencia repetida.
    expect(armarProducto(cfg, { marcaId: 62, opcionIds: [] }).nombreComercial).toBe(
      'PODEROSA · PODEROSAS',
    );
  });
});

describe('esViolacionUnica', () => {
  it('reconoce el P2002 de Prisma y nada más', () => {
    expect(esViolacionUnica({ code: 'P2002' })).toBe(true);
    expect(esViolacionUnica({ code: 'P2025' })).toBe(false);
    expect(esViolacionUnica(new Error('x'))).toBe(false);
    expect(esViolacionUnica(null)).toBe(false);
  });
});
