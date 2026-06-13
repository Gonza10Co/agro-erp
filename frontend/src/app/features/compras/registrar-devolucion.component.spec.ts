import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { RegistrarDevolucionComponent } from './registrar-devolucion.component';
import { ComprasApi } from '../../core/api/compras.api';
import { OcpDetalle } from '../../core/api/models/compras.models';

const ocp: OcpDetalle = {
  id: 10,
  consecutivo: 1,
  proveedor: { id: 7, nombre: 'Curtiembre Andina' },
  requerimiento: null,
  fecha: '2026-06-12',
  estado: 'PARCIAL',
  observaciones: null,
  lineas: [
    { id: 1, materialId: 7, materialCodigo: 'MICRO-NEG', materialNombre: 'Microfibra negra', unidad: 'm', cantPedida: 30, cantRecibida: 20, pendiente: 10 },
    { id: 2, materialId: 8, materialCodigo: 'POLIOL', materialNombre: 'Poliol', unidad: 'kg', cantPedida: 8, cantRecibida: 0, pendiente: 8 },
  ],
  recepciones: [],
  devoluciones: [],
};

function setup(apiOverride: Partial<ComprasApi> = {}) {
  const api = { registrarDevolucion: jasmine.createSpy().and.returnValue(of({ id: 1, consecutivo: 1 })), ...apiOverride };
  TestBed.configureTestingModule({
    imports: [RegistrarDevolucionComponent],
    providers: [{ provide: ComprasApi, useValue: api }],
  });
  const fixture = TestBed.createComponent(RegistrarDevolucionComponent);
  fixture.componentRef.setInput('ocp', ocp);
  fixture.detectChanges();
  return { fixture, api };
}

describe('RegistrarDevolucionComponent', () => {
  it('lista solo materiales con algo recibido', () => {
    const { fixture } = setup();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('MICRO-NEG');
    expect(el.textContent).not.toContain('POLIOL');
  });

  it('exige causa y al menos una cantidad', () => {
    const { fixture, api } = setup();
    fixture.componentInstance.registrar();
    expect(api.registrarDevolucion).not.toHaveBeenCalled();
    expect(fixture.componentInstance.error()).toContain('causa');

    fixture.componentInstance.causa.set('Defectos');
    fixture.componentInstance.registrar();
    expect(api.registrarDevolucion).not.toHaveBeenCalled();
    expect(fixture.componentInstance.error()).toContain('cantidad');
  });

  it('envía la devolución y emite done', () => {
    const { fixture, api } = setup();
    const done = spyOn(fixture.componentInstance.done, 'emit');
    fixture.componentInstance.causa.set('Lote con hongos');
    fixture.componentInstance.cantidades.set({ 7: 3 });
    fixture.componentInstance.registrar();
    expect(api.registrarDevolucion).toHaveBeenCalledWith(10, {
      causa: 'Lote con hongos',
      lineas: [{ materialId: 7, cantidad: 3 }],
      observaciones: undefined,
    });
    expect(done).toHaveBeenCalled();
  });

  it('muestra el error del backend (stock insuficiente)', () => {
    const { fixture } = setup({
      registrarDevolucion: jasmine.createSpy().and.returnValue(
        throwError(() => ({ error: { message: 'Stock insuficiente' } })),
      ),
    } as any);
    fixture.componentInstance.causa.set('Defectos');
    fixture.componentInstance.cantidades.set({ 7: 999 });
    fixture.componentInstance.registrar();
    expect(fixture.componentInstance.error()).toContain('Stock insuficiente');
  });
});
