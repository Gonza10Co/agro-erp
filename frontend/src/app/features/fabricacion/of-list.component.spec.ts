import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { OfListComponent } from './of-list.component';

describe('OfListComponent', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [OfListComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(OfListComponent);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('http://localhost:3001/fabricacion/of').flush([
      { id: 1, consecutivo: 5, estado: 'TERMINADA', fecha: '2026-06-07', op: { consecutivo: 9005 }, _count: { pares: 12 }, programados: 1206 },
    ]);
    fixture.detectChanges();
    return { fixture, http };
  }

  it('lista las OF con su OP, conteo de pares y badge de estado', () => {
    const { fixture, http } = setup();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('OF-5');
    expect(el.textContent).toContain('OP-9005');
    expect(el.textContent).toContain('12');
    expect(el.querySelector('.badge-accent')).toBeTruthy(); // TERMINADA resalta
    http.verify();
  });

  it('muestra los pares nacidos sobre los programados, no solo los nacidos', () => {
    const { fixture, http } = setup();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('1206');
    http.verify();
  });

  it('la reimpresión busca UN par por código, nunca la OF entera', () => {
    const { fixture, http } = setup();
    const c = fixture.componentInstance;
    c.codigoBuscado = 'of1-0007'; // el operario teclea como puede; el código va en mayúsculas
    c.buscarPar();
    http.expectOne('http://localhost:3001/fabricacion/par/OF1-0007').flush({
      id: 7, codigo: 'OF1-0007', celulaActual: 'GUARNICION', estado: 'EN_PROCESO',
      of: { consecutivo: 1 }, talla: { valor: '38' },
      productoConfigurado: { id: 3, nombreComercial: 'Bota Poderosa 101' },
      eventos: [], incidencias: [], reponeA: null, repuestoPor: null,
    });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('OF1-0007');
    expect(el.textContent).toContain('Guarnición');
    expect(c.ubicacion(c.par()!)).toBe('Guarnición');
    http.verify();
  });

  it('avisa cuando el par buscado está fuera de flujo', () => {
    const { fixture, http } = setup();
    const c = fixture.componentInstance;
    c.codigoBuscado = 'OF1-0009';
    c.buscarPar();
    http.expectOne('http://localhost:3001/fabricacion/par/OF1-0009').flush({
      id: 9, codigo: 'OF1-0009', celulaActual: 'INYECCION', estado: 'DADO_DE_BAJA',
      of: { consecutivo: 1 }, talla: { valor: '40' },
      productoConfigurado: { id: 3, nombreComercial: 'Bota Poderosa 101' },
      eventos: [], incidencias: [], reponeA: null, repuestoPor: null,
    });
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('dado de baja');
    http.verify();
  });

  it('dice que no existe cuando el código no aparece', () => {
    const { fixture, http } = setup();
    const c = fixture.componentInstance;
    c.codigoBuscado = 'NO-EXISTE';
    c.buscarPar();
    http.expectOne('http://localhost:3001/fabricacion/par/NO-EXISTE').flush('x', { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    expect(c.noEncontrado()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No existe un par con ese código');
    http.verify();
  });
});
