import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ReportesApi } from './reportes.api';

describe('ReportesApi', () => {
  let api: ReportesApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ReportesApi, provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(ReportesApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('diario hace GET /reportes/diario con anio y mes', () => {
    api.diario(2026, 6).subscribe();
    const req = http.expectOne((r) => r.url === 'http://localhost:3001/reportes/diario');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('anio')).toBe('2026');
    expect(req.request.params.get('mes')).toBe('6');
    req.flush({});
  });

  it('guardarMetas hace PUT /reportes/metas con los items', () => {
    const items = [{ tipo: 'GUARNICION' as const, valor: 20160 }];
    api.guardarMetas(2026, 6, items).subscribe();
    const req = http.expectOne((r) => r.url === 'http://localhost:3001/reportes/metas');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ items });
    req.flush(items);
  });
});
