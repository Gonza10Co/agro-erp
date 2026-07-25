import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ReporteDiarioComponent } from './reporte-diario.component';

const REPORTE = {
  anio: 2026,
  mes: 6,
  filas: [
    { fecha: '2026-06-01', troquelado: 4, guarnicion: 4, almacen: 4, externo: 0, inyeccion: 4, bodega: 4, segundas: 0, paresVendidos: 0, valor: 0 },
    { fecha: '2026-06-02', troquelado: 0, guarnicion: 0, almacen: 0, externo: 0, inyeccion: 0, bodega: 0, segundas: 0, paresVendidos: 8, valor: 809200 },
  ],
  acumulado: { troquelado: 4, guarnicion: 4, almacen: 4, externo: 0, inyeccion: 4, bodega: 4, segundas: 0, paresVendidos: 8, valor: 809200 },
  metas: {
    celulas: [
      { celula: 'CORTE', meta: 70, real: 48, pct: 68.6 },
      { celula: 'GUARNICION', meta: 60, real: 44, pct: 73.3 },
      { celula: 'ALMACEN', meta: 0, real: 44, pct: 0 },
      { celula: 'INYECCION', meta: 60, real: 43, pct: 71.7 },
      { celula: 'PT', meta: 55, real: 43, pct: 78.2 },
    ],
    facturacionPares: { meta: 25, real: 19, pct: 76 },
    facturacionValor: { meta: 2400000, real: 1921850, pct: 80.1 },
  },
  kardexPT: [
    { fecha: '2026-06-01', saldoInicial: 500, ingreso: 4, venta: 0, devolucion: 0, saldoFinal: 504 },
    { fecha: '2026-06-02', saldoInicial: 504, ingreso: 0, venta: 8, devolucion: 0, saldoFinal: 496 },
    { fecha: '2026-06-03', saldoInicial: 496, ingreso: 0, venta: 0, devolucion: 0, saldoFinal: 496 },
  ],
  pendientes: ['EXTERNO', 'SEGUNDAS', 'SERVICIOS_MANTENIMIENTO'],
};

describe('ReporteDiarioComponent', () => {
  let http: HttpTestingController;
  function setup() {
    TestBed.configureTestingModule({
      imports: [ReporteDiarioComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(ReporteDiarioComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges(); // ngOnInit → GET
    // Selector de línea del header (solo llegan las activas).
    http.expectOne('http://localhost:3001/catalog/lineas').flush([
      { id: 1, codigo: 'BASARILI', nombre: 'Basarili', celulaInicial: 'CORTE', activo: true },
      { id: 4, codigo: 'FEROZ', nombre: 'Feroz', celulaInicial: 'INYECCION', activo: true },
    ]);
    return fixture;
  }
  afterEach(() => http.verify());

  function flush() {
    http.expectOne((r) => r.url === 'http://localhost:3001/reportes/diario').flush(REPORTE);
  }

  it('carga el reporte y arma una tarjeta por célula + las 2 de facturación', () => {
    const fixture = setup();
    flush();
    const c = fixture.componentInstance;
    expect(c.r()?.acumulado.troquelado).toBe(4);
    expect(c.metasCards().length).toBe(7);
    // En orden de flujo de planta, con la facturación al final.
    expect(c.metasCards().map((m) => m.key)).toEqual([
      'CORTE', 'GUARNICION', 'ALMACEN', 'INYECCION', 'PT',
      'FACTURACION_PARES', 'FACTURACION_VALOR',
    ]);
    expect(c.metasCards()[0].label).toBe('Corte');
    expect(c.metasCards()[0].pct).toBe(68.6);
    // La de valor formatea en pesos; las de pares, con separador de miles.
    expect(c.metasCards()[6].fmt(2400000)).toBe('$2.400.000');
  });

  it('pinta las 7 tarjetas en la pantalla', () => {
    const fixture = setup();
    flush();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.meta-card').length).toBe(7);
    expect(el.textContent).toContain('Almacén');
    expect(el.textContent).toContain('P. Terminado');
  });

  it('el kardex solo muestra días con movimiento', () => {
    const fixture = setup();
    flush();
    const c = fixture.componentInstance;
    expect(c.kardexConMov().length).toBe(2); // el día 3 (sin movimiento) se excluye
  });

  it('detecta filas sin actividad', () => {
    const fixture = setup();
    flush();
    const c = fixture.componentInstance;
    expect(c.sinActividad(REPORTE.filas[0])).toBe(false);
    const vacia = { troquelado: 0, inyeccion: 0, bodega: 0, paresVendidos: 0 };
    expect(c.sinActividad(vacia)).toBe(true);
  });

  it('cambiar de mes recarga el reporte con el nuevo periodo', () => {
    const fixture = setup();
    flush();
    const c = fixture.componentInstance;
    c.cambiarMes({ target: { value: '2026-05' } } as unknown as Event);
    expect(c.anio()).toBe(2026);
    expect(c.mes()).toBe(5);
    http.expectOne((r) => r.url === 'http://localhost:3001/reportes/diario' && r.params.get('mes') === '5').flush(REPORTE);
  });

  it('filtrar por línea recarga con ?lineaId y muestra el kardex de esa línea', () => {
    const fixture = setup();
    flush();
    const c = fixture.componentInstance;
    c.cambiarLinea(4);
    http
      .expectOne((r) => r.url === 'http://localhost:3001/reportes/diario' && r.params.get('lineaId') === '4')
      .flush({ ...REPORTE, lineaId: 4 });
    fixture.detectChanges();
    expect(c.lineaSel()).toBe(4);
    // El kardex ya se segmenta por línea: la tabla se muestra igual que sin filtro.
    expect(c.kardexConMov().length).toBe(2);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('históricos sin línea');
  });

  it('con línea filtrada y sin movimientos avisa que los históricos suman solo en Todas', () => {
    const fixture = setup();
    flush();
    const c = fixture.componentInstance;
    c.cambiarLinea(4);
    http
      .expectOne((r) => r.url === 'http://localhost:3001/reportes/diario' && r.params.get('lineaId') === '4')
      .flush({ ...REPORTE, kardexPT: [], lineaId: 4 });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('históricos sin línea');
  });

  it('con línea filtrada las metas se guardan para esa línea', () => {
    const fixture = setup();
    flush();
    const c = fixture.componentInstance;
    c.cambiarLinea(4);
    http.expectOne((r) => r.url === 'http://localhost:3001/reportes/diario').flush({ ...REPORTE, lineaId: 4 });
    c.abrirMetas();
    c.guardar();
    const put = http.expectOne(
      (r) => r.url === 'http://localhost:3001/reportes/metas' && r.params.get('lineaId') === '4',
    );
    put.flush([]);
    http.expectOne((r) => r.url === 'http://localhost:3001/reportes/diario').flush({ ...REPORTE, lineaId: 4 }); // recarga
  });

  it('guardar metas hace PUT y recarga', () => {
    const fixture = setup();
    flush();
    const c = fixture.componentInstance;
    c.abrirMetas();
    // El drawer se precarga con las metas vigentes de las 7, células incluidas.
    expect(c.form.GUARNICION).toBe(60);
    expect(c.form.CORTE).toBe(70);
    expect(c.form.ALMACEN).toBe(0);
    c.form.GUARNICION = 100;
    c.form.ALMACEN = 80;
    c.guardar();
    const put = http.expectOne((r) => r.url === 'http://localhost:3001/reportes/metas');
    expect(put.request.method).toBe('PUT');
    // Se mandan las 7 en orden de flujo; el backend hace upsert de cada una.
    expect(put.request.body.items.length).toBe(7);
    expect(put.request.body.items[0]).toEqual({ tipo: 'CORTE', valor: 70 });
    expect(put.request.body.items[1]).toEqual({ tipo: 'GUARNICION', valor: 100 });
    expect(put.request.body.items[2]).toEqual({ tipo: 'ALMACEN', valor: 80 });
    put.flush([]);
    expect(c.drawer()).toBe(false);
    flush(); // recarga tras guardar
  });
});
