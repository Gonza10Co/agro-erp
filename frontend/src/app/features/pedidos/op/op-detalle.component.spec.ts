import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { OpDetalleComponent } from './op-detalle.component';

describe('OpDetalleComponent — despacho', () => {
  let http: HttpTestingController;
  function crear() {
    TestBed.configureTestingModule({
      imports: [OpDetalleComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(OpDetalleComponent);
    http = TestBed.inject(HttpTestingController);
    return fixture;
  }
  afterEach(() => { localStorage.clear(); });

  it('despachar POSTea a /despachos con el opId', () => {
    const fixture = crear();
    const cmp = fixture.componentInstance;
    cmp.op.set({ id: 7, consecutivo: 12, estado: 'AMARRADA', ocId: 9 } as any);
    cmp.despachar();
    const req = http.expectOne('http://localhost:3001/despachos');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ opId: 7 });
    req.flush({ id: 1, consecutivo: 1 });
    // El panel de pares cedidos/recibidos pide su historial apenas se pinta la OP.
    http.match((r) => r.url.endsWith('/reassignments')).forEach((r) => r.flush([]));
    http.verify();
  });

  it('requerir() POSTea el requerimiento y navega a la vista', () => {
    const fixture = crear();
    const cmp = fixture.componentInstance;
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigateByUrl');
    cmp.op.set({
      id: 7, consecutivo: 12, estado: 'AMARRADA', ocId: 9,
      lineas: [{ tallas: [{ tallaId: 36, cantPedida: 60, cantAmarrada: 10, cantAProducir: 50 }] }],
    } as any);
    cmp.requerir();
    const req = http.expectOne('http://localhost:3001/ops/7/requerimiento');
    expect(req.request.method).toBe('POST');
    req.flush({ id: 99, consecutivo: 1, opId: 7, fecha: '', grupos: [] });
    expect(navSpy).toHaveBeenCalledWith('/compras/requerimiento/99');
    // El panel de pares cedidos/recibidos pide su historial apenas se pinta la OP.
    http.match((r) => r.url.endsWith('/reassignments')).forEach((r) => r.flush([]));
    http.verify();
  });

  it('un 409 de cartera activa el banner de bloqueo', () => {
    const fixture = crear();
    const cmp = fixture.componentInstance;
    cmp.op.set({ id: 7, consecutivo: 12, estado: 'AMARRADA', ocId: 9 } as any);
    cmp.despachar();
    const req = http.expectOne('http://localhost:3001/despachos');
    req.flush({ message: 'Cliente con cartera VENCIDO — requiere autorización del gerente' }, { status: 409, statusText: 'Conflict' });
    expect(cmp.carteraBloqueada()).toBe(true);
    // El panel de pares cedidos/recibidos pide su historial apenas se pinta la OP.
    http.match((r) => r.url.endsWith('/reassignments')).forEach((r) => r.flush([]));
    http.verify();
  });
});

describe('OpDetalleComponent — despacho parcial', () => {
  let http: HttpTestingController;
  // Pedido de 20 (talla 40): 12 en bodega para la OP, nada despachado.
  const opBodega = () => ({
    id: 7, consecutivo: 12, estado: 'EN_PRODUCCION', ocId: 9,
    lineas: [{
      id: 1, productoConfiguradoId: 3, calidad: 'PRIMERA', productoConfigurado: { nombreComercial: 'Alpaca' },
      tallas: [{ id: 30, tallaId: 40, cantPedida: 20, cantAmarrada: 0, cantAProducir: 20, dispatched: 0,
        talla: { id: 40, valor: 40 }, reservas: [{ id: 100, inventarioPTId: 50, cantidad: 12 }] }],
    }],
  } as any);
  function crear() {
    TestBed.configureTestingModule({
      imports: [OpDetalleComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(OpDetalleComponent);
    http = TestBed.inject(HttpTestingController);
    return fixture;
  }
  afterEach(() => {
    http.match((r) => r.url.endsWith('/reassignments')).forEach((r) => r.flush([]));
    localStorage.clear();
  });

  it('se puede despachar aunque falte producción: basta con tener pares en bodega', () => {
    const cmp = crear().componentInstance;
    cmp.op.set(opBodega());
    expect(cmp.despachable()).toBe(true);
    const sinBodega = opBodega();
    sinBodega.lineas[0].tallas[0].reservas = [];
    cmp.op.set(sinBodega);
    expect(cmp.despachable()).toBe(false);
  });

  it('abre el formulario precargado con todo lo reservado y avisa que la OP queda abierta', () => {
    const cmp = crear().componentInstance;
    cmp.op.set(opBodega());
    cmp.abrirDespacho();
    expect(cmp.despachoAbierto()).toBe(true);
    expect(cmp.cantidades()).toEqual({ 30: 12 });
    expect(cmp.totalDespacho()).toBe(12);
    expect(cmp.cierraOP()).toBe(false);
  });

  it('valida que cada talla vaya de 0 a lo reservado', () => {
    const cmp = crear().componentInstance;
    cmp.op.set(opBodega());
    cmp.abrirDespacho();
    const fila = cmp.filasDesp()[0];
    cmp.setCantidad(fila, 13);
    expect(cmp.despachoInvalido()).toBe(true);
    cmp.setCantidad(fila, '');
    expect(cmp.despachoInvalido()).toBe(true);
    cmp.setCantidad(fila, 5);
    expect(cmp.despachoInvalido()).toBe(false);
  });

  it('POSTea solo las tallas con cantidad y navega a despachos', () => {
    const fixture = crear();
    const cmp = fixture.componentInstance;
    const navSpy = spyOn(TestBed.inject(Router), 'navigateByUrl');
    cmp.op.set(opBodega());
    cmp.abrirDespacho();
    cmp.setCantidad(cmp.filasDesp()[0], 5);
    cmp.despachar();
    const req = http.expectOne('http://localhost:3001/despachos');
    expect(req.request.body).toEqual({ opId: 7, lines: [{ opLineaTallaId: 30, quantity: 5 }] });
    req.flush({ id: 1, consecutivo: 3, opClosed: false });
    expect(navSpy).toHaveBeenCalledWith('/despachos');
  });

  it('la autorización de cartera viaja con las mismas cantidades', () => {
    const cmp = crear().componentInstance;
    cmp.op.set(opBodega());
    cmp.abrirDespacho();
    cmp.setCantidad(cmp.filasDesp()[0], 4);
    cmp.motivo.set('paga el viernes');
    cmp.despachar(true);
    const req = http.expectOne('http://localhost:3001/despachos');
    expect(req.request.body).toEqual({ opId: 7, autorizar: true, motivo: 'paga el viernes', lines: [{ opLineaTallaId: 30, quantity: 4 }] });
    req.flush({ id: 1, consecutivo: 3 });
  });

  it('un 409 que no es de cartera no ofrece autorizar', () => {
    const cmp = crear().componentInstance;
    cmp.op.set(opBodega());
    cmp.abrirDespacho();
    cmp.despachar();
    http.expectOne('http://localhost:3001/despachos').flush(
      { message: 'El pedido cambió mientras se despachaba, vuelve a intentar' }, { status: 409, statusText: 'Conflict' },
    );
    expect(cmp.carteraBloqueada()).toBe(false);
    expect(cmp.error()).toContain('cambió');
  });
});

describe('OpDetalleComponent', () => {
  function setup(opId = '12') {
    TestBed.configureTestingModule({
      imports: [OpDetalleComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: of({ get: () => opId }) } },
      ],
    });
    const fixture = TestBed.createComponent(OpDetalleComponent);
    const http = TestBed.inject(HttpTestingController);
    return { fixture, http };
  }

  it('carga la OP por id y muestra el consecutivo en el hero', () => {
    const { fixture, http } = setup('12');
    fixture.detectChanges();
    // La carga también pide los requerimientos de insumos de la OP (la promesa).
    http.expectOne('http://localhost:3001/requerimientos?opId=12').flush([]);
    const req = http.expectOne('http://localhost:3001/pedidos/op/12');
    expect(req.request.method).toBe('GET');
    req.flush({
      id: 12, consecutivo: 1187, ocId: 41, fecha: '2026-05-28T00:00:00.000Z', estado: 'AMARRADA',
      oc: { id: 41, consecutivo: 2041, clienteId: 3, fecha: '2026-05-28T00:00:00.000Z', estado: 'EN_PRODUCCION',
            cliente: { id: 3, nit: '900', nombre: 'Minera El Roble', tipoCredito: 'D30', estadoCartera: 'AL_DIA', activo: true } },
      lineas: [],
    });
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('OP-1187');
    expect(text).toContain('Minera El Roble');
    // El panel de pares cedidos/recibidos pide su historial apenas se pinta la OP.
    http.match((r) => r.url.endsWith('/reassignments')).forEach((r) => r.flush([]));
    http.verify();
  });

  it('alterna entre vista por talla y por bodega', () => {
    const { fixture, http } = setup('12');
    fixture.detectChanges();
    http.expectOne('http://localhost:3001/requerimientos?opId=12').flush([]);
    http.expectOne('http://localhost:3001/pedidos/op/12').flush({
      id: 12, consecutivo: 1187, ocId: 41, fecha: '2026-05-28T00:00:00.000Z', estado: 'AMARRADA',
      oc: { id: 41, consecutivo: 2041, clienteId: 3, fecha: '2026-05-28T00:00:00.000Z', estado: 'EN_PRODUCCION',
            cliente: { id: 3, nit: '900', nombre: 'Minera El Roble', tipoCredito: 'D30', estadoCartera: 'AL_DIA', activo: true } },
      lineas: [{ id: 100, productoConfiguradoId: 7,
        productoConfigurado: { id: 7, codigo: 'BD', nombreComercial: 'Bota', referenciaId: 1, marcaId: 1 },
        tallas: [{ id: 500, tallaId: 36, cantPedida: 60, cantAmarrada: 60, cantAProducir: 0,
          talla: { id: 36, valor: 36, orden: 4 },
          reservas: [{ id: 9, inventarioPTId: 1, cantidad: 60, inventarioPT: { id: 1, bodegaId: 1, bodega: { id: 1, codigo: 'IBG', nombre: 'Ibagué' } } }] }] }],
    });
    fixture.detectChanges();
    const c = fixture.componentInstance;
    expect(c.vista()).toBe('talla');
    c.vista.set('bodega');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Total stock');
    // El panel de pares cedidos/recibidos pide su historial apenas se pinta la OP.
    http.match((r) => r.url.endsWith('/reassignments')).forEach((r) => r.flush([]));
    http.verify();
  });

  it('anular() hace POST /pedidos/op/:id/anular y recarga', () => {
    const { fixture, http } = setup('12');
    fixture.detectChanges();
    const base = {
      id: 12, consecutivo: 1187, ocId: 41, fecha: '2026-05-28T00:00:00.000Z',
      oc: { id: 41, consecutivo: 2041, clienteId: 3, fecha: '2026-05-28T00:00:00.000Z', estado: 'EN_PRODUCCION',
            cliente: { id: 3, nit: '900', nombre: 'Minera El Roble', tipoCredito: 'D30', estadoCartera: 'AL_DIA', activo: true } },
      lineas: [],
    };
    http.expectOne('http://localhost:3001/requerimientos?opId=12').flush([]);
    http.expectOne('http://localhost:3001/pedidos/op/12').flush({ ...base, estado: 'AMARRADA' });
    fixture.detectChanges();
    fixture.componentInstance.anular();
    const req = http.expectOne('http://localhost:3001/pedidos/op/12/anular');
    expect(req.request.method).toBe('POST');
    req.flush({ ...base, estado: 'ANULADA' });
    // tras anular, recarga (segundo GET de OP + requerimientos)
    http.expectOne('http://localhost:3001/requerimientos?opId=12').flush([]);
    http.expectOne('http://localhost:3001/pedidos/op/12').flush({ ...base, estado: 'ANULADA' });
    // El panel de pares cedidos/recibidos pide su historial apenas se pinta la OP.
    http.match((r) => r.url.endsWith('/reassignments')).forEach((r) => r.flush([]));
    http.verify();
  });

  it('muestra la sección de insumos con los requerimientos amarrados de la OP', () => {
    const { fixture, http } = setup('12');
    fixture.detectChanges();
    http.expectOne('http://localhost:3001/requerimientos?opId=12').flush([
      { id: 99, consecutivo: 3, fecha: '2026-07-21T00:00:00.000Z', reservaActiva: true },
    ]);
    http.expectOne('http://localhost:3001/pedidos/op/12').flush({
      id: 12, consecutivo: 1187, ocId: 41, fecha: '2026-05-28T00:00:00.000Z', estado: 'AMARRADA',
      oc: { id: 41, consecutivo: 2041, clienteId: 3, fecha: '2026-05-28T00:00:00.000Z', estado: 'EN_PRODUCCION',
            cliente: { id: 3, nit: '900', nombre: 'Minera El Roble', tipoCredito: 'D30', estadoCartera: 'AL_DIA', activo: true } },
      lineas: [],
    });
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Insumos del pedido');
    expect(text).toContain('REQ-3');
    expect(text).toContain('amarre activo');
    // El panel de pares cedidos/recibidos pide su historial apenas se pinta la OP.
    http.match((r) => r.url.endsWith('/reassignments')).forEach((r) => r.flush([]));
    http.verify();
  });

  it('muestra el panel de pares cedidos y recibidos con el historial de la OP', () => {
    const { fixture, http } = setup('12');
    fixture.detectChanges();
    http.expectOne('http://localhost:3001/requerimientos?opId=12').flush([]);
    http.expectOne('http://localhost:3001/pedidos/op/12').flush({
      id: 12, consecutivo: 1187, ocId: 41, fecha: '2026-05-28T00:00:00.000Z', estado: 'AMARRADA',
      lineas: [{ id: 1, productoConfiguradoId: 7, tallas: [{ id: 5, tallaId: 3, cantPedida: 20, cantAmarrada: 0, cantAProducir: 25, reassignedOut: 5, talla: { id: 3, valor: 40 } }] }],
    });
    fixture.detectChanges();
    http.expectOne('http://localhost:3001/pedidos/op/12/reassignments').flush([]);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Pares cedidos y recibidos');
    // El resumen explica por qué "a producir" supera lo pendiente de lo pedido.
    expect(text).toContain('5 de esos reponen pares que gerencia pasó a otro pedido');
    http.verify();
  });

  it('lista las entregas del pedido con su número y marca la final', () => {
    const { fixture, http } = setup('12');
    fixture.detectChanges();
    http.expectOne('http://localhost:3001/requerimientos?opId=12').flush([]);
    http.expectOne('http://localhost:3001/pedidos/op/12').flush({
      id: 12, consecutivo: 1187, ocId: 41, fecha: '2026-05-28T00:00:00.000Z', estado: 'DESPACHADA',
      oc: { id: 41, consecutivo: 2041, clienteId: 3, fecha: '2026-05-28T00:00:00.000Z', estado: 'CERRADA',
            cliente: { id: 3, nit: '900', nombre: 'Minera El Roble', tipoCredito: 'D30', estadoCartera: 'AL_DIA', activo: true } },
      lineas: [],
      despachos: [
        { id: 1, consecutivo: 30, fecha: '2026-11-18T00:00:00.000Z', deliveryNumber: 1, isFinal: false, lineas: [{ cantidad: 8 }, { cantidad: 4 }], factura: { id: 2, consecutivo: 77 } },
        { id: 2, consecutivo: 31, fecha: '2026-11-19T00:00:00.000Z', deliveryNumber: 2, isFinal: true, lineas: [{ cantidad: 8 }], factura: null },
      ],
    });
    fixture.detectChanges();
    http.match((r) => r.url.endsWith('/reassignments')).forEach((r) => r.flush([]));
    const el = fixture.nativeElement as HTMLElement;
    const filas = el.querySelectorAll('.desp-entregas tbody tr');
    expect(el.textContent).toContain('Entregas (2)');
    expect(filas.length).toBe(2);
    expect(filas[0].textContent).toContain('Entrega 1');
    expect(filas[0].textContent).not.toContain('final');
    expect(filas[0].textContent).toContain('12');
    expect(filas[0].textContent).toContain('FAC-77');
    expect(filas[1].textContent).toContain('Entrega 2 (final)');
    expect(filas[1].textContent).toContain('DSP-31');
    http.verify();
  });
});

describe('OpDetalleComponent — observación del pedido', () => {
  it('la planta ve la observación de la OC en la orden de producción', () => {
    TestBed.configureTestingModule({
      imports: [OpDetalleComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(OpDetalleComponent);
    fixture.detectChanges(); // ngOnInit pide la OP: se reemplaza por la de prueba
    fixture.componentInstance.op.set({
      id: 7, consecutivo: 1, estado: 'CREADA', ocId: 9, fecha: '2026-11-10T00:00:00.000Z', lineas: [],
      oc: { consecutivo: 1, observaciones: 'Suela color miel', cliente: { nombre: 'OLPAR' } },
    } as any);
    fixture.componentInstance.cargando.set(false);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Suela color miel');
  });
});
