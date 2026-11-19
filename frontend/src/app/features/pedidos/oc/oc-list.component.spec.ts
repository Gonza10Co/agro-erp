import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { OcListComponent } from './oc-list.component';
import { PedidosApi } from '../../../core/api/pedidos.api';

const OC_FILA = {
  id: 7, consecutivo: 12, clienteId: 1, fecha: '2026-06-01T00:00:00.000Z', estado: 'CONFIRMADA',
  cliente: { id: 1, nit: '900', nombre: 'ACME' }, ordenProduccion: null,
};

describe('OcListComponent', () => {
  let apiMock: { listarOC: jasmine.Spy; obtenerOC: jasmine.Spy; exportarOC: jasmine.Spy };
  function setup() {
    apiMock = {
      listarOC: jasmine.createSpy('listarOC').and.returnValue(of([OC_FILA])),
      obtenerOC: jasmine.createSpy('obtenerOC').and.returnValue(of(OC_FILA)),
      exportarOC: jasmine.createSpy('exportarOC').and.returnValue(of({ pedidos: [], tallas: [] })),
    };
    TestBed.configureTestingModule({
      imports: [OcListComponent],
      providers: [
        { provide: PedidosApi, useValue: apiMock },
        provideRouter([]),
      ],
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

  it('descargarExcel() pide el export UNA vez y baja pedidos AAAA-MM-DD.xlsx', () => {
    const fixture = setup();
    fixture.detectChanges();
    const click = spyOn(HTMLAnchorElement.prototype, 'click');
    let nombre = '';
    click.and.callFake(function (this: HTMLAnchorElement) { nombre = this.download; });
    fixture.componentInstance.descargarExcel();
    expect(apiMock.exportarOC).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(nombre).toMatch(/^pedidos \d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(fixture.componentInstance.descargando()).toBe(false);
  });

  it('el botón Descargar Excel está en la lista', () => {
    const fixture = setup();
    fixture.detectChanges();
    const botones = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    expect(botones.some((b) => b.textContent?.includes('Descargar Excel'))).toBe(true);
  });
});
