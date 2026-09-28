import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { PiezasListComponent } from './piezas-list.component';

describe('PiezasListComponent', () => {
  let http: HttpTestingController;

  function setup() {
    TestBed.configureTestingModule({
      imports: [PiezasListComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.createComponent(PiezasListComponent);
  }

  afterEach(() => http.verify());

  it('carga las piezas al iniciar (GET, solo activas)', () => {
    const fixture = setup();
    fixture.detectChanges();
    const req = http.expectOne('http://localhost:3001/catalog/piezas');
    expect(req.request.method).toBe('GET');
    req.flush([{ id: 1, codigo: 'CAPELLADA', nombre: 'Capellada', orden: 1, activo: true }]);
    expect(fixture.componentInstance.piezas().length).toBe(1);
  });

  // ── Confirmación en línea + reactivar (caso real: se desactivó la ref. 101 con un clic sin querer) ──
  describe('desactivar con confirmación y reactivar', () => {
    const listUrl = 'http://localhost:3001/catalog/piezas';
    function iniciar(filas: unknown[]) {
      const fixture = setup();
      fixture.detectChanges();
      http.expectOne(listUrl).flush(filas);
      fixture.detectChanges();
      return fixture;
    }
    const el = (f: { nativeElement: HTMLElement }) => f.nativeElement as HTMLElement;
    const btn = (f: { nativeElement: HTMLElement }, accion: string) =>
      el(f).querySelector<HTMLButtonElement>(`button[data-accion="${accion}"]`)!;

    it('el primer clic en Desactivar NO llama al backend: solo muestra la confirmación', () => {
      const fixture = iniciar([{ id: 1, codigo: 'CAPELLADA', nombre: 'Capellada', orden: 1, activo: true }]);
      btn(fixture, 'pedir').click();
      fixture.detectChanges();
      http.expectNone((r) => r.method === 'PATCH');
      expect(el(fixture).textContent).toContain('¿Archivar Capellada?');
      expect(btn(fixture, 'confirmar').textContent).toContain('Sí, archivar');
    });

    it('Cancelar cierra la confirmación sin llamar al backend', () => {
      const fixture = iniciar([{ id: 1, codigo: 'CAPELLADA', nombre: 'Capellada', orden: 1, activo: true }]);
      btn(fixture, 'pedir').click();
      fixture.detectChanges();
      btn(fixture, 'cancelar').click();
      fixture.detectChanges();
      http.expectNone((r) => r.method === 'PATCH');
      expect(btn(fixture, 'confirmar')).toBeNull();
      expect(btn(fixture, 'pedir')).not.toBeNull();
    });

    it('"Sí, archivar" hace el PATCH de desactivar y recarga', () => {
      const fixture = iniciar([{ id: 1, codigo: 'CAPELLADA', nombre: 'Capellada', orden: 1, activo: true }]);
      btn(fixture, 'pedir').click();
      fixture.detectChanges();
      btn(fixture, 'confirmar').click();
      const req = http.expectOne('http://localhost:3001/catalog/piezas/1/desactivar');
      expect(req.request.method).toBe('PATCH');
      req.flush({});
      http.expectOne(listUrl).flush([]);
    });

    it('"Mostrar inactiv…" pide ?incluirInactivas=true y Reactivar hace el PATCH (sin confirmación)', () => {
      const fixture = iniciar([{ id: 1, codigo: 'CAPELLADA', nombre: 'Capellada', orden: 1, activo: true }]);
      const casilla = el(fixture).querySelector<HTMLInputElement>('label.check input[type=checkbox]')!;
      casilla.click();
      const req = http.expectOne(listUrl + '?incluirInactivas=true');
      expect(req.request.method).toBe('GET');
      req.flush([{ id: 1, codigo: 'CAPELLADA', nombre: 'Capellada', orden: 1, activo: true }, { id: 2, codigo: 'TALON', nombre: 'Talón', orden: 5, activo: false }]);
      fixture.detectChanges();

      expect(el(fixture).querySelectorAll('tr.is-inactive, .badge-neutral').length).toBeGreaterThan(0);
      expect(el(fixture).textContent).toContain('Archivada');
      const reactivar = Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('button'))
        .find((b) => b.textContent?.trim() === 'Reactivar')!;
      reactivar.click();
      const patch = http.expectOne('http://localhost:3001/catalog/piezas/2/reactivar');
      expect(patch.request.method).toBe('PATCH');
      patch.flush({});
      // Recarga respetando la casilla marcada.
      http.expectOne(listUrl + '?incluirInactivas=true').flush([]);
    });
  });
});
