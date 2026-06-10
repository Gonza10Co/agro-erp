import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { ParDetalleComponent } from './par-detalle.component';

describe('ParDetalleComponent', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [ParDetalleComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ codigo: 'OF5-0001' }) } } },
      ],
    });
    const fixture = TestBed.createComponent(ParDetalleComponent);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    return { fixture, http };
  }

  it('muestra el QR del par y su recorrido de trazabilidad', () => {
    const { fixture, http } = setup();
    http.expectOne('http://localhost:3001/fabricacion/par/OF5-0001').flush({
      id: 9, codigo: 'OF5-0001', estado: 'EN_PROCESO', celulaActual: 'GUARNICION',
      of: { consecutivo: 5 }, talla: { valor: 38 },
      eventos: [
        { id: 1, celula: 'CORTE', timestamp: '2026-06-07T10:00:00Z', operario: { nombre: 'Pedro' }, maquina: { nombre: 'Cortadora 1' } },
      ],
    });
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('OF5-0001');
    expect(text).toContain('Pedro');
    expect(text).toContain('Cortadora 1');
    http.verify();
  });

  it('muestra error si el par no existe', () => {
    const { fixture, http } = setup();
    http.expectOne('http://localhost:3001/fabricacion/par/OF5-0001').error(new ProgressEvent('error'), { status: 404 });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Par no encontrado');
    http.verify();
  });
});
