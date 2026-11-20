import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { PtReassignmentPanelComponent } from './pt-reassignment-panel.component';

const URL = 'http://localhost:3001/pedidos/op/1';

const HISTORIAL = [
  {
    id: 3, fromOpId: 1, toOpId: 2, productoConfiguradoId: 7, tallaId: 3, calidad: 'PRIMERA', quantity: 5,
    reason: 'Vozincol paga de contado', userId: 3, createdAt: '2026-11-19T15:00:00Z',
    fromOp: { id: 1, consecutivo: 101 }, toOp: { id: 2, consecutivo: 102, oc: { consecutivo: 55, cliente: { nombre: 'Vozincol' } } },
    productoConfigurado: { nombreComercial: 'Alpaca' }, talla: { valor: 40 }, user: { username: 'gerente' },
  },
  {
    id: 2, fromOpId: 1, toOpId: null, productoConfiguradoId: 7, tallaId: 4, calidad: 'PRIMERA', quantity: 2,
    reason: 'Venta de mostrador', userId: 3, createdAt: '2026-11-18T15:00:00Z',
    productoConfigurado: { nombreComercial: 'Alpaca' }, talla: { valor: 41 }, user: { username: 'gerente' },
  },
  {
    id: 1, fromOpId: 8, toOpId: 1, productoConfiguradoId: 7, tallaId: 3, calidad: 'PRIMERA', quantity: 4,
    reason: 'Urgente', userId: 1, createdAt: '2026-11-17T15:00:00Z',
    fromOp: { id: 8, consecutivo: 98, oc: { consecutivo: 50, cliente: { nombre: 'Guantes Terry' } } },
    productoConfigurado: { nombreComercial: 'Alpaca' }, talla: { valor: 40 }, user: { username: 'admin' },
  },
];

const OPCIONES = [
  {
    productoConfiguradoId: 7, producto: 'Alpaca', tallaId: 3, talla: 40, calidad: 'PRIMERA', reservado: 20,
    targets: [{ opId: 2, opConsecutivo: 102, ocConsecutivo: 55, ocCliente: 'VZ-9', cliente: 'Vozincol', pendiente: 8 }],
  },
  { productoConfiguradoId: 7, producto: 'Alpaca', tallaId: 4, talla: 41, calidad: 'PRIMERA', reservado: 6, targets: [] },
];

function setup(rol: string) {
  localStorage.setItem('accessToken', `x.${btoa(JSON.stringify({ sub: 1, role: rol }))}.y`);
  TestBed.configureTestingModule({
    imports: [PtReassignmentPanelComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const fixture = TestBed.createComponent(PtReassignmentPanelComponent);
  fixture.componentRef.setInput('opId', 1);
  fixture.componentRef.setInput('opConsecutivo', 101);
  const http = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return { fixture, cmp: fixture.componentInstance, http };
}

function texto(fixture: any): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

describe('PtReassignmentPanelComponent', () => {
  afterEach(() => localStorage.clear());

  it('muestra el historial del pedido: lo que cedió, liberó y recibió', () => {
    const { fixture, http } = setup('CLIENTE');
    http.expectOne(`${URL}/reassignments`).flush(HISTORIAL);
    fixture.detectChanges();
    const t = texto(fixture);
    expect(t).toContain('Cedió');
    expect(t).toContain('OP-102');
    expect(t).toContain('Vozincol paga de contado');
    expect(t).toContain('Liberó');
    expect(t).toContain('Recibió');
    expect(t).toContain('OP-98');
    http.verify();
  });

  it('sin movimientos lo dice', () => {
    const { fixture, http } = setup('GERENTE');
    http.expectOne(`${URL}/reassignments`).flush([]);
    fixture.detectChanges();
    expect(texto(fixture)).toContain('no ha cedido ni recibido pares');
    http.verify();
  });

  it('las acciones solo las ve gerencia', () => {
    for (const [rol, ve] of [['GERENTE', true], ['ADMIN', true], ['CLIENTE', false], ['OPERARIO', false]] as const) {
      TestBed.resetTestingModule();
      const { fixture, http } = setup(rol);
      http.expectOne(`${URL}/reassignments`).flush([]);
      fixture.detectChanges();
      expect(texto(fixture).includes('Pasar pares a otro pedido')).withContext(rol).toBe(ve);
      expect(texto(fixture).includes('Liberar para otra venta')).withContext(rol).toBe(ve);
      localStorage.clear();
    }
  });

  it('una OP despachada o anulada no ofrece acciones', () => {
    const { fixture, http } = setup('GERENTE');
    fixture.componentRef.setInput('viva', false);
    http.expectOne(`${URL}/reassignments`).flush([]);
    fixture.detectChanges();
    expect(texto(fixture)).not.toContain('Pasar pares a otro pedido');
  });

  it('pasar: elige la talla con destino, topa la cantidad en lo que le falta al destino y exige motivo', () => {
    const { fixture, cmp, http } = setup('GERENTE');
    http.expectOne(`${URL}/reassignments`).flush([]);
    cmp.abrir('pass');
    http.expectOne(`${URL}/reassignment-options`).flush(OPCIONES);
    fixture.detectChanges();

    expect(cmp.itemKey()).toBe('7|3|PRIMERA');
    expect(cmp.destinoId()).toBe(2);
    expect(cmp.tope()).toBe(8); // reservado 20, al destino le faltan 8
    expect(texto(fixture)).toContain('le faltan 8');
    // Avisa la consecuencia para A, incluida la OF que se reabre.
    expect(texto(fixture)).toContain('OP-101 queda debiendo');
    expect(texto(fixture)).toContain('si su OF ya estaba terminada, se reabre');

    cmp.cantidad.set(9);
    cmp.motivo.set('Vozincol paga de contado');
    expect(cmp.valido()).toBeFalse();
    cmp.cantidad.set(5);
    cmp.motivo.set('   ');
    expect(cmp.valido()).toBeFalse();
    cmp.motivo.set('Vozincol paga de contado');
    expect(cmp.valido()).toBeTrue();

    let cambios = 0;
    cmp.changed.subscribe(() => cambios++);
    cmp.enviar();
    const req = http.expectOne(`${URL}/reassign`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      productoConfiguradoId: 7, tallaId: 3, calidad: 'PRIMERA', quantity: 5, reason: 'Vozincol paga de contado', toOpId: 2,
    });
    req.flush({ id: 9 });
    expect(cambios).toBe(1);
    expect(cmp.modo()).toBeNull();
    http.verify();
  });

  it('pasar: si la talla no tiene a quién pasarle, sugiere liberar y generar la OP del destino', () => {
    const { fixture, cmp, http } = setup('GERENTE');
    http.expectOne(`${URL}/reassignments`).flush([]);
    cmp.abrir('pass');
    http.expectOne(`${URL}/reassignment-options`).flush(OPCIONES);
    cmp.elegirItem('7|4|PRIMERA');
    cmp.motivo.set('x');
    fixture.detectChanges();
    expect(texto(fixture)).toContain('Liberar para otra venta');
    expect(cmp.valido()).toBeFalse();
  });

  it('liberar: tope en lo reservado y POST a /release sin destino', () => {
    const { cmp, http } = setup('ADMIN');
    http.expectOne(`${URL}/reassignments`).flush([]);
    cmp.abrir('release');
    http.expectOne(`${URL}/reassignment-options`).flush(OPCIONES);
    expect(cmp.tope()).toBe(20);
    cmp.cantidad.set(20);
    cmp.motivo.set('Venta de mostrador');
    cmp.enviar();
    const req = http.expectOne(`${URL}/release`);
    expect(req.request.body).toEqual({ productoConfiguradoId: 7, tallaId: 3, calidad: 'PRIMERA', quantity: 20, reason: 'Venta de mostrador' });
    req.flush({ id: 10 });
    http.verify();
  });

  it('si el backend rechaza, muestra su mensaje y no cierra', () => {
    const { fixture, cmp, http } = setup('GERENTE');
    http.expectOne(`${URL}/reassignments`).flush([]);
    cmp.abrir('pass');
    http.expectOne(`${URL}/reassignment-options`).flush(OPCIONES);
    cmp.cantidad.set(3);
    cmp.motivo.set('x');
    cmp.enviar();
    http.expectOne(`${URL}/reassign`).flush(
      { message: 'Al pedido destino solo le faltan 2 pares de esa talla; no se le pueden pasar 3' },
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();
    expect(cmp.modo()).toBe('pass');
    expect(texto(fixture)).toContain('solo le faltan 2 pares');
  });
});
