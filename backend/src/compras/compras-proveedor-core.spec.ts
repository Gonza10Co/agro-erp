import {
  estadoOcp,
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
