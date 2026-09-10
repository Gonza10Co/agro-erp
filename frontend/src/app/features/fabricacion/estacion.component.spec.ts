import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EstacionComponent, CLAVE_CONFIG, guardarConfig, leerConfig } from './estacion.component';
import { environment } from '../../../environments/environment';

const BASE = `${environment.apiUrl}/fabricacion`;
const ESTACIONES = [
  { codigo: 'PREPARACION', nombre: 'Preparación', orden: 1, celula: 'GUARNICION', subPaso: 'PREPARACION', subPasoInyeccion: null, activa: true },
  { codigo: 'CIERRE', nombre: 'Cierre', orden: 2, celula: 'GUARNICION', subPaso: 'CIERRE', subPasoInyeccion: null, activa: false },
  { codigo: 'BODEGA_CORTE', nombre: 'Bodega de corte', orden: 3, celula: 'ALMACEN', subPaso: null, subPasoInyeccion: null, activa: true },
  { codigo: 'PT', nombre: 'Producto terminado', orden: 6, celula: 'PT', subPaso: null, subPasoInyeccion: null, activa: true },
];

function crear() {
  TestBed.configureTestingModule({
    imports: [EstacionComponent],
    providers: [provideHttpClient(), provideHttpClientTesting()],
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
