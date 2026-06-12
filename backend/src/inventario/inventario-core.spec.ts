import { validarMovimientoMaterial } from './inventario-core';

describe('validarMovimientoMaterial', () => {
  it('acepta ENTRADA por COMPRA', () => {
    expect(
      validarMovimientoMaterial({ tipo: 'ENTRADA', motivo: 'COMPRA', cantidad: 10 }),
    ).toBeNull();
  });

  it('acepta SALIDA por DEVOLUCION_PROVEEDOR', () => {
    expect(
      validarMovimientoMaterial({ tipo: 'SALIDA', motivo: 'DEVOLUCION_PROVEEDOR', cantidad: 5 }),
    ).toBeNull();
  });

  it('acepta SALIDA por CONSUMO_PRODUCCION', () => {
    expect(
      validarMovimientoMaterial({ tipo: 'SALIDA', motivo: 'CONSUMO_PRODUCCION', cantidad: 1.5 }),
    ).toBeNull();
  });

  it('acepta AJUSTE_MANUAL en ambos sentidos', () => {
    expect(
      validarMovimientoMaterial({ tipo: 'ENTRADA', motivo: 'AJUSTE_MANUAL', cantidad: 1 }),
    ).toBeNull();
    expect(
      validarMovimientoMaterial({ tipo: 'SALIDA', motivo: 'AJUSTE_MANUAL', cantidad: 1 }),
    ).toBeNull();
  });

  it('rechaza cantidad cero o negativa', () => {
    expect(
      validarMovimientoMaterial({ tipo: 'ENTRADA', motivo: 'COMPRA', cantidad: 0 }),
    ).toMatch(/cantidad/i);
    expect(
      validarMovimientoMaterial({ tipo: 'ENTRADA', motivo: 'COMPRA', cantidad: -3 }),
    ).toMatch(/cantidad/i);
  });

  it('rechaza motivos del sistema (PRODUCCION / DESPACHO)', () => {
    expect(
      validarMovimientoMaterial({ tipo: 'ENTRADA', motivo: 'PRODUCCION', cantidad: 1 }),
    ).toMatch(/sistema/i);
    expect(
      validarMovimientoMaterial({ tipo: 'SALIDA', motivo: 'DESPACHO', cantidad: 1 }),
    ).toMatch(/sistema/i);
  });

  it('rechaza DEVOLUCION_CLIENTE para materia prima (es de PT)', () => {
    expect(
      validarMovimientoMaterial({ tipo: 'ENTRADA', motivo: 'DEVOLUCION_CLIENTE', cantidad: 1 }),
    ).toMatch(/producto terminado/i);
  });

  it('rechaza combinaciones tipo/motivo incoherentes', () => {
    // una COMPRA no puede ser SALIDA, una devolución a proveedor no puede ser ENTRADA
    expect(
      validarMovimientoMaterial({ tipo: 'SALIDA', motivo: 'COMPRA', cantidad: 1 }),
    ).toMatch(/no corresponde/i);
    expect(
      validarMovimientoMaterial({ tipo: 'ENTRADA', motivo: 'DEVOLUCION_PROVEEDOR', cantidad: 1 }),
    ).toMatch(/no corresponde/i);
  });
});
