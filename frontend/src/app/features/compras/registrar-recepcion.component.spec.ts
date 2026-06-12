import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { RegistrarRecepcionComponent } from './registrar-recepcion.component';
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
    { id: 2, materialId: 8, materialCodigo: 'POLIOL', materialNombre: 'Poliol', unidad: 'kg', cantPedida: 8, cantRecibida: 8, pendiente: 0 },
  ],
  recepciones: [],
  devoluciones: [],
};

function setup(apiOverride: Partial<ComprasApi> = {}) {
  const api = { registrarRecepcion: jasmine.createSpy().and.returnValue(of({ id: 1, consecutivo: 2, estado: 'COMPLETA' })), ...apiOverride };
  TestBed.configureTestingModule({
    imports: [RegistrarRecepcionComponent],
    providers: [{ provide: ComprasApi, useValue: api }],
  });
  const fixture = TestBed.createComponent(RegistrarRecepcionComponent);
  fixture.componentRef.setInput('ocp', ocp);
  fixture.detectChanges();
  return { fixture, api };
}

describe('RegistrarRecepcionComponent', () => {
  it('lista solo las líneas con pendiente, prellenadas con lo pendiente', async () => {
    const { fixture } = setup();
    await fixture.whenStable();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('MICRO-NEG');
    expect(el.textContent).not.toContain('POLIOL');
    const input: HTMLInputElement = el.querySelector('input[type=number]')!;
    expect(input.value).toBe('10');
  });

  it('envía solo las líneas con cantidad > 0 y emite done', () => {
    const { fixture, api } = setup();
    const done = spyOn(fixture.componentInstance.done, 'emit');
    fixture.componentInstance.registrar();
    expect(api.registrarRecepcion).toHaveBeenCalledWith(10, {
      lineas: [{ ocpLineaId: 1, cantidad: 10 }],
      observaciones: undefined,
    });
    expect(done).toHaveBeenCalled();
  });

  it('bloquea cantidades que superan lo pendiente', () => {
    const { fixture, api } = setup();
    fixture.componentInstance.cantidades.set({ 1: 99 });
    fixture.componentInstance.registrar();
    expect(api.registrarRecepcion).not.toHaveBeenCalled();
    expect(fixture.componentInstance.error()).toContain('pendiente');
  });

  it('muestra el error del backend', () => {
    const { fixture } = setup({
      registrarRecepcion: jasmine.createSpy().and.returnValue(
        throwError(() => ({ error: { message: 'supera lo pendiente' } })),
      ),
    } as any);
    fixture.componentInstance.registrar();
    expect(fixture.componentInstance.error()).toContain('supera lo pendiente');
  });
});
