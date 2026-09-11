import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DashboardComponent } from './dashboard.component';

const RESUMEN = {
  pedidos: { porEstado: { BORRADOR: 1, CONFIRMADA: 2, EN_PRODUCCION: 3, CERRADA: 4, ANULADA: 0 }, enCurso: 5 },
  produccion: {
    ofActivas: 2,
    paresEnProceso: 10,
    programado: 100,
    // Las mismas columnas del tablero: Corte es lo que falta por nacer.
    porEstacion: [
      { codigo: 'CORTE_PENDIENTE', nombre: 'Corte', pares: 90 },
      { codigo: 'PREPARACION', nombre: 'Preparación', pares: 6 },
      { codigo: 'BODEGA_CORTE', nombre: 'Bodega de corte', pares: 4 },
    ],
  },
  despachosMes: 3,
  facturacionMes: { total: 1000000, count: 2 },
  cartera: { saldoTotal: 800000, saldoVencido: 500000, clientesVencidos: 1 },
};

describe('DashboardComponent', () => {
  let http: HttpTestingController;
  function setup() {
    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(DashboardComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges(); // dispara ngOnInit → GET
    return fixture;
  }
  afterEach(() => http.verify());

  it('carga el resumen y mapea los pares por célula (orden fijo, faltantes en 0)', () => {
    const fixture = setup();
    http.expectOne('http://localhost:3001/dashboard').flush(RESUMEN);
    const c = fixture.componentInstance;
    expect(c.r()?.despachosMes).toBe(3);
    // El panel pinta lo que manda el backend, sin inventar columnas propias.
    expect(c.estaciones().map((x) => x.nombre)).toEqual(['Corte', 'Preparación', 'Bodega de corte']);
    expect(c.estaciones().map((x) => x.pares)).toEqual([90, 6, 4]);
    // La escala la marcan las estaciones de la línea (6), no Corte (90).
    expect(c.pct(6)).toBe(100);
    expect(c.pct(4)).toBe(67);
  });
});
