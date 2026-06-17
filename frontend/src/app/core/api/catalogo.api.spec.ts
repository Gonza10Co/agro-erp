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

  it('listarMateriales hace GET /catalog/materiales', () => {
    api.listarMateriales().subscribe();
    const req = http.expectOne('http://localhost:3001/catalog/materiales');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('versionesBom hace GET /catalog/bom/:id/versiones', () => {
    api.versionesBom(7).subscribe();
    const req = http.expectOne('http://localhost:3001/catalog/bom/7/versiones');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('crearVersionBom hace POST /catalog/bom/version con el payload', () => {
    const payload = { referenciaId: 7, lineas: [{ materialId: 3, claseConsumo: 'FIJO' as const, consumoFijo: 1 }] };
    api.crearVersionBom(payload).subscribe();
    const req = http.expectOne('http://localhost:3001/catalog/bom/version');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
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
