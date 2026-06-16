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
    guarnicion: { meta: 60, real: 44, pct: 73.3 },
    inyeccion: { meta: 60, real: 43, pct: 71.7 },
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
    return fixture;
  }
  afterEach(() => http.verify());

  function flush() {
    http.expectOne((r) => r.url === 'http://localhost:3001/reportes/diario').flush(REPORTE);
  }

  it('carga el reporte y arma las tarjetas de metas', () => {
    const fixture = setup();
    flush();
    const c = fixture.componentInstance;
    expect(c.r()?.acumulado.troquelado).toBe(4);
    expect(c.metasCards().length).toBe(4);
    expect(c.metasCards()[0].pct).toBe(73.3);
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

  it('guardar metas hace PUT y recarga', () => {
    const fixture = setup();
    flush();
    const c = fixture.componentInstance;
    c.abrirMetas();
    expect(c.fGuarn).toBe(60);
    c.fGuarn = 100;
    c.guardar();
    const put = http.expectOne((r) => r.url === 'http://localhost:3001/reportes/metas');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body.items[0]).toEqual({ tipo: 'GUARNICION', valor: 100 });
    put.flush([]);
    expect(c.drawer()).toBe(false);
    flush(); // recarga tras guardar
  });
});
