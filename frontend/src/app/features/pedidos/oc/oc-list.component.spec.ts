import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { OcListComponent } from './oc-list.component';
import { PedidosApi } from '../../../core/api/pedidos.api';

const OC_FILA = {
  id: 7, consecutivo: 12, clienteId: 1, fecha: '2026-06-01T00:00:00.000Z', estado: 'CONFIRMADA',
  cliente: { id: 1, nit: '900', nombre: 'ACME' }, ordenProduccion: null,
};

describe('OcListComponent', () => {
  let apiMock: { listarOC: jasmine.Spy; obtenerOC: jasmine.Spy };
  function setup() {
    apiMock = {
      listarOC: jasmine.createSpy('listarOC').and.returnValue(of([OC_FILA])),
      obtenerOC: jasmine.createSpy('obtenerOC').and.returnValue(of(OC_FILA)),
    };
    TestBed.configureTestingModule({
      imports: [OcListComponent],
      providers: [{ provide: PedidosApi, useValue: apiMock }],
    });
    return TestBed.createComponent(OcListComponent);
  }

  it('carga las OCs al iniciar y las expone', () => {
    const fixture = setup();
    fixture.detectChanges();
    expect(apiMock.listarOC).toHaveBeenCalled();
    expect(fixture.componentInstance.ocs().length).toBe(1);
    expect(fixture.componentInstance.cargando()).toBe(false);
  });

  it('abrir(oc) selecciona la fila y arma el título; cerrar() limpia la selección', () => {
    const fixture = setup();
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    expect(cmp.seleccionada()).toBeNull();
    cmp.abrir(OC_FILA as any);
    expect(cmp.seleccionada()?.id).toBe(7);
    expect(cmp.tituloDrawer()).toBe('OC #12');
    cmp.cerrar();
    expect(cmp.seleccionada()).toBeNull();
  });

  it('onCambio() recarga la lista (mantiene los datos frescos detrás del drawer)', () => {
    const fixture = setup();
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    cmp.onCambio();
    expect(apiMock.listarOC).toHaveBeenCalledTimes(2); // init + recarga
  });
});
