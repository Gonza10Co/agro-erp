import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import {
  CLAVE_PENDIENTES, CLAVE_RECHAZADOS, ESPERA_SERVIDOR_MS, INTERVALO_SYNC_MS, OfflineScanQueueService,
  PistolazoRechazado, ResultadoPistolazo, esFalloDeRed, nuevoIdPistolazo,
} from './offline-scan-queue.service';

const BASE = `${environment.apiUrl}/fabricacion/par`;
const url = (codigo: string) => `${BASE}/${codigo}/avanzar`;
const scan = (codigo: string, estacion = 'BODEGA_CORTE') => ({ codigo, operarioId: 4, estacion });
const okDe = (codigo: string, hoy = 1, extra: object = {}) => ({
  id: 1, codigo, celulaActual: 'ALMACEN', estado: 'EN_PROCESO',
  avance: { estacion: 'BODEGA_CORTE', nombre: 'Bodega de corte', terminado: false, hoy, calidad: 'PRIMERA', incidencia: null, parReposicion: null, ...extra },
});
const sinRed = (req: TestRequest) => req.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

describe('OfflineScanQueueService', () => {
  let svc: OfflineScanQueueService;
  let http: HttpTestingController;

  function montar() {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    svc = TestBed.inject(OfflineScanQueueService);
    http = TestBed.inject(HttpTestingController);
  }

  beforeEach(() => {
    localStorage.removeItem(CLAVE_PENDIENTES);
    localStorage.removeItem(CLAVE_RECHAZADOS);
    montar();
  });

  afterEach(() => {
    svc.ngOnDestroy();
    http.verify();
    localStorage.removeItem(CLAVE_PENDIENTES);
    localStorage.removeItem(CLAVE_RECHAZADOS);
  });

  /** Mete un pistolazo a la cola simulando que no hay red. */
  function encolarSinRed(codigo: string, estacion = 'BODEGA_CORTE'): ResultadoPistolazo {
    let r!: ResultadoPistolazo;
    svc.registrar(scan(codigo, estacion), { encolable: true }).subscribe((x) => (r = x));
    const req = http.match(url(codigo));
    if (req.length) sinRed(req[0]);
    return r;
  }

  it('con red, el servidor responde a tiempo: feedback normal y nada en la cola', () => {
    let r: ResultadoPistolazo | undefined;
    svc.registrar(scan('OF1-0004'), { encolable: true }).subscribe((x) => (r = x));
    const req = http.expectOne(url('OF1-0004'));
    // El id viaja desde el primer intento: si esta petición sí llega, el reintento no duplica.
    expect(req.request.body.clientScanId).toEqual(jasmine.any(String));
    expect(Number.isNaN(Date.parse(req.request.body.scannedAt))).toBeFalse();
    req.flush(okDe('OF1-0004', 3));
    expect(r).toEqual(jasmine.objectContaining({ tipo: 'servidor' }));
    expect(svc.pendientes()).toEqual([]);
    expect(svc.enLinea()).toBeTrue();
  });

  it('sin red (status 0) el pistolazo se acepta en la tablet, con su hora real, y queda guardado', () => {
    const antes = Date.now();
    const r = encolarSinRed('OF1-0004');
    expect(r).toEqual(jasmine.objectContaining({ tipo: 'encolado', porque: 'sin-red', pendientes: 1 }));
    const [p] = svc.pendientes();
    expect(p).toEqual(jasmine.objectContaining({ codigo: 'OF1-0004', operarioId: 4, estacion: 'BODEGA_CORTE', intentos: 0 }));
    expect(Date.parse(p.scannedAt)).toBeGreaterThanOrEqual(antes - 5);
    expect(JSON.parse(localStorage.getItem(CLAVE_PENDIENTES)!)).toEqual([p]);
    expect(svc.enLinea()).toBeFalse();
  });

  it('con el navegador sin red ni siquiera intenta: va directo a la cola', () => {
    spyOnProperty(navigator, 'onLine', 'get').and.returnValue(false);
    let r: ResultadoPistolazo | undefined;
    svc.registrar(scan('OF1-0004'), { encolable: true }).subscribe((x) => (r = x));
    http.expectNone(url('OF1-0004'));
    expect(r).toEqual(jasmine.objectContaining({ tipo: 'encolado', porque: 'sin-red' }));
  });

  it('un 502/503/504 del proxy también es falta de red; un 4xx o un 500 no', () => {
    expect(esFalloDeRed({ status: 0 })).toBeTrue();
    expect(esFalloDeRed({ status: 503 })).toBeTrue();
    expect(esFalloDeRed({ status: 409 })).toBeFalse();
    expect(esFalloDeRed({ status: 500 })).toBeFalse();
  });

  it('un rechazo de negocio (409) sale como error, igual que antes, y no se guarda', () => {
    let err: any;
    svc.registrar(scan('OF1-0004'), { encolable: true }).subscribe({ error: (e) => (err = e) });
    http.expectOne(url('OF1-0004')).flush({ message: 'le toca Montaje' }, { status: 409, statusText: 'Conflict' });
    expect(err.status).toBe(409);
    expect(svc.pendientes()).toEqual([]);
  });

  it('internet LENTO: a los 2 s sin respuesta se acepta en la tablet y la cola lo reintenta con el MISMO id', fakeAsync(() => {
    let r: ResultadoPistolazo | undefined;
    svc.registrar(scan('OF1-0004'), { encolable: true }).subscribe((x) => (r = x));
    const original = http.expectOne(url('OF1-0004'));
    const id = original.request.body.clientScanId;
    tick(ESPERA_SERVIDOR_MS - 1);
    expect(r).toBeUndefined();
    tick(1);
    expect(r).toEqual(jasmine.objectContaining({ tipo: 'encolado', porque: 'lento', pendientes: 1 }));
    expect(original.cancelled).toBeTrue();
    expect(svc.enLinea()).toBeTrue(); // lento no es sin señal

    // La sincronización arranca sola y repite el pistolazo con su id.
    let aceptados = 0;
    svc.aceptado$.subscribe(() => aceptados++);
    tick(0);
    flushMicrotasks();
    const reintento = http.expectOne(url('OF1-0004'));
    expect(reintento.request.body.clientScanId).toBe(id);
    expect(reintento.request.body.scannedAt).toBe(original.request.body.scannedAt);
    // La petición original sí había llegado: el servidor responde lo ya registrado, sin duplicar.
    reintento.flush(okDe('OF1-0004', 5, { repetido: true }));
    flushMicrotasks();
    expect(svc.pendientes()).toEqual([]);
    expect(svc.rechazados()).toEqual([]);
    expect(aceptados).toBe(1);
  }));

  it('una segunda o una baja (no encolable) espera al servidor sin límite y sin red falla', fakeAsync(() => {
    let r: ResultadoPistolazo | undefined;
    let err: any;
    svc.registrar({ ...scan('OF1-0004'), dano: { tipoDanoId: 8, descripcion: 'acta' } }, { encolable: false }).subscribe({ next: (x) => (r = x), error: (e) => (err = e) });
    tick(ESPERA_SERVIDOR_MS * 3);
    expect(r).toBeUndefined();
    sinRed(http.expectOne(url('OF1-0004')));
    expect(err.status).toBe(0);
    expect(svc.pendientes()).toEqual([]);
  }));

  it('una firma (usuario y clave) jamás se guarda en la tablet, aunque se pida encolar', () => {
    let err: any;
    const dano = { tipoDanoId: 11, autorizacion: { username: 'rosa', password: 'secreta' } };
    svc.registrar({ ...scan('OF1-0004'), dano }, { encolable: true }).subscribe({ error: (e) => (err = e) });
    sinRed(http.expectOne(url('OF1-0004')));
    expect(err.status).toBe(0);
    expect(localStorage.getItem(CLAVE_PENDIENTES)).toBeNull();
  });

  it('el mismo par en la misma estación no se guarda dos veces; en otra estación sí', fakeAsync(() => {
    encolarSinRed('OF1-0004');
    let r: ResultadoPistolazo | undefined;
    svc.registrar(scan('OF1-0004'), { encolable: true }).subscribe((x) => (r = x));
    expect(r).toEqual(jasmine.objectContaining({ tipo: 'repetido-en-cola' }));
    svc.registrar(scan('OF1-0004', 'MONTAJE'), { encolable: true }).subscribe((x) => (r = x));
    expect(r).toEqual(jasmine.objectContaining({ tipo: 'encolado', porque: 'cola', pendientes: 2 }));
    tick(0);
    flushMicrotasks();
    sinRed(http.expectOne(url('OF1-0004'))); // la cola intentó sola: sigue sin red
    flushMicrotasks();
  }));

  it('con cola pendiente, lo nuevo va directo a la cola (no se adelanta) y la sync respeta la hora real', fakeAsync(() => {
    encolarSinRed('OF1-0001');
    tick(5);
    // Ya hay cola: estos dos no se mandan, se guardan detrás.
    svc.registrar(scan('OF1-0002'), { encolable: true }).subscribe();
    tick(5);
    svc.registrar(scan('OF1-0003'), { encolable: true }).subscribe();
    tick(0); // la cola intenta sola (encolado 'cola')
    flushMicrotasks();
    // Vuelve la red: salen en orden de hora, uno a uno.
    const orden: string[] = [];
    for (const cod of ['OF1-0001', 'OF1-0002', 'OF1-0003']) {
      const req = http.expectOne((r) => r.url.endsWith('/avanzar'));
      orden.push(req.request.url.split('/').slice(-2, -1)[0]);
      expect(req.request.url).toBe(url(cod));
      req.flush(okDe(cod));
      flushMicrotasks();
    }
    expect(orden).toEqual(['OF1-0001', 'OF1-0002', 'OF1-0003']);
    expect(svc.pendientes()).toEqual([]);
  }));

  it('al sincronizar: un error de red deja la cola intacta y para; vuelve a intentar después', fakeAsync(() => {
    encolarSinRed('OF1-0001');
    tick(5);
    encolarSinRed('OF1-0002');
    tick(0);
    flushMicrotasks();
    sinRed(http.expectOne(url('OF1-0001')));
    flushMicrotasks();
    http.expectNone(url('OF1-0002')); // no sigue con el siguiente
    expect(svc.pendientes().map((p) => p.codigo)).toEqual(['OF1-0001', 'OF1-0002']);
    expect(svc.pendientes()[0].intentos).toBe(1);
    expect(svc.sincronizando()).toBeFalse();
  }));

  it('al sincronizar: un 500 del servidor también se reintenta después', fakeAsync(() => {
    encolarSinRed('OF1-0001');
    void svc.sincronizar();
    flushMicrotasks();
    http.expectOne(url('OF1-0001')).flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    flushMicrotasks();
    expect(svc.pendientes().length).toBe(1);
    expect(svc.rechazados()).toEqual([]);
  }));

  it('al sincronizar: un rechazo de negocio pasa a la lista de rechazados con su motivo y sigue con el resto', fakeAsync(() => {
    encolarSinRed('OF1-0001');
    tick(5);
    encolarSinRed('OF1-0002');
    const avisos: PistolazoRechazado[] = [];
    svc.rechazo$.subscribe((r) => avisos.push(r));
    void svc.sincronizar();
    flushMicrotasks();
    http.expectOne(url('OF1-0001')).flush({ message: 'Par OF1-0001 no existe' }, { status: 404, statusText: 'Not Found' });
    flushMicrotasks();
    http.expectOne(url('OF1-0002')).flush(okDe('OF1-0002'));
    flushMicrotasks();
    expect(svc.pendientes()).toEqual([]);
    expect(svc.rechazados()).toEqual([jasmine.objectContaining({ codigo: 'OF1-0001', motivo: 'Par OF1-0001 no existe' })]);
    expect(avisos.length).toBe(1);
    expect(JSON.parse(localStorage.getItem(CLAVE_RECHAZADOS)!).length).toBe(1);

    svc.descartarRechazo(svc.rechazados()[0].id);
    expect(svc.rechazados()).toEqual([]);
    expect(localStorage.getItem(CLAVE_RECHAZADOS)).toBeNull();
  }));

  it('al sincronizar: un doble pistolazo (409 REPETIDO) sale de la cola sin ensuciar los rechazados', fakeAsync(() => {
    encolarSinRed('OF1-0001');
    void svc.sincronizar();
    flushMicrotasks();
    http.expectOne(url('OF1-0001')).flush({ message: 'ya estaba', motivo: 'REPETIDO' }, { status: 409, statusText: 'Conflict' });
    flushMicrotasks();
    expect(svc.pendientes()).toEqual([]);
    expect(svc.rechazados()).toEqual([]);
  }));

  it('la cola y los rechazados sobreviven a recargar la página', () => {
    encolarSinRed('OF1-0001');
    localStorage.setItem(CLAVE_RECHAZADOS, JSON.stringify([{ id: 'x', codigo: 'OF1-0009', operarioId: 4, estacion: 'PT', scannedAt: '2026-11-21T10:00:00.000Z', intentos: 1, motivo: 'no existe', rechazadoAt: '' }]));
    const guardado = svc.pendientes();
    svc.ngOnDestroy();
    TestBed.resetTestingModule();
    montar();
    expect(svc.pendientes()).toEqual(guardado);
    expect(svc.rechazados().map((r) => r.codigo)).toEqual(['OF1-0009']);
  });

  it('basura en el storage no rompe nada', () => {
    localStorage.setItem(CLAVE_PENDIENTES, '{no es json');
    TestBed.resetTestingModule();
    montar();
    expect(svc.pendientes()).toEqual([]);
  });

  it('iniciar: al volver la red (evento online) y cada 30 s mientras haya cola, sincroniza', fakeAsync(() => {
    encolarSinRed('OF1-0001');
    svc.iniciar();
    flushMicrotasks();
    sinRed(http.expectOne(url('OF1-0001'))); // intento al arrancar
    flushMicrotasks();

    window.dispatchEvent(new Event('online'));
    flushMicrotasks();
    expect(svc.enLinea()).toBeTrue();
    sinRed(http.expectOne(url('OF1-0001')));
    flushMicrotasks();

    tick(INTERVALO_SYNC_MS);
    flushMicrotasks();
    http.expectOne(url('OF1-0001')).flush(okDe('OF1-0001'));
    flushMicrotasks();
    expect(svc.pendientes()).toEqual([]);

    tick(INTERVALO_SYNC_MS); // sin cola no hace nada
    http.expectNone(url('OF1-0001'));
    svc.ngOnDestroy();
  }));

  it('nuevoIdPistolazo da ids distintos', () => {
    const ids = new Set(Array.from({ length: 50 }, () => nuevoIdPistolazo()));
    expect(ids.size).toBe(50);
  });
});
