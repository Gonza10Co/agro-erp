import { NIVEL_SECCION, Seccion, puedeVerModulo, puedeVerNivel, puedeVerSeccion, rutaInicial } from './modulos';

describe('puedeVerModulo', () => {
  it('CLIENTE ve clientes, pedidos, catálogo y sus datos maestros', () => {
    expect(puedeVerModulo('CLIENTE', 'clientes')).toBeTrue();
    expect(puedeVerModulo('CLIENTE', 'pedidos')).toBeTrue();
    expect(puedeVerModulo('CLIENTE', 'catalogo')).toBeTrue();
    // Liberado el 2026-07-09: el cliente crea sus marcas, referencias y materiales.
    expect(puedeVerModulo('CLIENTE', 'maestros')).toBeTrue();
    // Liberado el 2026-07-17 (demo Entrega 2): compras de insumos con costo.
    expect(puedeVerModulo('CLIENTE', 'compras')).toBeTrue();
  });

  it('CLIENTE ve lo liberado el 2026-08-08 (Entregas 5 y 6, ya demostradas)', () => {
    // Facturación, con la factura de servicio de la maquila Feroz adentro.
    expect(puedeVerModulo('CLIENTE', 'facturas')).toBeTrue();
    // Piso de planta en modo consulta: ve el avance, pero no opera (ver
    // `operar-produccion`, que se queda en EN_STAGE mientras despachos sea INTERNO).
    expect(puedeVerModulo('CLIENTE', 'fabricacion')).toBeTrue();
    // Reporte diario gerencial: meta diaria contra días hábiles y metas por célula.
    expect(puedeVerModulo('CLIENTE', 'reportes')).toBeTrue();
  });

  it('CLIENTE NO ve administracion: es la proxima entrega (EN_STAGE)', () => {
    // El escalafón vuelve a tener uso tras la liberación total del 2026-08-12.
    // Sube a ENTREGADO el día que se muestre la demo, no antes.
    expect(puedeVerModulo('CLIENTE', 'administracion')).toBeFalse();
    expect(puedeVerModulo('STAGE', 'administracion')).toBeTrue();
    expect(puedeVerModulo('ADMIN', 'administracion')).toBeTrue();
  });

  it('CLIENTE ve el resto del sistema, liberado el 2026-08-12', () => {
    // Cierra el ciclo: el despacho que origina la factura, la cartera que lo
    // bloquea y el inventario que descarga. Tenerlos INTERNOS le abría huecos en
    // los módulos que sí tenía, no le ocultaba una demo futura.
    expect(puedeVerModulo('CLIENTE', 'despachos')).toBeTrue();
    expect(puedeVerModulo('CLIENTE', 'cartera')).toBeTrue();
    expect(puedeVerModulo('CLIENTE', 'inventario')).toBeTrue();
    expect(puedeVerModulo('CLIENTE', 'proveedores')).toBeTrue();
    expect(puedeVerModulo('CLIENTE', 'calidad')).toBeTrue();
    expect(puedeVerModulo('CLIENTE', 'indicadores')).toBeTrue();
    expect(puedeVerModulo('CLIENTE', 'inicio')).toBeTrue();
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
      expect(puedeVerModulo('STAGE', 'maestros')).toBeTrue();
    });

    it('ve compras, ya liberada al cliente en la Entrega 2', () => {
      expect(puedeVerModulo('STAGE', 'compras')).toBeTrue();
    });

    it('lo que STAGE ve de más es de sección y de módulo', () => {
      expect(puedeVerNivel('STAGE', 'EN_STAGE')).toBeTrue();
      expect(puedeVerNivel('CLIENTE', 'EN_STAGE')).toBeFalse();
    });

    // Entregas 5 y 6 — liberadas al cliente el 2026-08-08. STAGE las sigue viendo,
    // ahora por herencia: su alcance incluye todo lo ENTREGADO. Se dejan asertadas
    // para que una regresión que las devuelva a INTERNO no pase inadvertida.
    it('ve facturas, fabricacion y reportes, ya liberados al cliente', () => {
      expect(puedeVerModulo('STAGE', 'facturas')).toBeTrue();
      expect(puedeVerSeccion('STAGE', 'factura-servicio')).toBeTrue();
      expect(puedeVerModulo('STAGE', 'fabricacion')).toBeTrue();
      expect(puedeVerModulo('STAGE', 'reportes')).toBeTrue();
    });

    // Ya no queda ningún módulo INTERNO (2026-08-12): STAGE los ve todos, ahora por
    // herencia de ENTREGADO. Lo que se asserta es que el ESCALAFÓN sigue vivo, para
    // que la próxima entrega pueda volver a nacer oculta al cliente.
    it('sigue alcanzando EN_STAGE, que es lo que lo distingue del cliente', () => {
      expect(puedeVerNivel('STAGE', 'EN_STAGE')).toBeTrue();
      expect(puedeVerNivel('STAGE', 'INTERNO')).toBeFalse();
      expect(puedeVerModulo('STAGE', 'inicio')).toBeTrue();
      expect(puedeVerModulo('STAGE', 'despachos')).toBeTrue();
      // Y eso es exactamente lo que le deja ver la próxima entrega en la demo.
      expect(puedeVerModulo('STAGE', 'administracion')).toBeTrue();
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

describe('puedeVerSeccion (tablero de la demo)', () => {
  it('el CLIENTE ya OPERA producción, liberado el 2026-08-12', () => {
    // "Generar OF" y "Despachar" escriben hacia `despachos`, que se liberó el mismo
    // día: era la condición que retenía esta sección. Ojo: el gate siempre fue de
    // UI (el POST corría igual), así que lo que cambia es que ahora ve el botón.
    expect(puedeVerSeccion('CLIENTE', 'operar-produccion')).toBeTrue();
  });

  it('no queda ninguna sección reservada: el tablero está todo en ENTREGADO', () => {
    // Centinela de la próxima entrega: cuando algo nuevo nazca en EN_STAGE, este
    // test cae y obliga a decidir a conciencia si va oculto al cliente o no.
    const secciones = Object.keys(NIVEL_SECCION) as Seccion[];
    for (const s of secciones) {
      expect(puedeVerSeccion('CLIENTE', s)).withContext(s).toBeTrue();
    }
  });

  it('el CLIENTE ve la factura de servicio, liberada el 2026-08-08', () => {
    // Entrega 5, la maquila de Feroz. Subió junto con su módulo `facturas`: el
    // módulo manda sobre la sección, así que había que bajar ambos.
    expect(puedeVerSeccion('CLIENTE', 'factura-servicio')).toBeTrue();
  });

  it('el CLIENTE ve lo liberado en la demo de la Entrega 5 (2026-07-31)', () => {
    // Línea de producción por pedido: era el titular de la Entrega 3.
    expect(puedeVerSeccion('CLIENTE', 'linea-pedido')).toBeTrue();
    // Selector de calidad PRIMERA/SEGUNDA en el wizard de la OC.
    expect(puedeVerSeccion('CLIENTE', 'venta-segundas')).toBeTrue();
  });

  it('el CLIENTE sí ve la Entrega 4, liberada el 2026-07-25', () => {
    // El amarre ya le corría al generar la OP (le reservaba stock de su bodega):
    // ocultarle el resultado era peor que mostrárselo.
    expect(puedeVerSeccion('CLIENTE', 'amarre-insumos')).toBeTrue();
    expect(puedeVerSeccion('CLIENTE', 'recalcular-requerimiento')).toBeTrue();
    expect(puedeVerSeccion('CLIENTE', 'ocp-manual')).toBeTrue();
    expect(puedeVerSeccion('CLIENTE', 'ocp-anular')).toBeTrue();
    expect(puedeVerSeccion('CLIENTE', 'costo-ocp')).toBeTrue();
  });

  it('el perfil STAGE ve todas las secciones (es el perfil de la demo)', () => {
    const secciones = Object.keys(NIVEL_SECCION) as Seccion[];
    for (const s of secciones) {
      expect(puedeVerSeccion('STAGE', s)).withContext(s).toBeTrue();
    }
  });

  it('las secciones de la Entrega 2 siguen liberadas', () => {
    expect(puedeVerSeccion('CLIENTE', 'costo-utilidad-oc')).toBeTrue();
    expect(puedeVerSeccion('CLIENTE', 'proforma-oc')).toBeTrue();
  });

  it('los roles internos ven todo', () => {
    expect(puedeVerSeccion('ADMIN', 'operar-produccion')).toBeTrue();
    expect(puedeVerSeccion(null, 'linea-pedido')).toBeTrue();
  });
});

describe('rutaInicial', () => {
  // Desde el 2026-08-12 `inicio` es ENTREGADO ⇒ todos aterrizan en el panel. Antes
  // cliente y stage caían en /pedidos/oc porque el dashboard enlazaba a módulos que
  // no podían abrir; ya no queda ninguno.
  it('CLIENTE y STAGE aterrizan en el panel de inicio', () => {
    expect(rutaInicial('CLIENTE')).toBe('/inicio');
    expect(rutaInicial('STAGE')).toBe('/inicio');
  });
  it('los roles internos aterrizan en /inicio', () => {
    expect(rutaInicial('ADMIN')).toBe('/inicio');
    expect(rutaInicial(null)).toBe('/inicio');
  });
});
