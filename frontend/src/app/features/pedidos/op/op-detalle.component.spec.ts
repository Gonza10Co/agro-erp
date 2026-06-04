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

  it('alterna entre vista por talla y por bodega', () => {
    const { fixture, http } = setup('12');
    fixture.detectChanges();
    http.expectOne('http://localhost:3001/pedidos/op/12').flush({
      id: 12, consecutivo: 1187, ocId: 41, fecha: '2026-05-28T00:00:00.000Z', estado: 'AMARRADA',
      oc: { id: 41, consecutivo: 2041, clienteId: 3, fecha: '2026-05-28T00:00:00.000Z', estado: 'EN_PRODUCCION',
            cliente: { id: 3, nit: '900', nombre: 'Minera El Roble', tipoCredito: 'D30', estadoCartera: 'AL_DIA', activo: true } },
      lineas: [{ id: 100, productoConfiguradoId: 7,
        productoConfigurado: { id: 7, codigo: 'BD', nombreComercial: 'Bota', referenciaId: 1, marcaId: 1 },
        tallas: [{ id: 500, tallaId: 36, cantPedida: 60, cantAmarrada: 60, cantAProducir: 0,
          talla: { id: 36, valor: 36, orden: 4 },
          reservas: [{ id: 9, inventarioPTId: 1, cantidad: 60, inventarioPT: { id: 1, bodegaId: 1, bodega: { id: 1, codigo: 'IBG', nombre: 'Ibagué' } } }] }] }],
    });
    fixture.detectChanges();
    const c = fixture.componentInstance;
    expect(c.vista()).toBe('talla');
    c.vista.set('bodega');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Total stock');
    http.verify();
  });

  it('anular() hace POST /pedidos/op/:id/anular y recarga', () => {
    const { fixture, http } = setup('12');
    fixture.detectChanges();
    const base = {
      id: 12, consecutivo: 1187, ocId: 41, fecha: '2026-05-28T00:00:00.000Z',
      oc: { id: 41, consecutivo: 2041, clienteId: 3, fecha: '2026-05-28T00:00:00.000Z', estado: 'EN_PRODUCCION',
            cliente: { id: 3, nit: '900', nombre: 'Minera El Roble', tipoCredito: 'D30', estadoCartera: 'AL_DIA', activo: true } },
      lineas: [],
    };
    http.expectOne('http://localhost:3001/pedidos/op/12').flush({ ...base, estado: 'AMARRADA' });
    fixture.detectChanges();
    fixture.componentInstance.anular();
    const req = http.expectOne('http://localhost:3001/pedidos/op/12/anular');
    expect(req.request.method).toBe('POST');
    req.flush({ ...base, estado: 'ANULADA' });
    // tras anular, recarga (segundo GET)
    http.expectOne('http://localhost:3001/pedidos/op/12').flush({ ...base, estado: 'ANULADA' });
    http.verify();
  });
});
