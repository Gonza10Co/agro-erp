import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { GruposOpcionApi } from './grupos-opcion.api';

describe('GruposOpcionApi', () => {
  let api: GruposOpcionApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [GruposOpcionApi, provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(GruposOpcionApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('listar hace GET /catalog/grupos-opcion', () => {
    api.listar().subscribe();
    const req = http.expectOne('http://localhost:3001/catalog/grupos-opcion');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('crearGrupo hace POST /catalog/grupos-opcion con el dto', () => {
    api.crearGrupo({ codigo: 'COLOR', nombre: 'Color', obligatorio: true, orden: 1 }).subscribe();
    const req = http.expectOne('http://localhost:3001/catalog/grupos-opcion');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ codigo: 'COLOR', nombre: 'Color', obligatorio: true, orden: 1 });
    req.flush({ id: 1 });
  });

  it('actualizarGrupo hace PATCH /catalog/grupos-opcion/:id', () => {
    api.actualizarGrupo(5, { nombre: 'Colores' }).subscribe();
    const req = http.expectOne('http://localhost:3001/catalog/grupos-opcion/5');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ nombre: 'Colores' });
    req.flush({ id: 5 });
  });

  it('agregarOpcion hace POST /catalog/grupos-opcion/:id/opciones', () => {
    api.agregarOpcion(5, { codigo: 'NEG', nombre: 'Negro' }).subscribe();
    const req = http.expectOne('http://localhost:3001/catalog/grupos-opcion/5/opciones');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ codigo: 'NEG', nombre: 'Negro' });
    req.flush({ id: 10 });
  });

  it('desactivarOpcion hace PATCH /catalog/grupos-opcion/opciones/:opcionId/desactivar', () => {
    api.desactivarOpcion(10).subscribe();
    const req = http.expectOne('http://localhost:3001/catalog/grupos-opcion/opciones/10/desactivar');
    expect(req.request.method).toBe('PATCH');
    req.flush({ id: 10, activo: false });
  });
});
