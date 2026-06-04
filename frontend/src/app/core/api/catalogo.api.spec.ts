import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CatalogoApi } from './catalogo.api';

describe('CatalogoApi', () => {
  let api: CatalogoApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [CatalogoApi, provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(CatalogoApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('listarProductos hace GET /catalog/productos', () => {
    api.listarProductos().subscribe();
    const req = http.expectOne('http://localhost:3001/catalog/productos');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('listarTallas hace GET /catalog/tallas', () => {
    api.listarTallas().subscribe();
    const req = http.expectOne('http://localhost:3001/catalog/tallas');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });
});
