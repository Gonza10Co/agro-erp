import { puedeVerModulo, rutaInicial } from './modulos';

describe('puedeVerModulo', () => {
  it('CLIENTE solo ve clientes, pedidos y catálogo (demos 1-2)', () => {
    expect(puedeVerModulo('CLIENTE', 'clientes')).toBeTrue();
    expect(puedeVerModulo('CLIENTE', 'pedidos')).toBeTrue();
    expect(puedeVerModulo('CLIENTE', 'catalogo')).toBeTrue();
  });

  it('CLIENTE NO ve los módulos de demos posteriores', () => {
    expect(puedeVerModulo('CLIENTE', 'inicio')).toBeFalse();
    expect(puedeVerModulo('CLIENTE', 'despachos')).toBeFalse();
    expect(puedeVerModulo('CLIENTE', 'facturas')).toBeFalse();
    expect(puedeVerModulo('CLIENTE', 'cartera')).toBeFalse();
    expect(puedeVerModulo('CLIENTE', 'compras')).toBeFalse();
    expect(puedeVerModulo('CLIENTE', 'inventario')).toBeFalse();
    expect(puedeVerModulo('CLIENTE', 'fabricacion')).toBeFalse();
    expect(puedeVerModulo('CLIENTE', 'calidad')).toBeFalse();
    expect(puedeVerModulo('CLIENTE', 'indicadores')).toBeFalse();
    expect(puedeVerModulo('CLIENTE', 'reportes')).toBeFalse();
  });

  it('ADMIN y GERENTE ven todo', () => {
    expect(puedeVerModulo('ADMIN', 'facturas')).toBeTrue();
    expect(puedeVerModulo('ADMIN', 'reportes')).toBeTrue();
    expect(puedeVerModulo('GERENTE', 'indicadores')).toBeTrue();
  });

  it('rol nulo o desconocido ve todo (defensivo, no rompe a usuarios internos)', () => {
    expect(puedeVerModulo(null, 'facturas')).toBeTrue();
    expect(puedeVerModulo(undefined, 'facturas')).toBeTrue();
  });
});

describe('rutaInicial', () => {
  it('CLIENTE aterriza en /pedidos/oc', () => {
    expect(rutaInicial('CLIENTE')).toBe('/pedidos/oc');
  });
  it('los demás roles aterrizan en /inicio', () => {
    expect(rutaInicial('ADMIN')).toBe('/inicio');
    expect(rutaInicial(null)).toBe('/inicio');
  });
});
