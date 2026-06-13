import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DashboardComponent } from './dashboard.component';

const RESUMEN = {
  pedidos: { porEstado: { BORRADOR: 1, CONFIRMADA: 2, EN_PRODUCCION: 3, CERRADA: 4, ANULADA: 0 }, enCurso: 5 },
  produccion: { ofActivas: 2, paresEnProceso: 10, porCelula: [{ celula: 'CORTE', pares: 4 }, { celula: 'GUARNICION', pares: 6 }] },
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
    expect(c.celulas().map((x) => x.pares)).toEqual([4, 6, 0, 0, 0]); // CORTE, GUARNICION, ALMACEN, INYECCION, PT
    expect(c.pct(6)).toBe(100); // 6 es el máximo
    expect(c.pct(4)).toBe(67);
  });
});
