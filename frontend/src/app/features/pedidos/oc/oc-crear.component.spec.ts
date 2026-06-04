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
    fixture.detectChanges();
    return { fixture, http };
  }

  it('carga el catálogo y arranca en el paso 0 (Cliente)', () => {
    const { fixture, http } = setup();
    expect(fixture.componentInstance.paso()).toBe(0);
    expect(fixture.componentInstance.clientes().length).toBe(1);
    expect(fixture.componentInstance.productos().length).toBe(1);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Cliente');
    http.verify();
  });

  it('crear() arma el DTO y hace POST /pedidos/oc', () => {
    const { fixture, http } = setup();
    const c = fixture.componentInstance;
    // simular estado completo
    c.clienteSel.set({ id: 3, nit: '900', nombre: 'Minera El Roble', tipoCredito: 'D30', estadoCartera: 'AL_DIA', activo: true } as any);
    c.lineas.set([{ producto: c.productos()[0], valores: { 1: 12 } }]);
    c.crear();
    const req = http.expectOne('http://localhost:3001/pedidos/oc');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ clienteId: 3, ocCliente: undefined, observaciones: undefined, lineas: [{ productoConfiguradoId: 7, tallas: [{ tallaId: 1, cantidad: 12 }] }] });
    req.flush({ id: 1, consecutivo: 1, estado: 'BORRADOR' });
    http.verify();
  });
});
