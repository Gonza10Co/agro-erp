import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { CorteApi } from './corte.api';

describe('CorteApi', () => {
  let api: CorteApi;
  let http: HttpTestingController;
  const base = 'http://localhost:3001';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CorteApi, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(CorteApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('tablero sin filtros no manda parámetros vacíos', () => {
    api.tablero().subscribe();
    const req = http.expectOne(`${base}/corte/tablero`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys()).toEqual([]);
    req.flush({ ordenes: [], resumen: {} });
  });

  it('tablero pasa línea y rango de fechas', () => {
    api.tablero({ lineaId: 4, desde: '2026-08-01', hasta: '2026-08-31' }).subscribe();
    const req = http.expectOne((r) => r.url === `${base}/corte/tablero`);
    expect(req.request.params.get('lineaId')).toBe('4');
    expect(req.request.params.get('desde')).toBe('2026-08-01');
    expect(req.request.params.get('hasta')).toBe('2026-08-31');
    req.flush({ ordenes: [], resumen: {} });
  });

  it('listar filtra por estado', () => {
    api.listar({ estado: 'EN_CORTE' }).subscribe();
    const req = http.expectOne((r) => r.url === `${base}/corte/ordenes`);
    expect(req.request.params.get('estado')).toBe('EN_CORTE');
    req.flush([]);
  });

  it('obtener pega al detalle de la orden', () => {
    api.obtener(7).subscribe();
    const req = http.expectOne(`${base}/corte/ordenes/7`);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('avanzar manda PATCH con estado y cantidades cortadas', () => {
    api.avanzar(7, 'ENTREGADA', { 10: 580 }).subscribe();
    const req = http.expectOne(`${base}/corte/ordenes/7/estado`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ estado: 'ENTREGADA', cantidades: { 10: 580 } });
    req.flush({});
  });

  it('registrarAvance manda las piezas repuestas', () => {
    api.registrarAvance(7, { piezasCortadas: 14000, piezasRepuestas: 120 }).subscribe();
    const req = http.expectOne(`${base}/corte/ordenes/7/avances`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.piezasRepuestas).toBe(120);
    req.flush({});
  });
});
