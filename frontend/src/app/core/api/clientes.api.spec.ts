import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ClientesApi } from './clientes.api';

describe('ClientesApi', () => {
  let api: ClientesApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ClientesApi, provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(ClientesApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('listar hace GET /clientes', () => {
    api.listar().subscribe();
    const req = http.expectOne('http://localhost:3001/clientes');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('crear hace POST /clientes con el dto', () => {
    api.crear({ nit: '900', nombre: 'ACME' }).subscribe();
    const req = http.expectOne('http://localhost:3001/clientes');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ nit: '900', nombre: 'ACME' });
    req.flush({ id: 1 });
  });

  it('actualizar hace PATCH /clientes/:id', () => {
    api.actualizar(7, { nombre: 'NUEVO' }).subscribe();
    const req = http.expectOne('http://localhost:3001/clientes/7');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ nombre: 'NUEVO' });
    req.flush({ id: 7 });
  });

  it('desactivar hace PATCH /clientes/:id/desactivar', () => {
    api.desactivar(7).subscribe();
    const req = http.expectOne('http://localhost:3001/clientes/7/desactivar');
    expect(req.request.method).toBe('PATCH');
    req.flush({ id: 7 });
  });
});
