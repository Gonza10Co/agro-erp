import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import {
  CorteOrdenCrearComponent,
  agregarRenglonesDeOf,
  etiquetaOf,
  hoyLocal,
} from './corte-orden-crear.component';
import { OfDisponible } from '../../core/api/models/corte.models';

const base = 'http://localhost:3001';

const of19: OfDisponible = {
  id: 19,
  consecutivo: 19,
  estado: 'ABIERTA',
  op: { id: 1, consecutivo: 1 },
  oc: { id: 8, consecutivo: 8, ocCliente: null, cliente: 'Cliente 69561' },
  linea: { id: 2, codigo: 'AGRO', nombre: 'Agro' },
  aProducir: 96,
  pendiente: 96,
  renglones: [39, 40, 41].map((t, i) => ({
    productoConfiguradoId: 7,
    producto: { codigo: 'PC-101', nombre: '101 PODEROSA café', referencia: '101' },
    tallaId: t,
    talla: t,
    aProducir: [30, 36, 30][i],
    programado: 0,
    pendiente: [30, 36, 30][i],
  })),
};

const of20: OfDisponible = {
  ...of19,
  id: 20,
  consecutivo: 20,
  oc: { ...of19.oc, consecutivo: 9 },
  linea: { id: 3, codigo: 'BASARILI', nombre: 'Basarili' },
  aProducir: 40,
  pendiente: 40,
  renglones: [
    { ...of19.renglones[0], aProducir: 10, pendiente: 10 },
    { ...of19.renglones[0], productoConfiguradoId: 8, producto: { codigo: 'PC-102', nombre: '102 ROBUSTA negra', referencia: '102' }, aProducir: 30, pendiente: 30 },
  ],
};

describe('lógica de la nueva orden de corte', () => {
  it('hoyLocal da la jornada en la hora de la planta', () => {
    expect(hoyLocal(new Date(2026, 9, 5, 19, 30))).toBe('2026-10-05');
  });

  it('etiquetaOf muestra OF, OC, cliente, producto y pares', () => {
    expect(etiquetaOf(of19)).toBe('OF-19 · OC #8 Cliente 69561 · 101 PODEROSA café · 96 pares');
    expect(etiquetaOf({ ...of19, pendiente: 26 })).toContain('26 de 96 pares por programar');
  });

  it('carga las tallas pendientes con su ofId y la cantidad prellenada', () => {
    const { renglones, repetidos } = agregarRenglonesDeOf([], of19);
    expect(repetidos).toEqual([]);
    expect(renglones.map((r) => [r.ofId, r.talla, r.cantProgramada])).toEqual([[19, 39, 30], [19, 40, 36], [19, 41, 30]]);
  });

  it('salta las tallas ya programadas completas', () => {
    const conUna = { ...of19, renglones: of19.renglones.map((r, i) => (i === 1 ? { ...r, programado: 36, pendiente: 0 } : r)) };
    expect(agregarRenglonesDeOf([], conUna).renglones.map((r) => r.talla)).toEqual([39, 41]);
  });

  it('el mismo producto × talla de otra OF queda por fuera y se avisa', () => {
    const { renglones: primera } = agregarRenglonesDeOf([], of19);
    const { renglones, repetidos } = agregarRenglonesDeOf(primera, of20);
    expect(repetidos).toEqual(['101 PODEROSA café talla 39']);
    expect(renglones).toHaveSize(4);
    expect(renglones[3].ofId).toBe(20);
  });
});

describe('CorteOrdenCrearComponent', () => {
  let http: HttpTestingController;
  let router: Router;

  function crear() {
    TestBed.configureTestingModule({
      imports: [CorteOrdenCrearComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(CorteOrdenCrearComponent);
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${base}/catalog/lineas`).flush([
      { id: 2, codigo: 'AGRO', nombre: 'Agro', celulaInicial: 'CORTE', activo: true },
      { id: 3, codigo: 'BASARILI', nombre: 'Basarili', celulaInicial: 'CORTE', activo: true },
    ]);
    http.expectOne(`${base}/corte/ofs-disponibles`).flush([of19, of20]);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => http.verify());

  it('arranca con la fecha de hoy, sin renglones y sin poder guardar', () => {
    const c = crear().componentInstance;
    expect(c.fecha()).toBe(hoyLocal());
    expect(c.valido()).toBeFalse();
    expect(c.motivoInvalido()).toContain('código');
  });

  it('al agregar la OF prellena renglones y toma la línea del pedido', () => {
    const fixture = crear();
    const c = fixture.componentInstance;
    c.ofId.set(19);
    c.agregarOf();
    fixture.detectChanges();
    expect(c.renglones()).toHaveSize(3);
    expect(c.lineaId()).toBe(2);
    expect(c.totalPares()).toBe(96);
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(3);
  });

  it('una segunda OF de otra línea se suma, pero avisa', () => {
    const c = crear().componentInstance;
    c.ofId.set(19);
    c.agregarOf();
    c.ofId.set(20);
    c.agregarOf();
    expect(c.lineaId()).toBe(2);
    expect(c.aviso()).toContain('línea Basarili');
    expect(c.aviso()).toContain('talla 39');
    expect(c.renglones()).toHaveSize(4);
  });

  it('exige cantidades enteras mayores que cero', () => {
    const c = crear().componentInstance;
    c.codigo.set('AGR-905');
    c.ofId.set(19);
    c.agregarOf();
    expect(c.valido()).toBeTrue();
    c.setCantidad(0, 0);
    expect(c.valido()).toBeFalse();
    c.setCantidad(0, 2.5);
    expect(c.valido()).toBeFalse();
    c.quitarRenglon(0);
    expect(c.valido()).toBeTrue();
    c.quitarRenglon(0);
    c.quitarRenglon(0);
    expect(c.motivoInvalido()).toContain('al menos una OF');
  });

  it('guarda con ofId por renglón y navega al detalle de la orden creada', () => {
    const c = crear().componentInstance;
    const nav = spyOn(router, 'navigate').and.resolveTo(true);
    c.codigo.set(' agr-905 ');
    c.observaciones.set('turno de la mañana');
    c.ofId.set(19);
    c.agregarOf();
    c.setCantidad(1, 38);
    c.crear();
    const req = http.expectOne(`${base}/corte/ordenes`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      codigo: 'AGR-905',
      fecha: hoyLocal(),
      lineaId: 2,
      observaciones: 'turno de la mañana',
      lineas: [
        { productoConfiguradoId: 7, tallaId: 39, cantProgramada: 30, ofId: 19 },
        { productoConfiguradoId: 7, tallaId: 40, cantProgramada: 38, ofId: 19 },
        { productoConfiguradoId: 7, tallaId: 41, cantProgramada: 30, ofId: 19 },
      ],
    });
    req.flush({ id: 33 });
    expect(nav).toHaveBeenCalledWith(['/corte/ordenes', 33]);
  });

  it('muestra el error del backend (código repetido) y deja reintentar', () => {
    const fixture = crear();
    const c = fixture.componentInstance;
    c.codigo.set('AGR-861');
    c.ofId.set(19);
    c.agregarOf();
    c.crear();
    http
      .expectOne(`${base}/corte/ordenes`)
      .flush({ message: 'La orden de corte AGR-861 ya existe' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(c.error()).toBe('La orden de corte AGR-861 ya existe');
    expect(c.enviando()).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain('AGR-861 ya existe');
  });
});
