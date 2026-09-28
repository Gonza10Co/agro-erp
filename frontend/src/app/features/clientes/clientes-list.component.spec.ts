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

  // ── Confirmación en línea + reactivar. El GET /clientes ya trae inactivos: el filtro es local. ──
  describe('desactivar con confirmación y reactivar', () => {
    let api: { listar: jasmine.Spy; desactivar: jasmine.Spy; reactivar: jasmine.Spy };
    function iniciar() {
      api = {
        listar: jasmine.createSpy('listar').and.returnValue(of([
          { id: 1, nit: '900', nombre: 'ACME', tipoCredito: 'CONTADO', estadoCartera: 'AL_DIA', activo: true },
          { id: 2, nit: '901', nombre: 'VIEJO', tipoCredito: 'CONTADO', estadoCartera: 'AL_DIA', activo: false },
        ])),
        desactivar: jasmine.createSpy('desactivar').and.returnValue(of({})),
        reactivar: jasmine.createSpy('reactivar').and.returnValue(of({})),
      };
      TestBed.configureTestingModule({
        imports: [ClientesListComponent],
        providers: [{ provide: ClientesApi, useValue: api }],
      });
      const fixture = TestBed.createComponent(ClientesListComponent);
      fixture.detectChanges();
      return fixture;
    }
    const el = (f: { nativeElement: HTMLElement }) => f.nativeElement as HTMLElement;
    const btn = (f: { nativeElement: HTMLElement }, accion: string) =>
      el(f).querySelector<HTMLButtonElement>(`button[data-accion="${accion}"]`)!;

    it('por defecto oculta los inactivos', () => {
      const fixture = iniciar();
      expect(el(fixture).textContent).toContain('ACME');
      expect(el(fixture).textContent).not.toContain('VIEJO');
    });

    it('el primer clic en Desactivar NO llama al backend; "Sí, desactivar" sí', () => {
      const fixture = iniciar();
      btn(fixture, 'pedir').click();
      fixture.detectChanges();
      expect(api.desactivar).not.toHaveBeenCalled();
      expect(el(fixture).textContent).toContain('¿Desactivar ACME?');
      btn(fixture, 'confirmar').click();
      expect(api.desactivar).toHaveBeenCalledOnceWith(1);
    });

    it('"Mostrar inactivos" los muestra atenuados y Reactivar llama al backend', () => {
      const fixture = iniciar();
      el(fixture).querySelector<HTMLInputElement>('label.check input[type=checkbox]')!.click();
      fixture.detectChanges();
      expect(el(fixture).querySelector('tr.is-inactive')?.textContent).toContain('VIEJO');
      const reactivar = Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('button'))
        .find((b) => b.textContent?.trim() === 'Reactivar')!;
      reactivar.click();
      expect(api.reactivar).toHaveBeenCalledOnceWith(2);
    });
  });
});
