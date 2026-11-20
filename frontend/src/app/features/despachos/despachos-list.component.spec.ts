import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DespachosListComponent } from './despachos-list.component';

describe('DespachosListComponent', () => {
  let http: HttpTestingController;
  it('lista los despachos al iniciar y los renderiza', () => {
    TestBed.configureTestingModule({
      imports: [DespachosListComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(DespachosListComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('http://localhost:3001/despachos').flush([
      { id: 1, consecutivo: 5, fecha: '2026-06-05', autorizadoPorId: null, op: { consecutivo: 12, oc: { cliente: { nombre: 'Minera El Roble' } } } },
    ]);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('DSP-5');
    expect(text).toContain('Minera El Roble');
    http.verify();
  });

  it('marca como parcial el despacho de una OP abierta o con varios despachos y suma sus pares', () => {
    TestBed.configureTestingModule({
      imports: [DespachosListComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(DespachosListComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('http://localhost:3001/despachos').flush([
      { id: 2, consecutivo: 6, fecha: '2026-11-19', autorizadoPorId: null, lineas: [{ cantidad: 8 }, { cantidad: 4 }],
        op: { consecutivo: 13, estado: 'EN_PRODUCCION', _count: { despachos: 1 }, oc: { cliente: { nombre: 'Vozincol' } } } },
      { id: 1, consecutivo: 5, fecha: '2026-11-18', autorizadoPorId: null, lineas: [{ cantidad: 20 }],
        op: { consecutivo: 12, estado: 'DESPACHADA', _count: { despachos: 1 }, oc: { cliente: { nombre: 'Terry' } } } },
    ]);
    fixture.detectChanges();
    const filas = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr');
    expect(filas[0].textContent).toContain('parcial');
    expect(filas[0].textContent).toContain('12');
    expect(filas[1].textContent).not.toContain('parcial');
    http.verify();
  });

  it('muestra el número de entrega de cada despacho y marca la final', () => {
    TestBed.configureTestingModule({
      imports: [DespachosListComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(DespachosListComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('http://localhost:3001/despachos').flush([
      { id: 3, consecutivo: 7, fecha: '2026-11-20', autorizadoPorId: null, deliveryNumber: 3, isFinal: true, lineas: [{ cantidad: 4 }],
        op: { consecutivo: 13, estado: 'DESPACHADA', _count: { despachos: 3 }, oc: { cliente: { nombre: 'Vozincol' } } } },
      { id: 2, consecutivo: 6, fecha: '2026-11-19', autorizadoPorId: null, deliveryNumber: 2, isFinal: false, lineas: [{ cantidad: 8 }],
        op: { consecutivo: 13, estado: 'DESPACHADA', _count: { despachos: 3 }, oc: { cliente: { nombre: 'Vozincol' } } } },
    ]);
    fixture.detectChanges();
    const filas = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr');
    expect(filas[0].textContent).toContain('Entrega 3 (final)');
    expect(filas[1].textContent).toContain('Entrega 2');
    expect(filas[1].textContent).not.toContain('(final)');
    http.verify();
  });
});
