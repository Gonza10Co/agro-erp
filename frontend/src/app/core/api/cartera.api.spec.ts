import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CarteraApi } from './cartera.api';

describe('CarteraApi', () => {
  let api: CarteraApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [CarteraApi, provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(CarteraApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('listar hace GET /cartera', () => {
    api.listar().subscribe();
    const req = http.expectOne('http://localhost:3001/cartera');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('obtenerCliente hace GET /cartera/cliente/:id', () => {
    api.obtenerCliente(7).subscribe();
    const req = http.expectOne('http://localhost:3001/cartera/cliente/7');
    expect(req.request.method).toBe('GET');
    req.flush({ clienteId: 7 });
  });

  it('registrarPago hace POST /cartera/pagos con el body', () => {
    api.registrarPago({ facturaId: 3, monto: 100000, medio: 'transferencia' }).subscribe();
    const req = http.expectOne('http://localhost:3001/cartera/pagos');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ facturaId: 3, monto: 100000, medio: 'transferencia' });
    req.flush({ facturaId: 3, saldo: 0 });
  });
});
