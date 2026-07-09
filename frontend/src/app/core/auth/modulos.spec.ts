import { puedeVerModulo, puedeVerNivel, rutaInicial } from './modulos';

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
    expect(puedeVerModulo('ADMIN', 'compras')).toBeTrue();
    expect(puedeVerModulo('GERENTE', 'indicadores')).toBeTrue();
  });

  it('rol nulo o desconocido ve todo (defensivo, no rompe a usuarios internos)', () => {
    expect(puedeVerModulo(null, 'facturas')).toBeTrue();
    expect(puedeVerModulo(undefined, 'facturas')).toBeTrue();
  });

  describe('perfil STAGE (próxima entrega)', () => {
    it('ve todo lo del cliente (ENTREGADO)', () => {
      expect(puedeVerModulo('STAGE', 'clientes')).toBeTrue();
      expect(puedeVerModulo('STAGE', 'pedidos')).toBeTrue();
      expect(puedeVerModulo('STAGE', 'catalogo')).toBeTrue();
    });

    it('ve además los módulos EN_STAGE (Fase A: compras con costo)', () => {
      expect(puedeVerModulo('STAGE', 'compras')).toBeTrue();
    });

    it('NO ve los módulos INTERNOS (adelantados, solo roles internos)', () => {
      expect(puedeVerModulo('STAGE', 'inicio')).toBeFalse();
      expect(puedeVerModulo('STAGE', 'facturas')).toBeFalse();
      expect(puedeVerModulo('STAGE', 'reportes')).toBeFalse();
      expect(puedeVerModulo('STAGE', 'maestros')).toBeFalse();
    });
  });
});

describe('puedeVerNivel (gate de secciones dentro de un módulo)', () => {
  it('CLIENTE solo alcanza lo ENTREGADO', () => {
    expect(puedeVerNivel('CLIENTE', 'ENTREGADO')).toBeTrue();
    expect(puedeVerNivel('CLIENTE', 'EN_STAGE')).toBeFalse();
    expect(puedeVerNivel('CLIENTE', 'INTERNO')).toBeFalse();
  });

  it('STAGE alcanza ENTREGADO y EN_STAGE, pero no INTERNO', () => {
    expect(puedeVerNivel('STAGE', 'ENTREGADO')).toBeTrue();
    expect(puedeVerNivel('STAGE', 'EN_STAGE')).toBeTrue();
    expect(puedeVerNivel('STAGE', 'INTERNO')).toBeFalse();
  });

  it('roles internos y desconocidos alcanzan todo', () => {
    expect(puedeVerNivel('ADMIN', 'INTERNO')).toBeTrue();
    expect(puedeVerNivel(null, 'INTERNO')).toBeTrue();
  });
});

describe('rutaInicial', () => {
  it('CLIENTE aterriza en /pedidos/oc', () => {
    expect(rutaInicial('CLIENTE')).toBe('/pedidos/oc');
  });
  it('STAGE también aterriza en la capa comercial (/pedidos/oc)', () => {
    expect(rutaInicial('STAGE')).toBe('/pedidos/oc');
  });
  it('los roles internos aterrizan en /inicio', () => {
    expect(rutaInicial('ADMIN')).toBe('/inicio');
    expect(rutaInicial(null)).toBe('/inicio');
  });
});
