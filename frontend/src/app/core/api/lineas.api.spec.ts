import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LineasApi } from './lineas.api';

describe('LineasApi', () => {
  let api: LineasApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [LineasApi, provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(LineasApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('listar hace GET /catalog/lineas', () => {
    api.listar().subscribe();
    const req = http.expectOne('http://localhost:3001/catalog/lineas');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('crear hace POST /catalog/lineas con el dto', () => {
    api.crear({ codigo: 'FEROZ', nombre: 'Feroz', celulaInicial: 'INYECCION' }).subscribe();
    const req = http.expectOne('http://localhost:3001/catalog/lineas');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ codigo: 'FEROZ', nombre: 'Feroz', celulaInicial: 'INYECCION' });
    req.flush({ id: 1 });
  });

  it('actualizar hace PATCH /catalog/lineas/:id con el dto', () => {
    api.actualizar(4, { nombre: 'Feroz', celulaInicial: 'INYECCION' }).subscribe();
    const req = http.expectOne('http://localhost:3001/catalog/lineas/4');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ nombre: 'Feroz', celulaInicial: 'INYECCION' });
    req.flush({ id: 4 });
  });

  it('desactivar hace PATCH /catalog/lineas/:id/desactivar', () => {
    api.desactivar(7).subscribe();
    const req = http.expectOne('http://localhost:3001/catalog/lineas/7/desactivar');
    expect(req.request.method).toBe('PATCH');
    req.flush({ id: 7, activo: false });
  });
});
