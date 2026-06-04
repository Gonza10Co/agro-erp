import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { OpDetalleComponent } from './op-detalle.component';

describe('OpDetalleComponent', () => {
  function setup(opId = '12') {
    TestBed.configureTestingModule({
      imports: [OpDetalleComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: of({ get: () => opId }) } },
      ],
    });
    const fixture = TestBed.createComponent(OpDetalleComponent);
    const http = TestBed.inject(HttpTestingController);
    return { fixture, http };
  }

  it('carga la OP por id y muestra el consecutivo en el hero', () => {
    const { fixture, http } = setup('12');
    fixture.detectChanges();
    const req = http.expectOne('http://localhost:3001/pedidos/op/12');
    expect(req.request.method).toBe('GET');
    req.flush({
      id: 12, consecutivo: 1187, ocId: 41, fecha: '2026-05-28T00:00:00.000Z', estado: 'AMARRADA',
      oc: { id: 41, consecutivo: 2041, clienteId: 3, fecha: '2026-05-28T00:00:00.000Z', estado: 'EN_PRODUCCION',
            cliente: { id: 3, nit: '900', nombre: 'Minera El Roble', tipoCredito: 'D30', estadoCartera: 'AL_DIA', activo: true } },
      lineas: [],
    });
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('OP-1187');
    expect(text).toContain('Minera El Roble');
    http.verify();
  });
});
