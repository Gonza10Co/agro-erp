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
});
