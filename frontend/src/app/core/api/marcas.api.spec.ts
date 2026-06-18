import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MarcasApi } from './marcas.api';

describe('MarcasApi', () => {
  let api: MarcasApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [MarcasApi, provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(MarcasApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('listar hace GET /catalog/marcas', () => {
    api.listar().subscribe();
    const req = http.expectOne('http://localhost:3001/catalog/marcas');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('crear hace POST /catalog/marcas con el dto', () => {
    api.crear({ codigo: 'BAS', nombre: 'Basarili', tipo: 'PROPIA' }).subscribe();
    const req = http.expectOne('http://localhost:3001/catalog/marcas');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ codigo: 'BAS', nombre: 'Basarili', tipo: 'PROPIA' });
    req.flush({ id: 1 });
  });

  it('actualizar hace PATCH /catalog/marcas/:id con el dto', () => {
    api.actualizar(5, { nombre: 'Nuevo', tipo: 'MAQUILA' }).subscribe();
    const req = http.expectOne('http://localhost:3001/catalog/marcas/5');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ nombre: 'Nuevo', tipo: 'MAQUILA' });
    req.flush({ id: 5 });
  });

  it('desactivar hace PATCH /catalog/marcas/:id/desactivar', () => {
    api.desactivar(7).subscribe();
    const req = http.expectOne('http://localhost:3001/catalog/marcas/7/desactivar');
    expect(req.request.method).toBe('PATCH');
    req.flush({ id: 7, activo: false });
  });
});
