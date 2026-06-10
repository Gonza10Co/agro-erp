import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { IndicadoresApi } from './indicadores.api';

describe('IndicadoresApi', () => {
  let api: IndicadoresApi;
  let http: HttpTestingController;
  const base = 'http://localhost:3001';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(IndicadoresApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('indicadores hace GET /indicadores', () => {
    api.indicadores().subscribe();
    http.expectOne(`${base}/indicadores`).flush({ etapas: [], operarios: [], maquinas: [], alertas: [] });
  });
});
