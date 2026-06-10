import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CalidadApi } from './calidad.api';

describe('CalidadApi', () => {
  let api: CalidadApi;
  let http: HttpTestingController;
  const base = 'http://localhost:3001';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(CalidadApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('tiposDano hace GET /calidad/tipos-dano', () => {
    api.tiposDano().subscribe();
    http.expectOne(`${base}/calidad/tipos-dano`).flush([]);
  });

  it('reportar hace POST /calidad/pares/:codigo/incidencias con el body', () => {
    api.reportar('OF1-0001', { tipoDanoId: 8, operarioId: 9, descripcion: 'acta' }).subscribe();
    const req = http.expectOne(`${base}/calidad/pares/OF1-0001/incidencias`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ tipoDanoId: 8, operarioId: 9, descripcion: 'acta' });
    req.flush({ incidencia: { id: 1 }, parReposicion: null });
  });

  it('indicadores hace GET /calidad/indicadores', () => {
    api.indicadores().subscribe();
    http.expectOne(`${base}/calidad/indicadores`).flush({ centros: [], topDanos: [] });
  });
});
