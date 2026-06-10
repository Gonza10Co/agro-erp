import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { DashboardIndicadoresComponent } from './dashboard-indicadores.component';

describe('DashboardIndicadoresComponent', () => {
  let http: HttpTestingController;
  const base = 'http://localhost:3001';

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DashboardIndicadoresComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function crear() {
    const fixture = TestBed.createComponent(DashboardIndicadoresComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renderiza etapas, operarios, máquinas y alertas', () => {
    const fixture = crear();
    http.expectOne(`${base}/indicadores`).flush({
      etapas: [{ celula: 'GUARNICION', subPaso: 'STROBEL', tramos: 3, promedioMin: 12 }],
      operarios: [{ operarioId: 1, nombre: 'Gloria', tramos: 5, promedioMin: 10 }],
      maquinas: [{ maquinaId: 1, nombre: 'Plana', tramos: 5, promedioMin: 10 }],
      alertas: [{ codigo: 'OF9006-0004', celula: 'GUARNICION', subPaso: 'STROBEL', minutosEnEtapa: 181, umbralMin: 30 }],
    });
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Strobel');
    expect(el.textContent).toContain('Gloria');
    expect(el.textContent).toContain('Plana');
    expect(el.textContent).toContain('OF9006-0004');
    expect(el.textContent).toContain('181');
  });

  it('muestra estado vacío de alertas cuando no hay', () => {
    const fixture = crear();
    http.expectOne(`${base}/indicadores`).flush({ etapas: [], operarios: [], maquinas: [], alertas: [] });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Sin alertas');
  });

  it('muestra el error si el endpoint falla', () => {
    const fixture = crear();
    http.expectOne(`${base}/indicadores`).flush('x', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No se pudieron cargar');
  });
});
