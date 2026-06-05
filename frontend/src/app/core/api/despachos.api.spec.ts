import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DespachosApi } from './despachos.api';

describe('DespachosApi', () => {
  let api: DespachosApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [DespachosApi, provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(DespachosApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('listar hace GET /despachos', () => {
    api.listar().subscribe();
    const req = http.expectOne('http://localhost:3001/despachos');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('despachar hace POST /despachos con el body', () => {
    api.despachar({ opId: 1, autorizar: true, motivo: 'x' }).subscribe();
    const req = http.expectOne('http://localhost:3001/despachos');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ opId: 1, autorizar: true, motivo: 'x' });
    req.flush({ id: 1 });
  });
});
