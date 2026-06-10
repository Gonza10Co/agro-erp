import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PantallaOperarioComponent } from './pantalla-operario.component';

const BASE = 'http://localhost:3001/fabricacion';

function setup() {
  TestBed.configureTestingModule({
    imports: [PantallaOperarioComponent],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(PantallaOperarioComponent);
  const http = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  http.expectOne(`${BASE}/operarios?celula=CORTE`).flush([{ id: 1, nombre: 'Pedro', celula: 'CORTE', activo: true }]);
  http.expectOne(`${BASE}/maquinas?celula=CORTE`).flush([{ id: 2, codigo: 'M1', nombre: 'Cortadora', celula: 'CORTE', activo: true }]);
  fixture.detectChanges();
  return { fixture, http };
}

describe('PantallaOperarioComponent', () => {
  it('busca un par y permite avanzarlo', () => {
    const { fixture, http } = setup();
    const comp = fixture.componentInstance;
    comp.codigo = 'OF5-0001';
    comp.buscar();
    http.expectOne(`${BASE}/par/OF5-0001`).flush({
      id: 9, codigo: 'OF5-0001', estado: 'EN_PROCESO', celulaActual: 'CORTE',
      of: { consecutivo: 5 }, talla: { valor: 38 }, eventos: [],
    });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('OF5-0001');

    comp.avanzar(comp.par()!);
    http.expectOne(`${BASE}/par/OF5-0001/avanzar`).flush({});
    fixture.detectChanges();
    expect(comp.msg()).toContain('avanzado');
    expect(comp.codigo).toBe('');
    http.verify();
  });

  it('ante corte de red muestra mensaje de conexión y conserva el código para reintentar', () => {
    const { fixture, http } = setup();
    const comp = fixture.componentInstance;
    comp.codigo = 'OF5-0001';
    comp.buscar();
    http.expectOne(`${BASE}/par/OF5-0001`).error(new ProgressEvent('error'), { status: 0 });
    expect(comp.esError()).toBeTrue();
    expect(comp.msg()).toContain('conexión');
    expect(comp.codigo).toBe('OF5-0001');
    http.verify();
  });

  it('si la API de catálogos falla, limpia operario/máquina y avisa', () => {
    TestBed.configureTestingModule({
      imports: [PantallaOperarioComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(PantallaOperarioComponent);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne(`${BASE}/operarios?celula=CORTE`).error(new ProgressEvent('error'), { status: 0 });
    http.expectOne(`${BASE}/maquinas?celula=CORTE`).error(new ProgressEvent('error'), { status: 0 });
    const comp = fixture.componentInstance;
    expect(comp.operarioId).toBeUndefined();
    expect(comp.maquinaId).toBeUndefined();
    expect(comp.esError()).toBeTrue();
    http.verify();
  });
});
