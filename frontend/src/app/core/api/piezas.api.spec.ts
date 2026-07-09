import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PiezasApi } from './piezas.api';

describe('PiezasApi', () => {
  let api: PiezasApi;
  let http: HttpTestingController;
  const base = 'http://localhost:3001/catalog/piezas';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PiezasApi, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(PiezasApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('listar hace GET /catalog/piezas', () => {
    api.listar().subscribe();
    const req = http.expectOne(base);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('crear hace POST con el código de la pieza', () => {
    api.crear({ codigo: 'CAPELLADA', nombre: 'Capellada', orden: 10 }).subscribe();
    const req = http.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.codigo).toBe('CAPELLADA');
    req.flush({ id: 1 });
  });

  it('actualizar hace PATCH /:id', () => {
    api.actualizar(7, { nombre: 'Talón' }).subscribe();
    const req = http.expectOne(`${base}/7`);
    expect(req.request.method).toBe('PATCH');
    req.flush({ id: 7 });
  });

  it('desactivar hace PATCH /:id/desactivar', () => {
    api.desactivar(7).subscribe();
    const req = http.expectOne(`${base}/7/desactivar`);
    expect(req.request.method).toBe('PATCH');
    req.flush({ id: 7, activo: false });
  });
});
