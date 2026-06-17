import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MaterialesApi, CrearMaterialDto } from './materiales.api';

describe('MaterialesApi', () => {
  let api: MaterialesApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [MaterialesApi, provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(MaterialesApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('listar hace GET /catalog/materiales', () => {
    api.listar().subscribe();
    const req = http.expectOne('http://localhost:3001/catalog/materiales');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('crear hace POST /catalog/materiales con el dto', () => {
    const dto: CrearMaterialDto = {
      codigo: 'M-1', nombreCanonico: 'Cuero', categoriaId: 3, unidadMedidaId: 5,
      origen: 'COMPRADO', claseBom: 'DIRECTO_CURVA',
    };
    api.crear(dto).subscribe();
    const req = http.expectOne('http://localhost:3001/catalog/materiales');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(dto);
    req.flush({ id: 1 });
  });

  it('actualizar hace PATCH /catalog/materiales/:id', () => {
    api.actualizar(7, { nombreCanonico: 'Cuero negro' }).subscribe();
    const req = http.expectOne('http://localhost:3001/catalog/materiales/7');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ nombreCanonico: 'Cuero negro' });
    req.flush({ id: 7 });
  });

  it('desactivar hace PATCH /catalog/materiales/:id/desactivar', () => {
    api.desactivar(7).subscribe();
    const req = http.expectOne('http://localhost:3001/catalog/materiales/7/desactivar');
    expect(req.request.method).toBe('PATCH');
    req.flush({ id: 7 });
  });

  it('agregarAlias hace POST /catalog/materiales/:id/alias', () => {
    api.agregarAlias(7, { textoLegacy: 'CUERO VIEJO' }).subscribe();
    const req = http.expectOne('http://localhost:3001/catalog/materiales/7/alias');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ textoLegacy: 'CUERO VIEJO' });
    req.flush({});
  });

  it('quitarAlias hace DELETE /catalog/materiales/alias/:aliasId', () => {
    api.quitarAlias(99).subscribe();
    const req = http.expectOne('http://localhost:3001/catalog/materiales/alias/99');
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });
});
