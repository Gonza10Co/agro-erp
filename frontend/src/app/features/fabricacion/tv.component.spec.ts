import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TvPlantaComponent, pctMeta } from './tv.component';
import { environment } from '../../../environments/environment';

const BASE = `${environment.apiUrl}/fabricacion`;

describe('pctMeta', () => {
  it('porcentaje sobre la meta, con tope en 100 y 0 sin meta', () => {
    expect(pctMeta(603, 1206)).toBe(50);
    expect(pctMeta(1300, 1206)).toBe(100);
    expect(pctMeta(5, 0)).toBe(0);
  });
});

describe('TvPlantaComponent', () => {
  it('pinta un número gigante por estación activa contra la meta del día', () => {
    TestBed.configureTestingModule({
      imports: [TvPlantaComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(TvPlantaComponent);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne(`${BASE}/hoy`).flush({
      fecha: '2026-09-09',
      actualizado: '2026-09-09T17:38:00Z',
      estaciones: [
        { codigo: 'PREPARACION', nombre: 'Preparación', celula: 'GUARNICION', hoy: 603, ultimaHora: 136, meta: 1206 },
        { codigo: 'PT', nombre: 'Producto terminado', celula: 'PT', hoy: 1206, ultimaHora: 5, meta: 1206 },
      ],
    });
    fixture.detectChanges();
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('PREPARACIÓN'.length ? 'Preparación' : '');
    expect(texto).toContain('603');
    expect(texto).toContain('50%');
    // La estación que ya cumplió se marca aparte.
    expect(fixture.nativeElement.querySelectorAll('.tarjeta.cumplida').length).toBe(1);
    http.verify();
  });

  it('si el servidor no responde conserva lo último y lo avisa', () => {
    TestBed.configureTestingModule({
      imports: [TvPlantaComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(TvPlantaComponent);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne(`${BASE}/hoy`).error(new ProgressEvent('error'), { status: 0 });
    fixture.detectChanges();
    expect(fixture.componentInstance.error()).toBeTrue();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('sin conexión');
    http.verify();
  });
});
