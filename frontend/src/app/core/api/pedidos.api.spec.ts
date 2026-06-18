import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PedidosApi } from './pedidos.api';

describe('PedidosApi', () => {
  let api: PedidosApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [PedidosApi, provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(PedidosApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('listarOC hace GET /pedidos/oc', () => {
    api.listarOC().subscribe();
    const req = http.expectOne('http://localhost:3001/pedidos/oc');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('confirmarOC hace POST /pedidos/oc/:id/confirmar', () => {
    api.confirmarOC(5).subscribe();
    const req = http.expectOne('http://localhost:3001/pedidos/oc/5/confirmar');
    expect(req.request.method).toBe('POST');
    req.flush({ id: 5, estado: 'CONFIRMADA' });
  });

  it('actualizarOC hace PATCH /pedidos/oc/:id con el dto', () => {
    const dto = { clienteId: 7, lineas: [{ productoConfiguradoId: 2, tallas: [{ tallaId: 5, cantidad: 3 }] }] };
    api.actualizarOC(5, dto).subscribe();
    const req = http.expectOne('http://localhost:3001/pedidos/oc/5');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(dto);
    req.flush({ id: 5 });
  });

  it('generarOP hace POST /pedidos/op/desde-oc/:ocId', () => {
    api.generarOP(5).subscribe();
    const req = http.expectOne('http://localhost:3001/pedidos/op/desde-oc/5');
    expect(req.request.method).toBe('POST');
    req.flush({ id: 50 });
  });

  it('obtenerOP hace GET /pedidos/op/:id', () => {
    api.obtenerOP(50).subscribe();
    const req = http.expectOne('http://localhost:3001/pedidos/op/50');
    expect(req.request.method).toBe('GET');
    req.flush({ id: 50 });
  });
});
