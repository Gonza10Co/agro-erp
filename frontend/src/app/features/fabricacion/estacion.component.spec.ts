import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EstacionComponent, CLAVE_CONFIG, guardarConfig, leerConfig } from './estacion.component';
import { AuthService } from '../../core/auth/auth.service';
import { environment } from '../../../environments/environment';
import { CLAVE_PENDIENTES, CLAVE_RECHAZADOS, ESPERA_SERVIDOR_MS, OfflineScanQueueService } from '../../core/offline/offline-scan-queue.service';
import { borrarRespaldos } from '../../core/offline/respaldo-local';

const BASE = `${environment.apiUrl}/fabricacion`;
const ESTACIONES = [
  { codigo: 'PREPARACION', nombre: 'Preparación', orden: 1, celula: 'GUARNICION', subPaso: 'PREPARACION', subPasoInyeccion: null, activa: true },
  { codigo: 'CIERRE', nombre: 'Cierre', orden: 2, celula: 'GUARNICION', subPaso: 'CIERRE', subPasoInyeccion: null, activa: false },
  { codigo: 'BODEGA_CORTE', nombre: 'Bodega de corte', orden: 3, celula: 'ALMACEN', subPaso: null, subPasoInyeccion: null, activa: true },
  { codigo: 'PT', nombre: 'Producto terminado', orden: 6, celula: 'PT', subPaso: null, subPasoInyeccion: null, activa: true },
];

/** El pistolazo siempre lleva su hora real y su id (cola sin internet): se validan y se quitan para comparar el resto. */
function sinSello(body: any): any {
  const { scannedAt, clientScanId, ...resto } = body;
  expect(Number.isNaN(Date.parse(scannedAt))).toBeFalse();
  expect(typeof clientScanId).toBe('string');
  return resto;
}

/** `puedeBaja` se calcula al construir el componente: el rol se fija ANTES de crearlo. */
function crear(rol: string | null = null) {
  TestBed.configureTestingModule({
    imports: [EstacionComponent],
    providers: [
      provideHttpClient(), provideHttpClientTesting(),
      { provide: AuthService, useValue: { rol: () => rol } },
    ],
  });
  const fixture = TestBed.createComponent(EstacionComponent);
  const http = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  http.expectOne(`${BASE}/estaciones`).flush(ESTACIONES);
  fixture.detectChanges();
  return { fixture, http, comp: fixture.componentInstance };
}

describe('config del dispositivo (localStorage)', () => {
  afterEach(() => localStorage.removeItem(CLAVE_CONFIG));
  it('guarda, lee y descarta basura', () => {
    guardarConfig({ estacion: 'BODEGA_CORTE', operarioId: 4 });
    expect(leerConfig()).toEqual({ estacion: 'BODEGA_CORTE', operarioId: 4 });
    localStorage.setItem(CLAVE_CONFIG, '{"estacion":1}');
    expect(leerConfig()).toBeNull();
    guardarConfig(null);
    expect(leerConfig()).toBeNull();
  });
});

describe('EstacionComponent', () => {
  afterEach(() => localStorage.removeItem(CLAVE_CONFIG));

  it('sin config pide la estación y solo ofrece las activas', () => {
    const { fixture, http, comp } = crear();
    // Al abrir la config carga operarios y máquinas de la primera activa (Preparación).
    http.expectOne(`${BASE}/operarios?celula=GUARNICION`).flush([{ id: 2, nombre: 'Gloria', celula: 'GUARNICION' }]);
    http.expectOne(`${BASE}/maquinas?celula=GUARNICION`).flush([]);
    fixture.detectChanges();
    expect(comp.configurando()).toBeTrue();
    expect(comp.activas().map((e) => e.codigo)).toEqual(['PREPARACION', 'BODEGA_CORTE', 'PT']);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('¿Qué estación es este dispositivo?');
    http.verify();
  });

  it('con config de Bodega, un código + Enter es un pistolazo con la estación declarada', () => {
    guardarConfig({ estacion: 'BODEGA_CORTE', operarioId: 4 });
    const { fixture, http, comp } = crear();
    http.expectOne(`${BASE}/operarios?celula=ALMACEN`).flush([{ id: 4, nombre: 'Aldo', celula: 'ALMACEN' }]);
    http.expectOne(`${BASE}/maquinas?celula=ALMACEN`).flush([]);
    http.expectOne(`${BASE}/hoy`).flush({ fecha: '2026-09-09', actualizado: '', estaciones: [{ codigo: 'BODEGA_CORTE', nombre: 'Bodega de corte', celula: 'ALMACEN', hoy: 2, ultimaHora: 2, meta: 1206 }] });
    fixture.detectChanges();
    expect(comp.esNacimiento()).toBeFalse();
    expect(comp.hoy()).toBe(2);

    comp.codigo = 'OF1-0004';
    comp.escanear();
    const req = http.expectOne(`${BASE}/par/OF1-0004/avanzar`);
    expect(sinSello(req.request.body)).toEqual({ operarioId: 4, estacion: 'BODEGA_CORTE' });
    req.flush({ id: 1, codigo: 'OF1-0004', celulaActual: 'ALMACEN', estado: 'EN_PROCESO', avance: { estacion: 'BODEGA_CORTE', nombre: 'Bodega de corte', terminado: false, hoy: 3 } });
    fixture.detectChanges();
    expect(comp.hoy()).toBe(3);
    expect(comp.resultado()).toEqual(jasmine.objectContaining({ ok: true, titulo: 'OF1-0004 → Bodega de corte' }));
    expect(comp.codigo).toBe('');
    http.verify();
  });

  it('un pistolazo rechazado por el backend se muestra en rojo con su mensaje', () => {
    guardarConfig({ estacion: 'BODEGA_CORTE', operarioId: 4 });
    const { fixture, http, comp } = crear();
    http.expectOne(`${BASE}/operarios?celula=ALMACEN`).flush([]);
    http.expectOne(`${BASE}/maquinas?celula=ALMACEN`).flush([]);
    http.expectOne(`${BASE}/hoy`).flush({ fecha: '', actualizado: '', estaciones: [] });
    comp.codigo = 'OF1-0004';
    comp.escanear();
    http.expectOne(`${BASE}/par/OF1-0004/avanzar`).flush({ message: 'Este par viene de Bodega de corte: le toca Inyección · Montaje, no Bodega de corte' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(comp.resultado()).toEqual(jasmine.objectContaining({ ok: false, detalle: jasmine.stringContaining('le toca Inyección · Montaje') }));
    expect((fixture.nativeElement as HTMLElement).querySelector('.resultado.err')).toBeTruthy();
    http.verify();
  });

  it('en Preparación no se escanea: se eligen OF y talla y nacen pares', () => {
    guardarConfig({ estacion: 'PREPARACION', operarioId: 2 });
    const { fixture, http, comp } = crear();
    http.expectOne(`${BASE}/operarios?celula=GUARNICION`).flush([{ id: 2, nombre: 'Gloria', celula: 'GUARNICION' }]);
    http.expectOne(`${BASE}/maquinas?celula=GUARNICION`).flush([]);
    http.expectOne(`${BASE}/hoy`).flush({ fecha: '', actualizado: '', estaciones: [] });
    http.expectOne(`${BASE}/of`).flush([{ id: 16, consecutivo: 1, estado: 'EN_PROCESO', fecha: '', op: { consecutivo: 1 }, _count: { pares: 0 } }, { id: 9, consecutivo: 0, estado: 'TERMINADA', fecha: '', op: { consecutivo: 0 }, _count: { pares: 0 } }]);
    fixture.detectChanges();
    expect(comp.esNacimiento()).toBeTrue();
    expect(comp.ofs().map((o) => o.id)).toEqual([16]); // las terminadas no se ofrecen

    comp.ofId = 16;
    comp.cargarOf();
    const linea = { productoConfiguradoId: 1, producto: 'Bota', productoCodigo: 'PC', tallaId: 3, talla: '40', programado: 346, nacidos: 3, terminados: 0 };
    http.expectOne(`${BASE}/of/16`).flush({ id: 16, consecutivo: 1, estado: 'EN_PROCESO', fecha: '', op: { consecutivo: 1 }, pares: [], programa: [linea] });
    fixture.detectChanges();
    expect(comp.tanda['1-3']).toBe(20); // una canasta por defecto

    comp.tanda['1-3'] = 2;
    comp.nacer(comp.of()!, linea);
    const req = http.expectOne(`${BASE}/of/16/nacer`);
    expect(req.request.body).toEqual({ productoConfiguradoId: 1, tallaId: 3, cantidad: 2, operarioId: 2, maquinaId: undefined });
    req.flush({ estacion: ESTACIONES[0], hoy: 5, pares: [{ id: 1, codigo: 'OF1-0004', talla: '40', producto: 'Bota', productoCodigo: 'PC', referencia: '101', marca: 'Poderosa', linea: 'Basarili', of: 1 }, { id: 2, codigo: 'OF1-0005', talla: '40', producto: 'Bota', productoCodigo: 'PC', referencia: '101', marca: 'Poderosa', linea: 'Basarili', of: 1 }] });
    // Tras nacer se recarga la OF para actualizar nacidos/programados.
    http.expectOne(`${BASE}/of/16`).flush({ id: 16, consecutivo: 1, estado: 'EN_PROCESO', fecha: '', op: { consecutivo: 1 }, pares: [], programa: [{ ...linea, nacidos: 5 }] });
    fixture.detectChanges();
    expect(comp.hoy()).toBe(5);
    expect(comp.resultado()).toEqual(jasmine.objectContaining({ ok: true, titulo: '2 pares de talla 40 nacieron' }));
    // Si la descarga falla, la tanda sigue a mano para reimprimirla sin volver a nacer.
    expect(comp.resultado()?.tanda?.map((p) => p.codigo)).toEqual(['OF1-0004', 'OF1-0005']);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Volver a imprimir las 2 etiquetas de esta tanda');
    http.verify();
  });
  it('con el foco en el selector de OF, el pistolazo va al campo de escaneo y no cambia la OF', () => {
    guardarConfig({ estacion: 'PREPARACION', operarioId: 2 });
    const { fixture, http, comp } = crear();
    http.expectOne(`${BASE}/operarios?celula=GUARNICION`).flush([]);
    http.expectOne(`${BASE}/maquinas?celula=GUARNICION`).flush([]);
    http.expectOne(`${BASE}/hoy`).flush({ fecha: '', actualizado: '', estaciones: [] });
    http.expectOne(`${BASE}/of`).flush([{ id: 16, consecutivo: 1, estado: 'EN_PROCESO', fecha: '', op: { consecutivo: 1 }, _count: { pares: 0 } }]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    document.body.appendChild(el);
    const sel = el.querySelector('.of-sel select') as HTMLSelectElement;
    sel.focus();
    const ev = new KeyboardEvent('keydown', { key: 'O', cancelable: true, bubbles: true });
    sel.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBeTrue();
    expect(document.activeElement).toBe(el.querySelector('.scan-input'));
    expect(comp.codigo).toBe('O');
    el.remove();
    http.verify();
  });
});

describe('EstacionComponent: imprimir por adelantado', () => {
  afterEach(() => localStorage.removeItem(CLAVE_CONFIG));

  const L39 = { productoConfiguradoId: 1, producto: 'Bota', productoCodigo: '101-61-CON_PUNTERA', tallaId: 39, talla: '39', programado: 32, nacidos: 0, reservados: 32, terminados: 0 };
  const L40 = { productoConfiguradoId: 1, producto: 'Bota', productoCodigo: '101-61-CON_PUNTERA', tallaId: 40, talla: '40', programado: 32, nacidos: 2, reservados: 0, terminados: 0 };
  const etiqueta = (codigo: string, talla = '40') => ({ id: 1, codigo, talla, producto: 'Bota', productoCodigo: 'PC', referencia: '101', marca: 'Agro', linea: 'Agro', of: 19 });

  function enPreparacion() {
    guardarConfig({ estacion: 'PREPARACION', operarioId: 2 });
    const m = crear();
    m.http.expectOne(`${BASE}/operarios?celula=GUARNICION`).flush([{ id: 2, nombre: 'Gloria', celula: 'GUARNICION' }]);
    m.http.expectOne(`${BASE}/maquinas?celula=GUARNICION`).flush([]);
    m.http.expectOne(`${BASE}/hoy`).flush({ fecha: '', actualizado: '', estaciones: [] });
    m.http.expectOne(`${BASE}/of`).flush([{ id: 19, consecutivo: 19, estado: 'ABIERTA', fecha: '', op: { consecutivo: 54 }, _count: { pares: 0 } }]);
    m.comp.ofId = 19;
    m.comp.cargarOf();
    m.http.expectOne(`${BASE}/of/19`).flush({ id: 19, consecutivo: 19, estado: 'ABIERTA', fecha: '', op: { consecutivo: 54 }, pares: [], programa: [L39, L40] });
    m.fixture.detectChanges();
    return m;
  }

  it('prellena la primera talla con cupo y todo lo que le falta; la impresa no cuenta como nacida', () => {
    const { fixture, http, comp } = enPreparacion();
    // La 39 ya está toda impresa: se salta y se ofrece la 40 con sus 30 pendientes.
    expect(comp.adelantoClave).toBe('1-40');
    expect(comp.adelantoCantidad).toBe(30);
    expect(comp.libres(L39)).toBe(0);
    expect(comp.reservadosOf()).toBe(32);
    const texto = (fixture.nativeElement as HTMLElement).textContent!;
    expect(texto).toContain('32 impresas sin nacer');
    expect(texto).toContain('Imprimir por adelantado 🖨️');
    expect(texto).toContain('Reimprimir las 32 impresas sin nacer');
    http.verify();
  });

  it('Imprimir por adelantado reserva los códigos (no nace nada) y baja el PDF', () => {
    const { fixture, http, comp } = enPreparacion();
    comp.adelantoCantidad = 2;
    comp.imprimirAdelantado(comp.of()!);
    const req = http.expectOne(`${BASE}/of/19/reservar-etiquetas`);
    expect(req.request.body).toEqual({ productoConfiguradoId: 1, tallaId: 40, cantidad: 2 });
    req.flush({ etiquetas: [etiqueta('OF19-0033'), etiqueta('OF19-0034')] });
    http.expectOne(`${BASE}/of/19`).flush({ id: 19, consecutivo: 19, estado: 'ABIERTA', fecha: '', op: { consecutivo: 54 }, pares: [], programa: [L39, { ...L40, reservados: 2 }] });
    fixture.detectChanges();
    expect(comp.hoy()).toBe(0); // la TV y el contador no se enteran
    expect(comp.resultado()).toEqual(jasmine.objectContaining({ ok: true, titulo: '2 etiquetas de talla 40 impresas por adelantado' }));
    expect(comp.resultado()?.tanda?.map((p) => p.codigo)).toEqual(['OF19-0033', 'OF19-0034']);
    expect(comp.adelantoCantidad).toBe(28);
    http.verify();
  });

  it('reimprime las pendientes de la OF', () => {
    const { http, comp } = enPreparacion();
    comp.reimprimirReservadas(comp.of()!);
    http.expectOne(`${BASE}/of/19/etiquetas-reservadas`).flush({ etiquetas: [etiqueta('OF19-0001', '39')] });
    expect(comp.resultado()?.tanda?.map((p) => p.codigo)).toEqual(['OF19-0001']);
    http.verify();
  });

  it('escanear una impresa en Preparación la hace nacer y recarga la OF', () => {
    const { fixture, http, comp } = enPreparacion();
    comp.codigo = 'OF19-0001';
    comp.escanear();
    const req = http.expectOne(`${BASE}/par/OF19-0001/avanzar`);
    expect(sinSello(req.request.body)).toEqual({ operarioId: 2, estacion: 'PREPARACION' });
    req.flush({ id: 9, codigo: 'OF19-0001', celulaActual: 'GUARNICION', estado: 'EN_PROCESO', avance: { estacion: 'PREPARACION', nombre: 'Preparación', terminado: false, hoy: 1, calidad: 'PRIMERA', incidencia: null, parReposicion: null, nacio: true } });
    http.expectOne(`${BASE}/of/19`).flush({ id: 19, consecutivo: 19, estado: 'EN_PROCESO', fecha: '', op: { consecutivo: 54 }, pares: [], programa: [{ ...L39, nacidos: 1, reservados: 31 }, L40] });
    fixture.detectChanges();
    expect(comp.hoy()).toBe(1);
    expect(comp.resultado()).toEqual(jasmine.objectContaining({ ok: true, titulo: 'OF19-0001 nació en Preparación ✓' }));
    http.verify();
  });
});

/**
 * "Algo pasó con este par": el botón arma el SIGUIENTE escaneo con un daño
 * tipificado; la clase decide el destino y la pantalla lo muestra en ámbar.
 */
describe('EstacionComponent — algo pasó con este par', () => {
  afterEach(() => localStorage.removeItem(CLAVE_CONFIG));

  const TIPOS = [
    { id: 8, codigo: 'DANO-ROBOT', nombre: 'Daño de robot en capellada', celulaCausante: 'INYECCION', clase: 'BAJA' },
    { id: 11, codigo: 'REBABA-SUELA', nombre: 'Rebaba en la suela', celulaCausante: 'INYECCION', clase: 'SEGUNDA' },
    { id: 7, codigo: 'ECONOMIZADOR-RASGADO', nombre: 'Economizador rasgado', celulaCausante: 'INYECCION', clase: 'REPROCESO' },
  ];

  function enBodega(rol: string | null = null) {
    guardarConfig({ estacion: 'BODEGA_CORTE', operarioId: 4 });
    const ctx = crear(rol);
    ctx.http.expectOne(`${BASE}/operarios?celula=ALMACEN`).flush([{ id: 4, nombre: 'Aldo', celula: 'ALMACEN' }]);
    ctx.http.expectOne(`${BASE}/maquinas?celula=ALMACEN`).flush([]);
    ctx.http.expectOne(`${BASE}/hoy`).flush({ fecha: '2026-09-11', actualizado: '', estaciones: [] });
    ctx.fixture.detectChanges();
    return ctx;
  }

  function abrirPanel(ctx: ReturnType<typeof enBodega>) {
    ctx.comp.abrirCalidad();
    ctx.http.expectOne(`${environment.apiUrl}/calidad/tipos-dano`).flush(TIPOS);
    ctx.fixture.detectChanges();
  }

  it('el botón carga el catálogo (segundas primero, la baja al final) y el escaneo lleva el tipo de daño', () => {
    // Sesión de calidad: firma la segunda sin pedir clave.
    const ctx = enBodega('CALIDAD');
    const texto = () => (ctx.fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto()).toContain('Algo pasó con este par');
    abrirPanel(ctx);
    expect(ctx.comp.tipos().map((t) => t.clase)).toEqual(['SEGUNDA', 'REPROCESO', 'BAJA']);
    expect(texto()).toContain('Sigue, pero como SEGUNDA');

    ctx.comp.tipoSel.set(11);
    ctx.comp.codigo = 'OF1-0004';
    ctx.comp.escanear();
    const req = ctx.http.expectOne(`${BASE}/par/OF1-0004/avanzar`);
    // Sin nota: el tipo ya dice por qué.
    expect(sinSello(req.request.body)).toEqual({ operarioId: 4, estacion: 'BODEGA_CORTE', tipoDanoId: 11 });
    req.flush({
      id: 1, codigo: 'OF1-0004', celulaActual: 'ALMACEN', estado: 'EN_PROCESO',
      avance: {
        estacion: 'BODEGA_CORTE', nombre: 'Bodega de corte', terminado: false, hoy: 3, calidad: 'SEGUNDA',
        incidencia: { tipoDano: { codigo: 'REBABA-SUELA', nombre: 'Rebaba en la suela', clase: 'SEGUNDA' } },
        parReposicion: null,
      },
    });
    ctx.fixture.detectChanges();
    expect(ctx.comp.resultado()).toEqual(jasmine.objectContaining({ ok: true, alerta: true, titulo: 'OF1-0004 → Bodega de corte · SEGUNDA' }));
    expect(texto()).toContain('Rebaba en la suela');
    // Una lectura por reporte: el panel se cierra y el siguiente escaneo es normal.
    expect(ctx.comp.modoCalidad()).toBeFalse();
    ctx.http.verify();
  });

  it('sin elegir el tipo no manda nada y lo dice', () => {
    const ctx = enBodega();
    abrirPanel(ctx);
    ctx.comp.codigo = 'OF1-0004';
    ctx.comp.escanear();
    ctx.http.expectNone(`${BASE}/par/OF1-0004/avanzar`);
    expect(ctx.comp.resultado()?.detalle).toBe('Primero elige qué tiene el par');
    expect(ctx.comp.modoCalidad()).toBeTrue();
  });

  it('una SEGUNDA desde la sesión de la operaria pide la clave de calidad y la manda en el escaneo', () => {
    const ctx = enBodega('OPERARIO');
    abrirPanel(ctx);
    ctx.comp.tipoSel.set(11);
    ctx.fixture.detectChanges();
    expect((ctx.fixture.nativeElement as HTMLElement).textContent).toContain('Autoriza calidad');

    // Sin usuario y clave no sale nada.
    ctx.comp.codigo = 'OF1-0004';
    ctx.comp.escanear();
    ctx.http.expectNone(`${BASE}/par/OF1-0004/avanzar`);
    expect(ctx.comp.resultado()?.detalle).toBe('Una segunda la autoriza calidad: falta su usuario y clave');

    ctx.comp.autUsuario = ' rosa ';
    ctx.comp.autClave = 'secreta';
    ctx.comp.codigo = 'OF1-0004';
    ctx.comp.escanear();
    const req = ctx.http.expectOne(`${BASE}/par/OF1-0004/avanzar`);
    expect(sinSello(req.request.body)).toEqual({
      operarioId: 4, estacion: 'BODEGA_CORTE', tipoDanoId: 11,
      autorizacion: { username: 'rosa', password: 'secreta' },
    });
    req.flush({
      id: 1, codigo: 'OF1-0004', celulaActual: 'ALMACEN', estado: 'EN_PROCESO',
      avance: {
        estacion: 'BODEGA_CORTE', nombre: 'Bodega de corte', terminado: false, hoy: 3, calidad: 'SEGUNDA',
        incidencia: { tipoDano: { codigo: 'REBABA-SUELA', nombre: 'Rebaba en la suela', clase: 'SEGUNDA' } },
        parReposicion: { codigo: 'OF1-0004-R1', celulaActual: 'GUARNICION' },
      },
    });
    ctx.fixture.detectChanges();
    const texto = (ctx.fixture.nativeElement as HTMLElement).textContent ?? '';
    // La segunda se repone: se ofrece imprimir la lengua de la reposición.
    expect(texto).toContain('lo repone OF1-0004-R1');
    expect(texto).toContain('Imprimir etiqueta de la lengua de OF1-0004-R1');
    // La clave no se queda en la pantalla.
    expect(ctx.comp.autClave).toBe('');
    expect(ctx.comp.modoCalidad()).toBeFalse();
  });

  it('una BAJA la firma el gerente: sin rol pide su clave; con rol exige la nota (acta)', () => {
    const sinRol = enBodega('OPERARIO');
    abrirPanel(sinRol);
    sinRol.comp.tipoSel.set(8);
    sinRol.comp.nota = 'acta';
    sinRol.comp.codigo = 'OF1-0004';
    sinRol.comp.escanear();
    sinRol.http.expectNone(`${BASE}/par/OF1-0004/avanzar`);
    expect(sinRol.comp.resultado()?.detalle).toBe('Una baja la autoriza el gerente: falta su usuario y clave');
    TestBed.resetTestingModule();

    const gerente = enBodega('GERENTE');
    abrirPanel(gerente);
    gerente.comp.tipoSel.set(8);
    gerente.comp.codigo = 'OF1-0004';
    gerente.comp.escanear();
    gerente.http.expectNone(`${BASE}/par/OF1-0004/avanzar`);
    expect(gerente.comp.resultado()?.detalle).toBe('La baja necesita una nota: es el acta');

    gerente.comp.nota = ' El robot rasgó la capellada ';
    gerente.comp.codigo = 'OF1-0004';
    gerente.comp.escanear();
    const req = gerente.http.expectOne(`${BASE}/par/OF1-0004/avanzar`);
    expect(sinSello(req.request.body)).toEqual({ operarioId: 4, estacion: 'BODEGA_CORTE', tipoDanoId: 8, descripcion: 'El robot rasgó la capellada' });
    req.flush({
      id: 1, codigo: 'OF1-0004', celulaActual: 'ALMACEN', estado: 'DADO_DE_BAJA',
      avance: {
        estacion: 'MONTAJE', nombre: 'Dado de baja', terminado: false, hoy: 3, calidad: 'PRIMERA',
        incidencia: { tipoDano: { codigo: 'DANO-ROBOT', nombre: 'Daño de robot en capellada', clase: 'BAJA' } },
        parReposicion: { codigo: 'OF1-0004-R1', celulaActual: 'GUARNICION' },
      },
    });
    gerente.fixture.detectChanges();
    const texto = (gerente.fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('OF1-0004 dado de baja');
    expect(texto).toContain('lo repone OF1-0004-R1');
    // La reposición nace en Preparación sin etiqueta: se ofrece imprimirla desde acá.
    expect(texto).toContain('Imprimir etiqueta de la lengua de OF1-0004-R1');
    expect(gerente.comp.modoCalidad()).toBeFalse();
  });

  it('en PT el botón es la inspección y una segunda terminada dice que va a saldos', () => {
    guardarConfig({ estacion: 'PT', operarioId: 6 });
    const ctx = crear('CALIDAD');
    ctx.http.expectOne(`${BASE}/operarios?celula=PT`).flush([{ id: 6, nombre: 'Rosa', celula: 'PT' }]);
    ctx.http.expectOne(`${BASE}/maquinas?celula=PT`).flush([]);
    ctx.http.expectOne(`${BASE}/hoy`).flush({ fecha: '2026-09-11', actualizado: '', estaciones: [] });
    ctx.fixture.detectChanges();
    const texto = () => (ctx.fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto()).toContain('No aprobó la inspección');

    abrirPanel(ctx);
    expect(texto()).toContain('No aprobó: ¿qué tiene el par?');
    ctx.comp.tipoSel.set(11);
    ctx.comp.codigo = 'OF1-0009';
    ctx.comp.escanear();
    ctx.http.expectOne(`${BASE}/par/OF1-0009/avanzar`).flush({
      id: 9, codigo: 'OF1-0009', celulaActual: 'PT', estado: 'TERMINADO',
      avance: {
        estacion: 'PT', nombre: 'Producto terminado', terminado: true, hoy: 1, calidad: 'SEGUNDA',
        incidencia: { tipoDano: { codigo: 'REBABA-SUELA', nombre: 'Rebaba en la suela', clase: 'SEGUNDA' } },
        parReposicion: null,
      },
    });
    ctx.fixture.detectChanges();
    expect(ctx.comp.resultado()).toEqual(jasmine.objectContaining({
      titulo: 'OF1-0009 terminado · SEGUNDA', sticker: 'OF1-0009',
      detalle: 'Rebaba en la suela · Cargado a bodega como segunda: va a saldos',
    }));
  });
});

/**
 * Modo sin internet (2026-11-21): el pistolazo no para la producción. Sin señal (o
 * con el servidor lento) queda guardado en la tablet y se envía solo.
 */
describe('EstacionComponent: modo sin internet', () => {
  const sinRed = (req: { error: (e: ProgressEvent, o: object) => void }) =>
    req.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

  function limpiar() {
    localStorage.removeItem(CLAVE_CONFIG);
    localStorage.removeItem(CLAVE_PENDIENTES);
    localStorage.removeItem(CLAVE_RECHAZADOS);
    borrarRespaldos();
  }
  beforeEach(limpiar);
  afterEach(limpiar);

  function enBodega() {
    guardarConfig({ estacion: 'BODEGA_CORTE', operarioId: 4 });
    const ctx = crear();
    ctx.http.expectOne(`${BASE}/operarios?celula=ALMACEN`).flush([{ id: 4, nombre: 'Aldo', celula: 'ALMACEN' }]);
    ctx.http.expectOne(`${BASE}/maquinas?celula=ALMACEN`).flush([]);
    ctx.http.expectOne(`${BASE}/hoy`).flush({ fecha: '', actualizado: '', estaciones: [{ codigo: 'BODEGA_CORTE', nombre: 'Bodega de corte', celula: 'ALMACEN', hoy: 2, ultimaHora: 2, meta: 1206 }] });
    ctx.fixture.detectChanges();
    return { ...ctx, cola: TestBed.inject(OfflineScanQueueService) };
  }

  it('sin señal el pistolazo queda guardado, el operario sigue y la pantalla lo dice', () => {
    const { fixture, http, comp, cola } = enBodega();
    comp.codigo = 'of1-0004';
    comp.escanear();
    sinRed(http.expectOne(`${BASE}/par/OF1-0004/avanzar`));
    fixture.detectChanges();
    expect(comp.resultado()).toEqual(jasmine.objectContaining({ ok: true, titulo: 'OF1-0004 guardado ✓', detalle: 'Sin señal: se envía solo cuando vuelva (1 pendiente)' }));
    expect(comp.hoy()).toBe(3); // sube ya; el servidor lo corrige al sincronizar
    expect(comp.codigo).toBe('');
    expect(cola.pendientes().map((p) => p.codigo)).toEqual(['OF1-0004']);
    const texto = (fixture.nativeElement as HTMLElement).querySelector('.cola')?.textContent ?? '';
    expect(texto).toContain('Sin señal: 1 pistolazo guardado');
    expect(texto).toContain('se envían solos');

    // El mismo par otra vez en esta estación: se avisa, no se guarda dos veces.
    comp.codigo = 'OF1-0004';
    comp.escanear();
    http.expectNone(`${BASE}/par/OF1-0004/avanzar`);
    expect(comp.resultado()).toEqual(jasmine.objectContaining({ alerta: true, titulo: 'OF1-0004 ya estaba guardado' }));
    expect(cola.pendientes().length).toBe(1);
    http.verify();
  });

  it('internet lento: a los 2 s se guarda y dice que se envía en segundo plano', fakeAsync(() => {
    const { fixture, http, comp, cola } = enBodega();
    comp.codigo = 'OF1-0004';
    comp.escanear();
    http.expectOne(`${BASE}/par/OF1-0004/avanzar`);
    tick(ESPERA_SERVIDOR_MS);
    fixture.detectChanges();
    expect(comp.resultado()).toEqual(jasmine.objectContaining({ ok: true, detalle: 'Guardado, se envía en segundo plano (1 pendiente)' }));
    expect((fixture.nativeElement as HTMLElement).querySelector('.cola')?.textContent).toContain('se envían en segundo plano');

    // La cola lo manda sola; el servidor lo acepta y el contador queda con su número.
    tick(0);
    flushMicrotasks();
    http.expectOne(`${BASE}/par/OF1-0004/avanzar`).flush({ id: 1, codigo: 'OF1-0004', celulaActual: 'ALMACEN', estado: 'EN_PROCESO', avance: { estacion: 'BODEGA_CORTE', nombre: 'Bodega de corte', terminado: false, hoy: 9 } });
    flushMicrotasks();
    fixture.detectChanges();
    expect(cola.pendientes()).toEqual([]);
    expect(comp.hoy()).toBe(9);
    expect((fixture.nativeElement as HTMLElement).querySelector('.cola')).toBeNull();
    http.verify();
  }));

  it('un rechazo al sincronizar se ve en la lista, con su motivo, y se puede descartar', fakeAsync(() => {
    const { fixture, http, comp, cola } = enBodega();
    comp.codigo = 'OF1-0099';
    comp.escanear();
    sinRed(http.expectOne(`${BASE}/par/OF1-0099/avanzar`));
    void cola.sincronizar();
    flushMicrotasks();
    http.expectOne(`${BASE}/par/OF1-0099/avanzar`).flush({ message: 'Par OF1-0099 no existe' }, { status: 404, statusText: 'Not Found' });
    flushMicrotasks();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(comp.resultado()).toEqual(jasmine.objectContaining({ ok: false, titulo: 'OF1-0099 no quedó al sincronizar', detalle: 'Par OF1-0099 no existe' }));
    expect(el.querySelector('.rechazados')?.textContent).toContain('Pistolazos rechazados al sincronizar (1)');
    expect(el.querySelector('.rech-motivo')?.textContent).toContain('Par OF1-0099 no existe');
    expect(comp.hoy()).toBe(2); // el +1 local se devuelve
    (el.querySelector('.rech-fila button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.rechazados')).toBeNull();
    http.verify();
  }));

  it('una segunda sin señal no se guarda: necesita internet y lo dice', () => {
    const { fixture, http, comp } = enBodega();
    comp.abrirCalidad();
    http.expectOne(`${environment.apiUrl}/calidad/tipos-dano`).flush([{ id: 11, codigo: 'REBABA', nombre: 'Rebaba', celulaCausante: 'INYECCION', clase: 'SEGUNDA' }]);
    comp.tipoSel.set(11);
    comp.autUsuario = 'rosa';
    comp.autClave = 'secreta';
    comp.codigo = 'OF1-0004';
    comp.escanear();
    sinRed(http.expectOne(`${BASE}/par/OF1-0004/avanzar`));
    fixture.detectChanges();
    expect(comp.resultado()).toEqual(jasmine.objectContaining({ ok: false, detalle: jasmine.stringContaining('necesita internet') }));
    expect(localStorage.getItem(CLAVE_PENDIENTES)).toBeNull(); // la clave no queda en la tablet
    http.verify();
  });

  it('con pistolazos guardados, una segunda espera a que se envíen', () => {
    const { http, comp } = enBodega();
    comp.codigo = 'OF1-0004';
    comp.escanear();
    sinRed(http.expectOne(`${BASE}/par/OF1-0004/avanzar`));
    comp.abrirCalidad();
    http.expectOne(`${environment.apiUrl}/calidad/tipos-dano`).flush([{ id: 11, codigo: 'REBABA', nombre: 'Rebaba', celulaCausante: 'INYECCION', clase: 'SEGUNDA' }]);
    comp.tipoSel.set(11);
    comp.autUsuario = 'rosa';
    comp.autClave = 'secreta';
    comp.codigo = 'OF1-0005';
    comp.escanear();
    http.expectNone(`${BASE}/par/OF1-0005/avanzar`);
    expect(comp.resultado()).toEqual(jasmine.objectContaining({ ok: false, detalle: jasmine.stringContaining('1 pistolazos guardados sin enviar') }));
    http.verify();
  });

  it('nacer sin señal dice que necesita internet y ofrece las impresas por adelantado', () => {
    guardarConfig({ estacion: 'PREPARACION', operarioId: 2 });
    const { fixture, http, comp } = crear();
    http.expectOne(`${BASE}/operarios?celula=GUARNICION`).flush([]);
    http.expectOne(`${BASE}/maquinas?celula=GUARNICION`).flush([]);
    http.expectOne(`${BASE}/hoy`).flush({ fecha: '', actualizado: '', estaciones: [] });
    http.expectOne(`${BASE}/of`).flush([]);
    const linea = { productoConfiguradoId: 1, producto: 'Bota', productoCodigo: 'PC', tallaId: 3, talla: '40', programado: 10, nacidos: 0, terminados: 0 };
    comp.nacer({ id: 16 } as any, linea as any);
    sinRed(http.expectOne(`${BASE}/of/16/nacer`));
    fixture.detectChanges();
    expect(comp.resultado()).toEqual(jasmine.objectContaining({ ok: false, titulo: 'No nacieron', detalle: jasmine.stringContaining('nacer pares necesita internet') }));
    http.verify();
  });

  it('si la tablet arranca sin señal, usa lo último guardado de estaciones, operarios y máquinas', () => {
    // Primera vez, con red: queda el respaldo.
    guardarConfig({ estacion: 'BODEGA_CORTE', operarioId: 4 });
    const a = crear();
    a.http.expectOne(`${BASE}/operarios?celula=ALMACEN`).flush([{ id: 4, nombre: 'Aldo', celula: 'ALMACEN' }]);
    a.http.expectOne(`${BASE}/maquinas?celula=ALMACEN`).flush([{ id: 9, nombre: 'Robot 1', celula: 'ALMACEN' }]);
    a.http.expectOne(`${BASE}/hoy`).flush({ fecha: '', actualizado: '', estaciones: [] });
    a.fixture.destroy();
    TestBed.resetTestingModule();

    // Recarga sin señal.
    TestBed.configureTestingModule({
      imports: [EstacionComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AuthService, useValue: { rol: () => null } }],
    });
    const fixture = TestBed.createComponent(EstacionComponent);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    sinRed(http.expectOne(`${BASE}/estaciones`));
    sinRed(http.expectOne(`${BASE}/operarios?celula=ALMACEN`));
    sinRed(http.expectOne(`${BASE}/maquinas?celula=ALMACEN`));
    sinRed(http.expectOne(`${BASE}/hoy`));
    fixture.detectChanges();
    const comp = fixture.componentInstance;
    expect(comp.config()).toEqual({ estacion: 'BODEGA_CORTE', operarioId: 4 });
    expect(comp.estacionActual()?.nombre).toBe('Bodega de corte');
    expect(comp.operarioNombre()).toBe('Aldo');
    expect(comp.maquinas().map((m) => m.nombre)).toEqual(['Robot 1']);
    expect(comp.configurando()).toBeFalse();
    http.verify();
  });
});
