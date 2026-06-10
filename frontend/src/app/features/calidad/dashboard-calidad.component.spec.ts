import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DashboardCalidadComponent } from './dashboard-calidad.component';

describe('DashboardCalidadComponent', () => {
  let http: HttpTestingController;
  const base = 'http://localhost:3001';

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DashboardCalidadComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function crear() {
    const fixture = TestBed.createComponent(DashboardCalidadComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renderiza una tarjeta por centro de costo con sus conteos', () => {
    const fixture = crear();
    http.expectOne(`${base}/calidad/indicadores`).flush({
      centros: [
        { celula: 'CORTE', total: 0, bajas: 0, reprocesos: 0, paresProcesados: 0, pctDano: null },
        { celula: 'GUARNICION', total: 3, bajas: 1, reprocesos: 2, paresProcesados: 10, pctDano: 0.3 },
        { celula: 'ALMACEN', total: 0, bajas: 0, reprocesos: 0, paresProcesados: 0, pctDano: null },
        { celula: 'INYECCION', total: 1, bajas: 1, reprocesos: 0, paresProcesados: 4, pctDano: 0.25 },
      ],
      topDanos: [
        { codigo: 'STROBEL-RASGADO', nombre: 'Strobel rasgado', celulaCausante: 'GUARNICION', clase: 'REPROCESO', total: 2 },
      ],
    });
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Guarnición');
    expect(el.textContent).toContain('30');           // 30 % de daño
    expect(el.textContent).toContain('—');            // pctDano null
    expect(el.textContent).toContain('Strobel rasgado');
  });

  it('muestra el error si el endpoint falla', () => {
    const fixture = crear();
    http.expectOne(`${base}/calidad/indicadores`).flush('x', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No se pudieron cargar');
  });
});
