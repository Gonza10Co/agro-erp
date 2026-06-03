import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ClienteFormComponent } from './cliente-form.component';
import { ClientesApi } from '../../core/api/clientes.api';

describe('ClienteFormComponent', () => {
  let apiMock: { crear: jasmine.Spy };
  function setup() {
    apiMock = { crear: jasmine.createSpy('crear') };
    TestBed.configureTestingModule({
      imports: [ClienteFormComponent],
      providers: [{ provide: ClientesApi, useValue: apiMock }],
    });
    return TestBed.createComponent(ClienteFormComponent);
  }

  it('valida NIT y Nombre obligatorios y NO llama a la API', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp.nit = ''; cmp.nombre = '';
    cmp.guardar();
    expect(cmp.error()).toContain('obligatorios');
    expect(apiMock.crear).not.toHaveBeenCalled();
  });

  it('crea el cliente y emite created en éxito', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    apiMock.crear.and.returnValue(of({ id: 1, nit: '900', nombre: 'ACME' }));
    let emitido: any = null;
    cmp.created.subscribe((c: any) => (emitido = c));
    cmp.nit = '900'; cmp.nombre = 'ACME'; cmp.tipoCredito = 'D30';
    cmp.guardar();
    expect(apiMock.crear).toHaveBeenCalledWith(
      jasmine.objectContaining({ nit: '900', nombre: 'ACME', tipoCredito: 'D30' }),
    );
    expect(emitido).toEqual(jasmine.objectContaining({ id: 1 }));
    expect(cmp.loading()).toBe(false);
  });

  it('muestra error si la API falla', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    apiMock.crear.and.returnValue(throwError(() => ({ error: { message: 'NIT duplicado' } })));
    cmp.nit = '900'; cmp.nombre = 'ACME';
    cmp.guardar();
    expect(cmp.error()).toBe('NIT duplicado');
    expect(cmp.loading()).toBe(false);
  });
});
