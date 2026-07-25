import {
  costoPromedioMovil,
  estadoOcp,
  validarAnulacionOcp,
  validarOcpManual,
  validarRecepcion,
  validarDevolucion,
} from './compras-proveedor-core';

describe('estadoOcp', () => {
  it('PENDIENTE cuando nada se ha recibido', () => {
    expect(
      estadoOcp([
        { cantPedida: 200, cantRecibida: 0 },
        { cantPedida: 50, cantRecibida: 0 },
      ]),
    ).toBe('PENDIENTE');
  });

  it('PARCIAL cuando algo llegó pero falta', () => {
    expect(
      estadoOcp([
        { cantPedida: 200, cantRecibida: 100 },
        { cantPedida: 50, cantRecibida: 0 },
      ]),
    ).toBe('PARCIAL');
  });

  it('PARCIAL cuando una línea está completa y otra no', () => {
    expect(
      estadoOcp([
        { cantPedida: 200, cantRecibida: 200 },
        { cantPedida: 50, cantRecibida: 0 },
      ]),
    ).toBe('PARCIAL');
  });

  it('COMPLETA cuando todas las líneas llegaron', () => {
    expect(
      estadoOcp([
        { cantPedida: 200, cantRecibida: 200 },
        { cantPedida: 50, cantRecibida: 50 },
      ]),
    ).toBe('COMPLETA');
  });

  it('sin líneas es PENDIENTE (caso borde)', () => {
    expect(estadoOcp([])).toBe('PENDIENTE');
  });
});

describe('validarRecepcion', () => {
  const lineasOcp = [
    { id: 1, cantPedida: 200, cantRecibida: 100 }, // pendiente 100
    { id: 2, cantPedida: 50, cantRecibida: 50 }, // pendiente 0
  ];

  it('acepta una recepción válida dentro de lo pendiente', () => {
    expect(validarRecepcion(lineasOcp, [{ ocpLineaId: 1, cantidad: 100 }])).toBeNull();
  });

  it('rechaza recepción sin líneas', () => {
    expect(validarRecepcion(lineasOcp, [])).toMatch(/al menos una línea/i);
  });

  it('rechaza cantidad cero o negativa', () => {
    expect(validarRecepcion(lineasOcp, [{ ocpLineaId: 1, cantidad: 0 }])).toMatch(
      /mayor a 0/i,
    );
    expect(validarRecepcion(lineasOcp, [{ ocpLineaId: 1, cantidad: -5 }])).toMatch(
      /mayor a 0/i,
    );
  });

  it('rechaza línea que no pertenece a la OCP', () => {
    expect(validarRecepcion(lineasOcp, [{ ocpLineaId: 99, cantidad: 10 }])).toMatch(
      /no pertenece/i,
    );
  });

  it('rechaza línea repetida en el mismo documento', () => {
    expect(
      validarRecepcion(lineasOcp, [
        { ocpLineaId: 1, cantidad: 10 },
        { ocpLineaId: 1, cantidad: 20 },
      ]),
    ).toMatch(/repetida/i);
  });

  it('rechaza sobre-recepción (más de lo pendiente)', () => {
    expect(validarRecepcion(lineasOcp, [{ ocpLineaId: 1, cantidad: 101 }])).toMatch(
      /pendiente/i,
    );
    expect(validarRecepcion(lineasOcp, [{ ocpLineaId: 2, cantidad: 1 }])).toMatch(
      /pendiente/i,
    );
  });
});

describe('costoPromedioMovil', () => {
  it('sin stock previo, el promedio es el costo de la entrada', () => {
    expect(costoPromedioMovil(0, 0, 100, 250)).toBe(250);
  });

  it('pondera el costo previo con el de la entrada', () => {
    // 100 uds a $200 + 100 uds a $300 → $250
    expect(costoPromedioMovil(100, 200, 100, 300)).toBe(250);
  });

  it('el peso es proporcional a las cantidades', () => {
    // 300 uds a $100 + 100 uds a $500 → (30000 + 50000)/400 = $200
    expect(costoPromedioMovil(300, 100, 100, 500)).toBe(200);
  });

  it('si el stock resultante es 0, cae al costo de la entrada (borde)', () => {
    expect(costoPromedioMovil(-100, 100, 100, 400)).toBe(400);
  });
});

describe('validarDevolucion', () => {
  it('acepta una devolución válida', () => {
    expect(
      validarDevolucion('Cuero con hongos', [{ materialId: 7, cantidad: 10 }]),
    ).toBeNull();
  });

  it('rechaza devolución sin líneas', () => {
    expect(validarDevolucion('Defecto', [])).toMatch(/al menos una línea/i);
  });

  it('rechaza causa vacía', () => {
    expect(validarDevolucion('', [{ materialId: 7, cantidad: 10 }])).toMatch(/causa/i);
    expect(validarDevolucion('   ', [{ materialId: 7, cantidad: 10 }])).toMatch(/causa/i);
  });

  it('rechaza cantidad cero o negativa', () => {
    expect(validarDevolucion('Defecto', [{ materialId: 7, cantidad: 0 }])).toMatch(
      /mayor a 0/i,
    );
  });

  it('rechaza material repetido', () => {
    expect(
      validarDevolucion('Defecto', [
        { materialId: 7, cantidad: 5 },
        { materialId: 7, cantidad: 3 },
      ]),
    ).toMatch(/repetido/i);
  });
});

describe('validarOcpManual', () => {
  it('acepta líneas válidas con costo opcional', () => {
    expect(
      validarOcpManual([
        { materialId: 1, cantPedida: 5, costoUnitario: 800 },
        { materialId: 2, cantPedida: 3 },
      ]),
    ).toBeNull();
  });
  it('rechaza vacío, cantidades no positivas, costo en 0 y repetidos', () => {
    expect(validarOcpManual([])).toContain('al menos una línea');
    expect(validarOcpManual([{ materialId: 1, cantPedida: 0 }])).toContain('mayor a 0');
    expect(validarOcpManual([{ materialId: 1, cantPedida: 5, costoUnitario: 0 }])).toContain('costo');
    expect(
      validarOcpManual([
        { materialId: 1, cantPedida: 5 },
        { materialId: 1, cantPedida: 2 },
      ]),
    ).toContain('repetido');
  });
});

describe('validarAnulacionOcp', () => {
  it('permite anular una OCP sin mercancía movida', () => {
    expect(validarAnulacionOcp({ estado: 'PENDIENTE', recepciones: 0, devoluciones: 0 })).toBeNull();
  });
  it('rechaza anulada, con recepciones o con devoluciones', () => {
    expect(validarAnulacionOcp({ estado: 'ANULADA', recepciones: 0, devoluciones: 0 })).toContain('ya está anulada');
    expect(validarAnulacionOcp({ estado: 'PARCIAL', recepciones: 1, devoluciones: 0 })).toContain('recepciones');
    expect(validarAnulacionOcp({ estado: 'PENDIENTE', recepciones: 0, devoluciones: 1 })).toContain('devoluciones');
  });
});
