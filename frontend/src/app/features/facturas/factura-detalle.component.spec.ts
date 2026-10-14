import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FacturaDetalleComponent } from './factura-detalle.component';

const API = 'http://localhost:3001';

describe('FacturaDetalleComponent', () => {
  let http: HttpTestingController;

  function setup(factura: object) {
    TestBed.configureTestingModule({
      imports: [FacturaDetalleComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(FacturaDetalleComponent);
    fixture.componentRef.setInput('facturaId', 1);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges(); // ngOnInit
    http.expectOne(`${API}/facturas/1`).flush(factura);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }
  afterEach(() => http.verify());

  it('muestra el cliente y el NIT que vienen en la factura misma (el back no anida el cliente en el despacho)', () => {
    const el = setup({
      id: 1, consecutivo: 1, fecha: '2026-10-13T00:00:00.000Z', estado: 'EMITIDA',
      subtotal: '1000', ivaPct: '19', iva: '190', total: '1190',
      cliente: { id: 5, nombre: 'CALZATODO SA', nit: '890.300.123-4' },
      despacho: { consecutivo: 1, op: { consecutivo: 3, oc: { consecutivo: 21 } } },
      lineas: [],
    });
    const texto = el.textContent ?? '';
    expect(texto).toContain('CALZATODO SA');
    expect(texto).toContain('890.300.123-4');
  });

  it('si la factura no trae cliente, cae al cliente de la OC del despacho', () => {
    const el = setup({
      id: 1, consecutivo: 1, fecha: '2026-10-13T00:00:00.000Z', estado: 'EMITIDA',
      subtotal: '1000', ivaPct: '19', iva: '190', total: '1190',
      despacho: { consecutivo: 1, op: { consecutivo: 3, oc: { consecutivo: 21, cliente: { id: 5, nombre: 'Minera El Roble', nit: '900.111.222-3' } } } },
      lineas: [],
    });
    const texto = el.textContent ?? '';
    expect(texto).toContain('Minera El Roble');
    expect(texto).toContain('900.111.222-3');
  });
});
