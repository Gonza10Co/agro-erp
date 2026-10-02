import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ReferenciasListComponent } from './referencias-list.component';

describe('ReferenciasListComponent', () => {
  let http: HttpTestingController;
  const refsUrl = 'http://localhost:3001/catalog/referencias-abm';
  const tallasUrl = 'http://localhost:3001/catalog/tallas';

  function setup() {
    TestBed.configureTestingModule({
      imports: [ReferenciasListComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.createComponent(ReferenciasListComponent);
  }

  afterEach(() => http.verify());

  it('al iniciar hace GET referencias-abm y GET tallas (para el form)', () => {
    const fixture = setup();
    fixture.detectChanges();

    const reqRefs = http.expectOne(refsUrl);
    expect(reqRefs.request.method).toBe('GET');
    reqRefs.flush([{ id: 1, codigo: 'R1', nombreInterno: 'Bota', activo: true }]);

    const reqTallas = http.expectOne(tallasUrl);
    expect(reqTallas.request.method).toBe('GET');
    reqTallas.flush([{ id: 10, valor: 35, orden: 1 }, { id: 11, valor: 36, orden: 2 }]);

    expect(fixture.componentInstance.referencias().length).toBe(1);
    expect(fixture.componentInstance.tallas().length).toBe(2);
    expect(fixture.componentInstance.cargando()).toBe(false);
  });

  it('crear hace POST /catalog/referencias-abm con el dto y recarga', () => {
    const fixture = setup();
    fixture.detectChanges();

    http.expectOne(refsUrl).flush([]);
    http.expectOne(tallasUrl).flush([{ id: 10, valor: 35, orden: 1 }, { id: 11, valor: 36, orden: 2 }]);

    const cmp = fixture.componentInstance;
    cmp.codigo = 'R1';
    cmp.nombreInterno = 'Bota';
    cmp.tallaMinId = 10;
    cmp.tallaMaxId = 11;
    cmp.guardar();

    const reqPost = http.expectOne(refsUrl);
    expect(reqPost.request.method).toBe('POST');
    expect(reqPost.request.body).toEqual({ codigo: 'R1', nombreInterno: 'Bota', tallaMinId: 10, tallaMaxId: 11 });
    reqPost.flush({ id: 1 });

    // recarga tras crear
    const reqReload = http.expectOne(refsUrl);
    expect(reqReload.request.method).toBe('GET');
    reqReload.flush([]);

    expect(cmp.drawerAbierto()).toBe(false);
  });

  it('muestra las piezas por par del despiece, o un guion si la referencia no lo informa', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne(refsUrl).flush([
      { id: 1, codigo: '101', nombreInterno: 'PODEROSA', activo: true, piezasPorPar: 28 },
      { id: 2, codigo: '109', nombreInterno: 'NUEVA', activo: true, piezasPorPar: null },
    ]);
    http.expectOne(tallasUrl).flush([]);
    fixture.detectChanges();
    const celdas = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('td.num')).map((c) => c.textContent?.trim());
    expect(celdas).toEqual(['28', '—']);
  });

  it('el alta manda piezasPorPar solo cuando se diligenció', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne(refsUrl).flush([]);
    http.expectOne(tallasUrl).flush([{ id: 10, valor: 35, orden: 1 }, { id: 11, valor: 36, orden: 2 }]);
    const cmp = fixture.componentInstance;
    cmp.codigo = '107'; cmp.nombreInterno = 'Nueva'; cmp.tallaMinId = 10; cmp.tallaMaxId = 11; cmp.piezasPorPar = 28;
    cmp.guardar();
    const req = http.expectOne(refsUrl);
    expect(req.request.body.piezasPorPar).toBe(28);
    req.flush({ id: 3 });
    http.expectOne(refsUrl).flush([]);
  });

  it('abrir() y cerrar() controlan el drawer', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne(refsUrl).flush([]);
    http.expectOne(tallasUrl).flush([]);

    const cmp = fixture.componentInstance;
    expect(cmp.drawerAbierto()).toBe(false);
    cmp.abrir();
    expect(cmp.drawerAbierto()).toBe(true);
    cmp.cerrar();
    expect(cmp.drawerAbierto()).toBe(false);
  });

  // ── Confirmación en línea + reactivar (caso real: se desactivó la ref. 101 con un clic sin querer) ──
  describe('desactivar con confirmación y reactivar', () => {
    const listUrl = 'http://localhost:3001/catalog/referencias-abm';
    function iniciar(filas: unknown[]) {
      const fixture = setup();
      fixture.detectChanges();
      http.expectOne(listUrl).flush(filas);
      http.expectOne('http://localhost:3001/catalog/tallas').flush([]);
      fixture.detectChanges();
      return fixture;
    }
    const el = (f: { nativeElement: HTMLElement }) => f.nativeElement as HTMLElement;
    const btn = (f: { nativeElement: HTMLElement }, accion: string) =>
      el(f).querySelector<HTMLButtonElement>(`button[data-accion="${accion}"]`)!;

    it('el primer clic en Desactivar NO llama al backend: solo muestra la confirmación', () => {
      const fixture = iniciar([{ id: 1, codigo: '101', nombreInterno: 'PODEROSA', activo: true }]);
      btn(fixture, 'pedir').click();
      fixture.detectChanges();
      http.expectNone((r) => r.method === 'PATCH');
      expect(el(fixture).textContent).toContain('¿Desactivar 101?');
      expect(btn(fixture, 'confirmar').textContent).toContain('Sí, desactivar');
    });

    it('Cancelar cierra la confirmación sin llamar al backend', () => {
      const fixture = iniciar([{ id: 1, codigo: '101', nombreInterno: 'PODEROSA', activo: true }]);
      btn(fixture, 'pedir').click();
      fixture.detectChanges();
      btn(fixture, 'cancelar').click();
      fixture.detectChanges();
      http.expectNone((r) => r.method === 'PATCH');
      expect(btn(fixture, 'confirmar')).toBeNull();
      expect(btn(fixture, 'pedir')).not.toBeNull();
    });

    it('"Sí, desactivar" hace el PATCH de desactivar y recarga', () => {
      const fixture = iniciar([{ id: 1, codigo: '101', nombreInterno: 'PODEROSA', activo: true }]);
      btn(fixture, 'pedir').click();
      fixture.detectChanges();
      btn(fixture, 'confirmar').click();
      const req = http.expectOne('http://localhost:3001/catalog/referencias-abm/1/desactivar');
      expect(req.request.method).toBe('PATCH');
      req.flush({});
      http.expectOne(listUrl).flush([]);
    });

    it('"Mostrar inactiv…" pide ?incluirInactivas=true y Reactivar hace el PATCH (sin confirmación)', () => {
      const fixture = iniciar([{ id: 1, codigo: '101', nombreInterno: 'PODEROSA', activo: true }]);
      const casilla = el(fixture).querySelector<HTMLInputElement>('label.check input[type=checkbox]')!;
      casilla.click();
      const req = http.expectOne(listUrl + '?incluirInactivas=true');
      expect(req.request.method).toBe('GET');
      req.flush([{ id: 1, codigo: '101', nombreInterno: 'PODEROSA', activo: true }, { id: 2, codigo: '102', nombreInterno: 'VIEJA', activo: false }]);
      fixture.detectChanges();

      expect(el(fixture).querySelectorAll('tr.is-inactive, .badge-neutral').length).toBeGreaterThan(0);
      expect(el(fixture).textContent).toContain('Inactiva');
      const reactivar = Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('button'))
        .find((b) => b.textContent?.trim() === 'Reactivar')!;
      reactivar.click();
      const patch = http.expectOne('http://localhost:3001/catalog/referencias-abm/2/reactivar');
      expect(patch.request.method).toBe('PATCH');
      patch.flush({});
      // Recarga respetando la casilla marcada.
      http.expectOne(listUrl + '?incluirInactivas=true').flush([]);
    });
  });

  it('editar abre el cajón con los datos y guarda con PATCH (la 102 arranca en 33)', () => {
    const fixture = setup();
    fixture.detectChanges();
    const ref = { id: 3, codigo: '102', nombreInterno: 'ALPACA', activo: true, piezasPorPar: 24,
      tallaMinId: 11, tallaMaxId: 9, tallaMin: { valor: 34 }, tallaMax: { valor: 46 } };
    http.expectOne(refsUrl).flush([ref]);
    http.expectOne(tallasUrl).flush([{ id: 10, valor: 33, orden: 0 }, { id: 11, valor: 34, orden: 1 }, { id: 9, valor: 46, orden: 13 }]);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('34 a 46');

    const cmp = fixture.componentInstance;
    cmp.editar(ref);
    expect(cmp.drawerAbierto()).toBe(true);
    expect(cmp.codigo).toBe('102');
    cmp.tallaMinId = 10;
    cmp.guardar();

    const req = http.expectOne(`${refsUrl}/3`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ nombreInterno: 'ALPACA', tallaMinId: 10, tallaMaxId: 9, piezasPorPar: 24 });
    req.flush({ id: 3 });
    http.expectOne(refsUrl).flush([]);
    expect(cmp.drawerAbierto()).toBe(false);
    expect(cmp.editandoId()).toBeNull();
  });

  it('después de editar, "Nueva referencia" abre el cajón vacío', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne(refsUrl).flush([]);
    http.expectOne(tallasUrl).flush([]);
    const cmp = fixture.componentInstance;
    cmp.editar({ id: 3, codigo: '102', nombreInterno: 'ALPACA', activo: true, tallaMinId: 11, tallaMaxId: 9 });
    cmp.cerrar();
    cmp.abrir();
    expect(cmp.codigo).toBe('');
    expect(cmp.editandoId()).toBeNull();
  });
});
