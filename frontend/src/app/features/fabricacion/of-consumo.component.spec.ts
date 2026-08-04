import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { OfConsumoComponent } from './of-consumo.component';

const URL = 'http://localhost:3001/fabricacion/of/5/consumo';

const RESPUESTA = {
  ofId: 5,
  consecutivo: 31,
  lineas: [
    {
      materialId: 1, teorico: 24, entregado: 30, diferencia: 6,
      materialCodigo: 'CUERO-01', materialNombre: 'Cuero graso', unidad: 'DM2',
    },
    {
      materialId: 2, teorico: 12, entregado: 0, diferencia: -12,
      materialCodigo: 'HILO-05', materialNombre: 'Hilo poliéster', unidad: 'MT',
    },
  ],
};

describe('OfConsumoComponent', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [OfConsumoComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: {
          snapshot: { paramMap: convertToParamMap({ id: '5' }) },
          paramMap: of(convertToParamMap({ id: '5' })),
        } },
      ],
    });
    const fixture = TestBed.createComponent(OfConsumoComponent);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    return { fixture, http, comp: fixture.componentInstance };
  }

  it('muestra el teórico, lo entregado y la diferencia de cada material', () => {
    const { fixture, http } = setup();
    http.expectOne(URL).flush(RESPUESTA);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('OF-31');
    expect(text).toContain('CUERO-01');
    expect(text).toContain('Hilo poliéster');
    expect(text).toContain('+6'); // se gastó de más
    expect(text).toContain('-12'); // todavía no se entrega
    http.verify();
  });

  it('el botón de registrar arranca deshabilitado y se habilita al teclear una cantidad', () => {
    const { fixture, http, comp } = setup();
    http.expectOne(URL).flush(RESPUESTA);
    fixture.detectChanges();

    const boton = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    expect(boton.hasAttribute('disabled')).toBe(true);

    comp.setCantidad(2, 12);
    fixture.detectChanges();
    expect(boton.hasAttribute('disabled')).toBe(false);
    http.verify();
  });

  it('envía solo las líneas con cantidad y repinta con lo que devuelve el backend', () => {
    const { fixture, http, comp } = setup();
    http.expectOne(URL).flush(RESPUESTA);
    fixture.detectChanges();

    comp.setCantidad(1, 0); // no se envía
    comp.setCantidad(2, 12);
    comp.observaciones = ' turno de la tarde ';
    comp.registrar();

    const req = http.expectOne(URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      lineas: [{ materialId: 2, cantidad: 12 }],
      observaciones: 'turno de la tarde',
    });

    req.flush({
      ...RESPUESTA,
      lineas: [
        RESPUESTA.lineas[0],
        { ...RESPUESTA.lineas[1], entregado: 12, diferencia: 0 },
      ],
    });
    fixture.detectChanges();

    expect(comp.lineas()[1].entregado).toBe(12);
    expect(comp.aEntregar()).toEqual({}); // la columna queda limpia para la próxima entrega
    expect(comp.ok()).toBe(true);
    http.verify();
  });

  it('muestra el mensaje del backend cuando no alcanza el stock', () => {
    const { fixture, http, comp } = setup();
    http.expectOne(URL).flush(RESPUESTA);
    fixture.detectChanges();

    comp.setCantidad(2, 999);
    comp.registrar();
    http.expectOne(URL).flush(
      { message: 'Material HILO-05: hay 10 en bodega y se quieren entregar 999' },
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();

    expect(comp.guardando()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('hay 10 en bodega');
    http.verify();
  });

  it('si la OF no carga muestra el error y no rompe', () => {
    const { fixture, http, comp } = setup();
    http.expectOne(URL).error(new ProgressEvent('error'), { status: 500 });
    fixture.detectChanges();

    expect(comp.error()).toContain('No se pudo cargar');
    http.verify();
  });
});
