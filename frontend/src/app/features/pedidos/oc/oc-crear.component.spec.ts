import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { OcCrearComponent } from './oc-crear.component';

describe('OcCrearComponent', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [OcCrearComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(OcCrearComponent);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    // carga de catálogo en ngOnInit
    http.expectOne('http://localhost:3001/clientes').flush([{ id: 3, nit: '900', nombre: 'Minera El Roble', tipoCredito: 'D30', estadoCartera: 'AL_DIA', activo: true }]);
    http.expectOne('http://localhost:3001/catalog/productos').flush([{ id: 7, codigo: 'BD', nombreComercial: 'Bota Dieléctrica', marca: { id: 1, nombre: 'PODEROSA' }, referencia: { id: 1, codigo: '101', tallaMin: { id: 1, valor: 38, orden: 1 }, tallaMax: { id: 2, valor: 39, orden: 2 } } }]);
    http.expectOne('http://localhost:3001/catalog/referencias').flush([{ id: 1, codigo: '101', nombreInterno: 'PODEROSA' }, { id: 5, codigo: '105', nombreInterno: 'RESORTADA' }]);
    http.expectOne('http://localhost:3001/catalog/tallas').flush([{ id: 1, valor: 38, orden: 1 }, { id: 2, valor: 39, orden: 2 }]);
    // Sin sesión el rol cae en INTERNO → ve el selector de línea por pedido.
    http.expectOne('http://localhost:3001/catalog/lineas').flush([
      { id: 4, codigo: 'FEROZ', nombre: 'Feroz', celulaInicial: 'INYECCION', activo: true },
      { id: 5, codigo: 'EXTERNA', nombre: 'Externa', celulaInicial: 'INYECCION', activo: false },
    ]);
    fixture.detectChanges();
    return { fixture, http };
  }

  it('carga el catálogo y arranca en el paso 0 (Cliente)', () => {
    const { fixture, http } = setup();
    expect(fixture.componentInstance.paso()).toBe(0);
    expect(fixture.componentInstance.clientes().length).toBe(1);
    expect(fixture.componentInstance.productos().length).toBe(1);
    // Solo las líneas activas llegan al selector (Externa quedó desactivada).
    expect(fixture.componentInstance.lineasProduccion().map((l) => l.codigo)).toEqual(['FEROZ']);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Cliente');
    http.verify();
  });

  it('el paso 0 exige línea de producción cuando el selector es visible', () => {
    const { fixture, http } = setup();
    const c = fixture.componentInstance;
    c.clienteSel.set({ id: 3, nit: '900', nombre: 'Minera El Roble', tipoCredito: 'D30', estadoCartera: 'AL_DIA', activo: true } as any);
    expect(c.pasoValido()).toBe(false);
    c.lineaProdId.set(4);
    expect(c.pasoValido()).toBe(true);
    http.verify();
  });

  it('crear() arma el DTO con la línea elegida y hace POST /pedidos/oc', () => {
    const { fixture, http } = setup();
    const c = fixture.componentInstance;
    // simular estado completo
    c.clienteSel.set({ id: 3, nit: '900', nombre: 'Minera El Roble', tipoCredito: 'D30', estadoCartera: 'AL_DIA', activo: true } as any);
    c.lineaProdId.set(4);
    c.lineas.set([{ producto: c.productos()[0], precio: 85000, valores: { 1: 12 } }]);
    c.crear();
    const req = http.expectOne('http://localhost:3001/pedidos/oc');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ clienteId: 3, ocCliente: undefined, observaciones: undefined, direccionDespacho: undefined, lineaId: 4, lineas: [{ productoConfiguradoId: 7, precioUnitario: 85000, tallas: [{ tallaId: 1, cantidad: 12 }] }] });
    req.flush({ id: 1, consecutivo: 1, estado: 'BORRADOR' });
    http.verify();
  });

  describe('armar producto dentro de la OC', () => {
    const BASE = 'http://localhost:3001/catalog';
    const CONFIG_105 = {
      referencia: { id: 5, codigo: '105', nombreInterno: 'RESORTADA', tallaMin: 36, tallaMax: 44 },
      marcas: [
        { id: 20, codigo: 'ALPACA', nombre: 'Alpaca', tipo: 'CLIENTE' },
        { id: 21, codigo: 'ROBLE', nombre: 'Roble', tipo: 'CLIENTE' },
      ],
      ejes: [
        { grupo: { id: 1, codigo: 'PUNTERA', nombre: 'Puntera', obligatorio: true },
          opciones: [{ id: 10, codigo: 'CP', nombre: 'Con puntera' }, { id: 11, codigo: 'SP', nombre: 'Sin puntera' }] },
        { grupo: { id: 2, codigo: 'VERSION', nombre: 'Versión', obligatorio: true },
          opciones: [{ id: 20, codigo: 'EST', nombre: 'Estándar' }] },
      ],
    };
    const armado = (id: number, creado: boolean) => ({
      id, codigo: `105-ALPACA-SP-EST`, nombreComercial: 'RESORTADA · Alpaca · Sin puntera · Estándar', creado,
      marca: { id: 20, nombre: 'Alpaca' },
      referencia: { id: 5, codigo: '105', tallaMin: { id: 1, valor: 38, orden: 1 }, tallaMax: { id: 2, valor: 39, orden: 2 } },
    });

    function elegirHastaEjes(c: OcCrearComponent, http: HttpTestingController) {
      c.elegirReferencia({ id: 5, codigo: '105', nombreInterno: 'RESORTADA' });
      http.expectOne(`${BASE}/referencias/5/config`).flush(CONFIG_105);
      // El eje de una sola opción (VERSION) viene preseleccionado; PUNTERA no.
      expect(c.ejesArmar().get(2)).toBe(20);
      expect(c.puedeArmar()).toBe(false);
      c.marcaArmar.set(CONFIG_105.marcas[0]);
      expect(c.puedeArmar()).toBe(false); // falta PUNTERA (obligatoria)
      c.setEje(1, 11);
      expect(c.puedeArmar()).toBe(true);
    }

    it('referencia → config → marca → ejes → agregar llama al endpoint y agrega la línea', () => {
      const { fixture, http } = setup();
      const c = fixture.componentInstance;
      c.paso.set(1);
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Armar producto');
      elegirHastaEjes(c, http);

      c.agregarArmado();
      const req = http.expectOne(`${BASE}/productos/obtener-o-crear`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ referenciaId: 5, marcaId: 20, opcionIds: [11, 20] });
      req.flush(armado(40, true));

      expect(c.lineas().map((l) => l.producto.id)).toEqual([40]);
      expect((c.lineas()[0].producto as any).creado).toBeUndefined();
      expect(c.productos().some((p) => p.id === 40)).toBe(true);
      expect(c.productosDisponibles().some((p) => p.id === 40)).toBe(false);
      expect(c.avisoArmar()).toContain('(nuevo)');
      // Queda la referencia; marca y ejes libres (VERSION se vuelve a preseleccionar).
      expect(c.refArmar()?.id).toBe(5);
      expect(c.marcaArmar()).toBeNull();
      expect(c.ejesArmar().get(1)).toBeNull();
      expect(c.ejesArmar().get(2)).toBe(20);
      http.verify();
    });

    it('si el producto ya está en el pedido avisa y no lo duplica', () => {
      const { fixture, http } = setup();
      const c = fixture.componentInstance;
      elegirHastaEjes(c, http);
      c.agregarArmado();
      http.expectOne(`${BASE}/productos/obtener-o-crear`).flush(armado(40, true));

      c.marcaArmar.set(CONFIG_105.marcas[0]);
      c.setEje(1, 11);
      c.agregarArmado();
      http.expectOne(`${BASE}/productos/obtener-o-crear`).flush(armado(40, false));

      expect(c.lineas().length).toBe(1);
      expect(c.productos().filter((p) => p.id === 40).length).toBe(1);
      expect(c.avisoArmar()).toContain('ya está en el pedido');
      http.verify();
    });

    it('un error del backend queda en línea y no agrega nada', () => {
      const { fixture, http } = setup();
      const c = fixture.componentInstance;
      elegirHastaEjes(c, http);
      c.agregarArmado();
      http.expectOne(`${BASE}/productos/obtener-o-crear`).flush(
        { message: 'Falta elegir Puntera (obligatorio)' }, { status: 400, statusText: 'Bad Request' });
      expect(c.lineas().length).toBe(0);
      expect(c.errorArmar()).toBe('Falta elegir Puntera (obligatorio)');
      http.verify();
    });
  });
});
