import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { OpListComponent } from './op-list.component';

describe('OpListComponent', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [OpListComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(OpListComponent);
    const http = TestBed.inject(HttpTestingController);
    return { fixture, http };
  }

  it('carga las OPs y renderiza una fila con consecutivo y cliente', () => {
    const { fixture, http } = setup();
    fixture.detectChanges();
    const req = http.expectOne('http://localhost:3001/pedidos/op');
    expect(req.request.method).toBe('GET');
    req.flush([{
      id: 1, consecutivo: 1, ocId: 1, fecha: '2026-06-04T00:00:00.000Z', estado: 'AMARRADA',
      oc: { id: 1, consecutivo: 1, clienteId: 3, fecha: '2026-06-04T00:00:00.000Z', estado: 'EN_PRODUCCION',
            cliente: { id: 3, nit: '900', nombre: 'Minera El Roble', tipoCredito: 'D30', estadoCartera: 'AL_DIA', activo: true } },
    }]);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Minera El Roble');
    expect(text).toContain('Amarrada');
    expect(text).toContain('#1');
    http.verify();
  });

  it('muestra el empty state cuando no hay OPs', () => {
    const { fixture, http } = setup();
    fixture.detectChanges();
    http.expectOne('http://localhost:3001/pedidos/op').flush([]);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Sin órdenes de producción');
    http.verify();
  });
});
