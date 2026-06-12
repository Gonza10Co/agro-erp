import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { InventarioApi } from './inventario.api';

describe('InventarioApi', () => {
  let api: InventarioApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [InventarioApi, provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(InventarioApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('consolidado hace GET /inventario/consolidado', () => {
    api.consolidado().subscribe();
    const req = http.expectOne('http://localhost:3001/inventario/consolidado');
    expect(req.request.method).toBe('GET');
    req.flush({ materiales: [], wip: [], pt: [] });
  });

  it('movimientos hace GET /inventario/movimientos con limit', () => {
    api.movimientos(80).subscribe();
    const req = http.expectOne('http://localhost:3001/inventario/movimientos?limit=80');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('movimientos sin argumento no manda limit', () => {
    api.movimientos().subscribe();
    const req = http.expectOne('http://localhost:3001/inventario/movimientos');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('movimientoMaterial hace POST /inventario/material/movimiento con el body', () => {
    const dto = { materialId: 3, tipo: 'ENTRADA' as const, motivo: 'COMPRA' as const, cantidad: 100, referencia: 'OC-PROV-44' };
    api.movimientoMaterial(dto).subscribe();
    const req = http.expectOne('http://localhost:3001/inventario/material/movimiento');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(dto);
    req.flush({ id: 1 });
  });
});
