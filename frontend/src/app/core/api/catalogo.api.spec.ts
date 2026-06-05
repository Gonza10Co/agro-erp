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

  it('listarReferencias hace GET /catalog/referencias', () => {
    api.listarReferencias().subscribe();
    const req = http.expectOne('http://localhost:3001/catalog/referencias');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('configReferencia hace GET /catalog/referencias/:id/config', () => {
    api.configReferencia(7).subscribe();
    const req = http.expectOne('http://localhost:3001/catalog/referencias/7/config');
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('resolver arma los query params (referenciaId, talla, marcaId, opcionIds[])', () => {
    api.resolver({ referenciaId: 1, talla: 42, marcaId: 5, opcionIds: [8, 9] }).subscribe();
    const req = http.expectOne((r) => r.url === 'http://localhost:3001/catalog/bom/resolve');
    expect(req.request.params.get('referenciaId')).toBe('1');
    expect(req.request.params.get('talla')).toBe('42');
    expect(req.request.params.get('marcaId')).toBe('5');
    expect(req.request.params.getAll('opcionIds')).toEqual(['8', '9']);
    req.flush({ arbol: [], comprados: [] });
  });
});
