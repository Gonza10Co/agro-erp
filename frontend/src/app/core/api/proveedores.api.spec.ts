import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ProveedoresApi } from './proveedores.api';

describe('ProveedoresApi', () => {
  let api: ProveedoresApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ProveedoresApi, provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(ProveedoresApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('listar hace GET /proveedores', () => {
    api.listar().subscribe();
    const req = http.expectOne('http://localhost:3001/proveedores');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('crear hace POST /proveedores con el dto', () => {
    api.crear({ nit: '800', nombre: 'CueroSur' }).subscribe();
    const req = http.expectOne('http://localhost:3001/proveedores');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ nit: '800', nombre: 'CueroSur' });
    req.flush({ id: 1 });
  });

  it('actualizar hace PATCH /proveedores/:id', () => {
    api.actualizar(1, { nombre: 'Nuevo' }).subscribe();
    const req = http.expectOne('http://localhost:3001/proveedores/1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ nombre: 'Nuevo' });
    req.flush({ id: 1 });
  });

  it('desactivar hace PATCH /proveedores/:id/desactivar', () => {
    api.desactivar(1).subscribe();
    const req = http.expectOne('http://localhost:3001/proveedores/1/desactivar');
    expect(req.request.method).toBe('PATCH');
    req.flush({ id: 1, activo: false });
  });
});
