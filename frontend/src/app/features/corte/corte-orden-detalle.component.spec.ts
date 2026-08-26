import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { CorteOrdenDetalleComponent } from './corte-orden-detalle.component';
import { OrdenCorteDetalle } from '../../core/api/models/corte.models';

const base = 'http://localhost:3001';

const detalle = (over: Partial<OrdenCorteDetalle> = {}): OrdenCorteDetalle =>
  ({
    id: 1,
    codigo: 'AGR-861',
    fecha: '2026-08-01T12:00:00.000Z',
    estado: 'EN_CORTE',
    linea: { id: 2, codigo: 'AGRO', nombre: 'Agro' },
    marca: null,
    observaciones: null,
    inicioCorte: '2026-08-01T12:00:00.000Z',
    entregaCorte: null,
    inicioGuarnicion: null,
    cierreGuarnicion: null,
    indicadores: {
      programado: 1206, cortado: 0, amarrado: 0,
      piezasCortadas: 0, piezasDanadas: 0, piezasRepuestas: 0,
      cumplimiento: 0, indiceReposicion: null, rendimientoGuarnicion: null,
      wip: 0, horasCorte: null, horasGuarnicion: null,
    },
    alertas: [],
    lineas: [
      { id: 10, productoConfigurado: { id: 1, referencia: null, marca: null }, talla: { id: 1, valor: 38 }, cantProgramada: 160, cantCortada: 0, cantAmarrada: 0, ofId: null },
      { id: 11, productoConfigurado: { id: 1, referencia: null, marca: null }, talla: { id: 2, valor: 39 }, cantProgramada: 240, cantCortada: 0, cantAmarrada: 0, ofId: null },
    ],
    avances: [],
    consumos: [],
    siguienteEstado: 'ENTREGADA',
    ...over,
  }) as OrdenCorteDetalle;

describe('CorteOrdenDetalleComponent', () => {
  let http: HttpTestingController;

  function crear() {
    TestBed.configureTestingModule({
      imports: [CorteOrdenDetalleComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => '1' } } } },
      ],
    });
    const fixture = TestBed.createComponent(CorteOrdenDetalleComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => http.verify());

  it('carga la orden del id de la ruta', () => {
    const f = crear();
    http.expectOne(`${base}/corte/ordenes/1`).flush(detalle());
    f.detectChanges();
    expect(f.componentInstance.orden()?.codigo).toBe('AGR-861');
  });

  it('al ENTREGAR propone lo programado como punto de partida', () => {
    const f = crear();
    http.expectOne(`${base}/corte/ordenes/1`).flush(detalle());
    f.detectChanges();

    f.componentInstance.pedirAvance(f.componentInstance.orden()!);
    const req = http.expectOne(`${base}/corte/ordenes/1/estado`);
    // Lo normal es que coincida con lo programado; así solo se corrige lo distinto.
    expect(req.request.body.cantidades).toEqual({ 10: 160, 11: 240 });
    req.flush(detalle({ estado: 'ENTREGADA' }));
    http.expectOne(`${base}/corte/ordenes/1`).flush(detalle({ estado: 'ENTREGADA' }));
  });

  it('en los demás estados no manda cantidades', () => {
    const f = crear();
    http.expectOne(`${base}/corte/ordenes/1`).flush(detalle({ estado: 'PROGRAMADA', siguienteEstado: 'EN_CORTE' }));
    f.detectChanges();

    f.componentInstance.pedirAvance(f.componentInstance.orden()!);
    const req = http.expectOne(`${base}/corte/ordenes/1/estado`);
    expect(req.request.body.cantidades).toBeUndefined();
    req.flush(detalle());
    http.expectOne(`${base}/corte/ordenes/1`).flush(detalle());
  });

  it('muestra el mensaje del backend cuando el avance se rechaza', () => {
    const f = crear();
    http.expectOne(`${base}/corte/ordenes/1`).flush(detalle());
    f.detectChanges();

    f.componentInstance.abrirAvance();
    f.componentInstance.nuevoAvance = { piezasCortadas: 100, piezasDanadas: 0, piezasRepuestas: 150, observaciones: '' };
    f.componentInstance.guardarAvance();

    http.expectOne(`${base}/corte/ordenes/1/avances`).flush(
      { message: 'No se pueden reponer más piezas de las que se cortaron' },
      { status: 400, statusText: 'Bad Request' },
    );
    expect(f.componentInstance.errorAvance()).toContain('No se pueden reponer');
    expect(f.componentInstance.formAvance()).toBeTrue();
  });

  it('recarga la orden después de guardar un avance', () => {
    const f = crear();
    http.expectOne(`${base}/corte/ordenes/1`).flush(detalle());
    f.detectChanges();

    f.componentInstance.abrirAvance();
    f.componentInstance.nuevoAvance = { piezasCortadas: 29000, piezasDanadas: 200, piezasRepuestas: 180, observaciones: 'Primer día' };
    f.componentInstance.guardarAvance();

    const req = http.expectOne(`${base}/corte/ordenes/1/avances`);
    expect(req.request.body.piezasRepuestas).toBe(180);
    req.flush({ id: 1 });

    http.expectOne(`${base}/corte/ordenes/1`).flush(detalle());
    expect(f.componentInstance.formAvance()).toBeFalse();
  });

  it('marca como recorridos los estados por los que ya pasó', () => {
    const f = crear();
    const o = detalle({ estado: 'ENTREGADA' });
    http.expectOne(`${base}/corte/ordenes/1`).flush(o);
    f.detectChanges();

    const c = f.componentInstance;
    expect(c.pasado(o, 'PROGRAMADA')).toBeTrue();
    expect(c.pasado(o, 'ENTREGADA')).toBeTrue();
    expect(c.pasado(o, 'CERRADA')).toBeFalse();
  });

  it('una orden anulada no marca ningún paso del recorrido', () => {
    const f = crear();
    const o = detalle({ estado: 'ANULADA', siguienteEstado: null });
    http.expectOne(`${base}/corte/ordenes/1`).flush(o);
    f.detectChanges();
    expect(f.componentInstance.pasado(o, 'PROGRAMADA')).toBeFalse();
  });

  it('colorea la desviación de material según qué tan lejos del BOM esté', () => {
    const f = crear();
    http.expectOne(`${base}/corte/ordenes/1`).flush(detalle());
    f.detectChanges();

    const c = f.componentInstance;
    expect(c.claseDesviacion(0.01)).toBe('badge-success');
    expect(c.claseDesviacion(0.04)).toBe('badge-warning');
    expect(c.claseDesviacion(0.2)).toBe('badge-error');
    // Gastar de menos también se sale del teórico: se marca igual.
    expect(c.claseDesviacion(-0.2)).toBe('badge-error');
  });

  it('muestra el error si la orden no existe', () => {
    const f = crear();
    http.expectOne(`${base}/corte/ordenes/1`).flush(
      { message: 'Orden de corte 1 no existe' },
      { status: 404, statusText: 'Not Found' },
    );
    f.detectChanges();
    expect(f.componentInstance.error()).toContain('no existe');
  });
});
