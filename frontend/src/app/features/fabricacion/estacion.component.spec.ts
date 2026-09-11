import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EstacionComponent, CLAVE_CONFIG, guardarConfig, leerConfig } from './estacion.component';
import { AuthService } from '../../core/auth/auth.service';
import { environment } from '../../../environments/environment';

const BASE = `${environment.apiUrl}/fabricacion`;
const ESTACIONES = [
  { codigo: 'PREPARACION', nombre: 'Preparación', orden: 1, celula: 'GUARNICION', subPaso: 'PREPARACION', subPasoInyeccion: null, activa: true },
  { codigo: 'CIERRE', nombre: 'Cierre', orden: 2, celula: 'GUARNICION', subPaso: 'CIERRE', subPasoInyeccion: null, activa: false },
  { codigo: 'BODEGA_CORTE', nombre: 'Bodega de corte', orden: 3, celula: 'ALMACEN', subPaso: null, subPasoInyeccion: null, activa: true },
  { codigo: 'PT', nombre: 'Producto terminado', orden: 6, celula: 'PT', subPaso: null, subPasoInyeccion: null, activa: true },
];

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
    expect(req.request.body).toEqual({ operarioId: 4, estacion: 'BODEGA_CORTE' });
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
    expect(req.request.body).toEqual({ operarioId: 4, estacion: 'BODEGA_CORTE', tipoDanoId: 11 });
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
    expect(req.request.body).toEqual({
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
    expect(req.request.body).toEqual({ operarioId: 4, estacion: 'BODEGA_CORTE', tipoDanoId: 8, descripcion: 'El robot rasgó la capellada' });
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
