import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { GruposOpcionListComponent } from './grupos-opcion-list.component';

describe('GruposOpcionListComponent', () => {
  let http: HttpTestingController;

  function setup() {
    TestBed.configureTestingModule({
      imports: [GruposOpcionListComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.createComponent(GruposOpcionListComponent);
  }

  afterEach(() => http.verify());

  it('carga la lista de grupos al iniciar (GET)', () => {
    const fixture = setup();
    fixture.detectChanges();
    const req = http.expectOne('http://localhost:3001/catalog/grupos-opcion');
    expect(req.request.method).toBe('GET');
    req.flush([
      { id: 1, codigo: 'COLOR', nombre: 'Color', obligatorio: true, orden: 1, opciones: [{ id: 9, codigo: 'NEG', nombre: 'Negro', activo: true }] },
    ]);
    expect(fixture.componentInstance.grupos().length).toBe(1);
    expect(fixture.componentInstance.cargando()).toBe(false);
  });

  it('crearGrupo hace POST y recarga la lista', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('http://localhost:3001/catalog/grupos-opcion').flush([]);

    const cmp = fixture.componentInstance;
    cmp.codigo = 'COLOR';
    cmp.nombre = 'Color';
    cmp.obligatorio = true;
    cmp.orden = 2;
    cmp.crearGrupo();

    const post = http.expectOne((r) => r.method === 'POST' && r.url === 'http://localhost:3001/catalog/grupos-opcion');
    expect(post.request.body).toEqual({ codigo: 'COLOR', nombre: 'Color', obligatorio: true, orden: 2 });
    post.flush({ id: 1, codigo: 'COLOR', nombre: 'Color', obligatorio: true, orden: 2, opciones: [] });

    // recarga
    http.expectOne('http://localhost:3001/catalog/grupos-opcion').flush([]);
    expect(cmp.drawerAbierto()).toBe(false);
  });

  // ── Confirmación en línea + reactivar (caso real: se desactivó la ref. 101 con un clic sin querer) ──
  describe('desactivar con confirmación y reactivar', () => {
    const listUrl = 'http://localhost:3001/catalog/grupos-opcion';
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
      const fixture = iniciar([{ id: 1, codigo: 'COLOR', nombre: 'Color', obligatorio: true, orden: 1, opciones: [{ id: 10, codigo: 'NEGRO', nombre: 'Negro', activo: true }] }]);
      btn(fixture, 'pedir').click();
      fixture.detectChanges();
      http.expectNone((r) => r.method === 'PATCH');
      expect(el(fixture).textContent).toContain('¿Desactivar Negro?');
      expect(btn(fixture, 'confirmar').textContent).toContain('Sí, desactivar');
    });

    it('Cancelar cierra la confirmación sin llamar al backend', () => {
      const fixture = iniciar([{ id: 1, codigo: 'COLOR', nombre: 'Color', obligatorio: true, orden: 1, opciones: [{ id: 10, codigo: 'NEGRO', nombre: 'Negro', activo: true }] }]);
      btn(fixture, 'pedir').click();
      fixture.detectChanges();
      btn(fixture, 'cancelar').click();
      fixture.detectChanges();
      http.expectNone((r) => r.method === 'PATCH');
      expect(btn(fixture, 'confirmar')).toBeNull();
      expect(btn(fixture, 'pedir')).not.toBeNull();
    });

    it('"Sí, desactivar" hace el PATCH de desactivar y recarga', () => {
      const fixture = iniciar([{ id: 1, codigo: 'COLOR', nombre: 'Color', obligatorio: true, orden: 1, opciones: [{ id: 10, codigo: 'NEGRO', nombre: 'Negro', activo: true }] }]);
      btn(fixture, 'pedir').click();
      fixture.detectChanges();
      btn(fixture, 'confirmar').click();
      const req = http.expectOne('http://localhost:3001/catalog/grupos-opcion/opciones/10/desactivar');
      expect(req.request.method).toBe('PATCH');
      req.flush({});
      http.expectOne(listUrl).flush([]);
    });

    it('"Mostrar inactiv…" pide ?incluirInactivas=true y Reactivar hace el PATCH (sin confirmación)', () => {
      const fixture = iniciar([{ id: 1, codigo: 'COLOR', nombre: 'Color', obligatorio: true, orden: 1, opciones: [{ id: 10, codigo: 'NEGRO', nombre: 'Negro', activo: true }] }]);
      const casilla = el(fixture).querySelector<HTMLInputElement>('label.check input[type=checkbox]')!;
      casilla.click();
      const req = http.expectOne(listUrl + '?incluirInactivas=true');
      expect(req.request.method).toBe('GET');
      req.flush([{ id: 1, codigo: 'COLOR', nombre: 'Color', obligatorio: true, orden: 1, opciones: [{ id: 10, codigo: 'NEGRO', nombre: 'Negro', activo: true }] }, { id: 2, codigo: 'CUELLO', nombre: 'Cuello', obligatorio: false, orden: 2, opciones: [{ id: 20, codigo: 'ALTO', nombre: 'Alto', activo: false }] }]);
      fixture.detectChanges();

      expect(el(fixture).querySelectorAll('tr.is-inactive, .badge-neutral').length).toBeGreaterThan(0);
      expect(el(fixture).textContent).toContain('(inactiva)');
      const reactivar = Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('button'))
        .find((b) => b.textContent?.trim() === 'Reactivar')!;
      reactivar.click();
      const patch = http.expectOne('http://localhost:3001/catalog/grupos-opcion/opciones/20/reactivar');
      expect(patch.request.method).toBe('PATCH');
      patch.flush({});
      // Recarga respetando la casilla marcada.
      http.expectOne(listUrl + '?incluirInactivas=true').flush([]);
    });
  });
});
