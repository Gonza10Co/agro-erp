import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ReferenciasAbmApi } from './referencias-abm.api';

describe('ReferenciasAbmApi', () => {
  let api: ReferenciasAbmApi;
  let http: HttpTestingController;
  const base = 'http://localhost:3001/catalog/referencias-abm';

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ReferenciasAbmApi, provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(ReferenciasAbmApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('listar hace GET /catalog/referencias-abm', () => {
    api.listar().subscribe();
    const req = http.expectOne(base);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('obtener hace GET /catalog/referencias-abm/:id', () => {
    api.obtener(7).subscribe();
    const req = http.expectOne(`${base}/7`);
    expect(req.request.method).toBe('GET');
    req.flush({ id: 7, codigo: 'R1', nombreInterno: 'Bota', activo: true });
  });

  it('crear hace POST /catalog/referencias-abm con el dto', () => {
    api.crear({ codigo: 'R1', nombreInterno: 'Bota', tallaMinId: 1, tallaMaxId: 5 }).subscribe();
    const req = http.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ codigo: 'R1', nombreInterno: 'Bota', tallaMinId: 1, tallaMaxId: 5 });
    req.flush({ id: 1 });
  });

  it('actualizar hace PATCH /catalog/referencias-abm/:id', () => {
    api.actualizar(3, { nombreInterno: 'Nuevo' }).subscribe();
    const req = http.expectOne(`${base}/3`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ nombreInterno: 'Nuevo' });
    req.flush({ id: 3 });
  });

  it('desactivar hace PATCH /catalog/referencias-abm/:id/desactivar', () => {
    api.desactivar(4).subscribe();
    const req = http.expectOne(`${base}/4/desactivar`);
    expect(req.request.method).toBe('PATCH');
    req.flush({ id: 4, activo: false });
  });
});
