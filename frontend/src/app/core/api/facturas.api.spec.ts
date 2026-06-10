import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FacturasApi } from './facturas.api';

describe('FacturasApi', () => {
  let api: FacturasApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [FacturasApi, provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(FacturasApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('listar hace GET /facturas', () => {
    api.listar().subscribe();
    const req = http.expectOne('http://localhost:3001/facturas');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('obtener hace GET /facturas/:id', () => {
    api.obtener(5).subscribe();
    const req = http.expectOne('http://localhost:3001/facturas/5');
    expect(req.request.method).toBe('GET');
    req.flush({ id: 5 });
  });

  it('facturar hace POST /facturas con el body', () => {
    api.facturar({ despachoId: 3 }).subscribe();
    const req = http.expectOne('http://localhost:3001/facturas');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ despachoId: 3 });
    req.flush({ id: 1 });
  });
});
