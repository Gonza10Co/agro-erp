import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComprasApi } from './compras.api';
import { environment } from '../../../environments/environment';

describe('ComprasApi', () => {
  let api: ComprasApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ComprasApi, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ComprasApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('POST calcula el requerimiento de una OP', () => {
    api.calcular(7).subscribe();
    const req = http.expectOne(`${environment.apiUrl}/ops/7/requerimiento`);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 1, consecutivo: 1, opId: 7, fecha: '', grupos: [] });
  });

  it('GET obtiene un requerimiento por id', () => {
    api.obtener(1).subscribe();
    const req = http.expectOne(`${environment.apiUrl}/requerimientos/1`);
    expect(req.request.method).toBe('GET');
    req.flush({ id: 1, consecutivo: 1, opId: 7, fecha: '', grupos: [] });
  });

  it('POST genera órdenes de compra desde un requerimiento', () => {
    api.generarOrdenes(1).subscribe();
    const req = http.expectOne(`${environment.apiUrl}/requerimientos/1/ordenes`);
    expect(req.request.method).toBe('POST');
    req.flush({ ordenes: [], sinProveedor: [] });
  });

  it('GET lista las órdenes de compra a proveedor', () => {
    api.listarOrdenes().subscribe();
    const req = http.expectOne(`${environment.apiUrl}/compras/ordenes`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('GET obtiene el detalle de una OCP', () => {
    api.obtenerOrden(10).subscribe();
    const req = http.expectOne(`${environment.apiUrl}/compras/ordenes/10`);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('POST registra una recepción sobre la OCP', () => {
    const dto = { lineas: [{ ocpLineaId: 1, cantidad: 10 }] };
    api.registrarRecepcion(10, dto).subscribe();
    const req = http.expectOne(`${environment.apiUrl}/compras/ordenes/10/recepciones`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(dto);
    req.flush({ id: 1, consecutivo: 1, estado: 'PARCIAL' });
  });

  it('POST registra una devolución a proveedor', () => {
    const dto = { causa: 'Defecto', lineas: [{ materialId: 7, cantidad: 3 }] };
    api.registrarDevolucion(10, dto).subscribe();
    const req = http.expectOne(`${environment.apiUrl}/compras/ordenes/10/devoluciones`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(dto);
    req.flush({ id: 1, consecutivo: 1 });
  });
});
