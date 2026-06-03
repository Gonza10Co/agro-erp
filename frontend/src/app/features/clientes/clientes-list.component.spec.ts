import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ClientesListComponent } from './clientes-list.component';
import { ClientesApi } from '../../core/api/clientes.api';

describe('ClientesListComponent', () => {
  let apiMock: { listar: jasmine.Spy };
  function setup() {
    apiMock = { listar: jasmine.createSpy('listar').and.returnValue(of([
      { id: 1, nit: '900', nombre: 'ACME', ciudad: 'Ibagué', tipoCredito: 'CONTADO', estadoCartera: 'AL_DIA', activo: true },
    ])) };
    TestBed.configureTestingModule({
      imports: [ClientesListComponent],
      providers: [{ provide: ClientesApi, useValue: apiMock }],
    });
    return TestBed.createComponent(ClientesListComponent);
  }

  it('carga los clientes al iniciar y los expone', () => {
    const fixture = setup();
    fixture.detectChanges();
    expect(apiMock.listar).toHaveBeenCalled();
    expect(fixture.componentInstance.clientes().length).toBe(1);
    expect(fixture.componentInstance.cargando()).toBe(false);
  });

  it('abrir() y cerrar() controlan el drawer', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    expect(cmp.drawerAbierto()).toBe(false);
    cmp.abrir();
    expect(cmp.drawerAbierto()).toBe(true);
    cmp.cerrar();
    expect(cmp.drawerAbierto()).toBe(false);
  });

  it('onCreado() cierra el drawer y recarga la lista', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp.abrir();
    cmp.onCreado();
    expect(cmp.drawerAbierto()).toBe(false);
    expect(apiMock.listar).toHaveBeenCalledTimes(2); // constructor + recarga
  });
});
