import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { OcDetalleComponent } from './oc-detalle.component';
import { PedidosApi } from '../../../core/api/pedidos.api';

const OC_BORRADOR = {
  id: 7, consecutivo: 12, clienteId: 1, fecha: '2026-06-01T00:00:00.000Z', estado: 'BORRADOR',
  cliente: { id: 1, nit: '900', nombre: 'ACME', tipoCredito: 'CONTADO', estadoCartera: 'AL_DIA', activo: true },
  ordenProduccion: null,
  lineas: [
    { id: 1, productoConfiguradoId: 3, productoConfigurado: { id: 3, codigo: 'BR-001', nombreComercial: 'Bota Río', referenciaId: 1, marcaId: 1 },
      tallas: [ { id: 1, tallaId: 1, cantidad: 5, talla: { id: 1, valor: 38, orden: 1 } } ] },
  ],
};

describe('OcDetalleComponent', () => {
  let apiMock: { obtenerOC: jasmine.Spy; confirmarOC: jasmine.Spy; generarOP: jasmine.Spy };
  function setup(ocId = 7) {
    apiMock = {
      obtenerOC: jasmine.createSpy('obtenerOC').and.returnValue(of(OC_BORRADOR)),
      confirmarOC: jasmine.createSpy('confirmarOC').and.returnValue(of({ id: 7, estado: 'CONFIRMADA' })),
      generarOP: jasmine.createSpy('generarOP').and.returnValue(of({ id: 50, consecutivo: 1 })),
    };
    TestBed.configureTestingModule({
      imports: [OcDetalleComponent],
      providers: [{ provide: PedidosApi, useValue: apiMock }, provideRouter([])],
    });
    const fixture = TestBed.createComponent(OcDetalleComponent);
    fixture.componentRef.setInput('ocId', ocId);
    return fixture;
  }

  it('carga el detalle de la OC al iniciar', () => {
    const fixture = setup();
    fixture.detectChanges();
    expect(apiMock.obtenerOC).toHaveBeenCalledWith(7);
    expect(fixture.componentInstance.oc()?.consecutivo).toBe(12);
    expect(fixture.componentInstance.cargando()).toBe(false);
  });

  it('confirmar() llama a confirmarOC, recarga el detalle y emite changed', () => {
    const fixture = setup();
    fixture.detectChanges();
    let cambio = false;
    fixture.componentInstance.changed.subscribe(() => (cambio = true));
    fixture.componentInstance.confirmar();
    expect(apiMock.confirmarOC).toHaveBeenCalledWith(7);
    expect(apiMock.obtenerOC).toHaveBeenCalledTimes(2); // init + recarga
    expect(cambio).toBe(true);
  });

  it('generarOP() llama a generarOP, recarga el detalle y emite changed', () => {
    const fixture = setup();
    fixture.detectChanges();
    let cambio = false;
    fixture.componentInstance.changed.subscribe(() => (cambio = true));
    fixture.componentInstance.generarOP();
    expect(apiMock.generarOP).toHaveBeenCalledWith(7);
    expect(apiMock.obtenerOC).toHaveBeenCalledTimes(2);
    expect(cambio).toBe(true);
  });

  it('muestra el mensaje de error (array) cuando la acción falla', () => {
    const fixture = setup();
    fixture.detectChanges();
    apiMock.confirmarOC.and.returnValue(throwError(() => ({ error: { message: ['Cliente inactivo', 'Talla fuera de rango'] } })));
    fixture.componentInstance.confirmar();
    expect(fixture.componentInstance.error()).toBe('Cliente inactivo Talla fuera de rango');
    expect(fixture.componentInstance.accion()).toBe(false);
  });

  it('si obtenerOC falla al cargar, cargando vuelve a false (no queda colgado)', () => {
    const fixture = setup();
    apiMock.obtenerOC.and.returnValue(throwError(() => ({ status: 500 })));
    fixture.detectChanges();
    expect(fixture.componentInstance.cargando()).toBe(false);
    expect(fixture.componentInstance.oc()).toBeNull();
  });

  it('cuando la OC tiene ordenProduccion, el enlace apunta a /pedidos/op/:id', () => {
    const fixture = setup();
    apiMock.obtenerOC.and.returnValue(of({
      ...OC_BORRADOR,
      estado: 'CONFIRMADA',
      ordenProduccion: { id: 7, consecutivo: 1187, estado: 'AMARRADA' },
    }));
    fixture.detectChanges();
    const anchor: HTMLAnchorElement = fixture.nativeElement.querySelector('a[href]');
    expect(anchor).withContext('debe existir un enlace <a> a la OP').toBeTruthy();
    expect(anchor.getAttribute('href')).toContain('/pedidos/op/7');
  });
});
