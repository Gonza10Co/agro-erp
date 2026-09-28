import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { MaterialesListComponent } from './materiales-list.component';

describe('MaterialesListComponent', () => {
  let http: HttpTestingController;

  function setup() {
    TestBed.configureTestingModule({
      imports: [MaterialesListComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(MaterialesListComponent);
    http = TestBed.inject(HttpTestingController);
    // Opciones del formulario: se piden al abrir la pantalla.
    http.expectOne('http://localhost:3001/catalog/materiales/categorias').flush([{ id: 5, nombre: 'FINIZAJE' }]);
    http.expectOne('http://localhost:3001/catalog/materiales/unidades').flush([{ id: 2, codigo: 'PAR', nombre: 'Par' }]);
    return fixture;
  }

  afterEach(() => http.verify());

  it('el formulario ofrece categorías y unidades por nombre, no ids a mano', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('http://localhost:3001/catalog/materiales').flush([]);
    fixture.componentInstance.abrir();
    fixture.detectChanges();
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('FINIZAJE');
    expect(texto).toContain('PAR · Par');
    expect(texto).not.toContain('(id)');
  });

  it('carga la lista de materiales al iniciar (GET)', () => {
    const fixture = setup();
    fixture.detectChanges();
    const req = http.expectOne('http://localhost:3001/catalog/materiales');
    expect(req.request.method).toBe('GET');
    req.flush([
      { id: 1, codigo: 'M-1', nombreCanonico: 'Cuero', origen: 'COMPRADO', unidad: 'm2' },
    ]);
    expect(fixture.componentInstance.materiales().length).toBe(1);
    expect(fixture.componentInstance.cargando()).toBe(false);
  });

  it('crear envía POST /catalog/materiales y recarga la lista', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('http://localhost:3001/catalog/materiales').flush([]);

    const cmp = fixture.componentInstance;
    cmp.abrir();
    cmp.codigo = 'M-2';
    cmp.nombreCanonico = 'Suela TPU';
    cmp.categoriaId = 3;
    cmp.unidadMedidaId = 5;
    cmp.origen = 'FABRICADO';
    cmp.claseBom = 'DIRECTO_FIJO';
    cmp.guardar();

    const post = http.expectOne((r) => r.method === 'POST' && r.url === 'http://localhost:3001/catalog/materiales');
    expect(post.request.body).toEqual({
      codigo: 'M-2', nombreCanonico: 'Suela TPU', categoriaId: 3, unidadMedidaId: 5,
      origen: 'FABRICADO', claseBom: 'DIRECTO_FIJO',
    });
    post.flush({ id: 2 });

    // recarga
    http.expectOne('http://localhost:3001/catalog/materiales').flush([]);
    expect(cmp.drawerAbierto()).toBe(false);
  });

  // ── Confirmación en línea + reactivar (caso real: se desactivó la ref. 101 con un clic sin querer) ──
  describe('desactivar con confirmación y reactivar', () => {
    const listUrl = 'http://localhost:3001/catalog/materiales';
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
      const fixture = iniciar([{ id: 1, codigo: 'MAT-1', nombreCanonico: 'Cuero', origen: 'COMPRADO', unidad: 'M2', activo: true }]);
      btn(fixture, 'pedir').click();
      fixture.detectChanges();
      http.expectNone((r) => r.method === 'PATCH');
      expect(el(fixture).textContent).toContain('¿Desactivar MAT-1?');
      expect(btn(fixture, 'confirmar').textContent).toContain('Sí, desactivar');
    });

    it('Cancelar cierra la confirmación sin llamar al backend', () => {
      const fixture = iniciar([{ id: 1, codigo: 'MAT-1', nombreCanonico: 'Cuero', origen: 'COMPRADO', unidad: 'M2', activo: true }]);
      btn(fixture, 'pedir').click();
      fixture.detectChanges();
      btn(fixture, 'cancelar').click();
      fixture.detectChanges();
      http.expectNone((r) => r.method === 'PATCH');
      expect(btn(fixture, 'confirmar')).toBeNull();
      expect(btn(fixture, 'pedir')).not.toBeNull();
    });

    it('"Sí, desactivar" hace el PATCH de desactivar y recarga', () => {
      const fixture = iniciar([{ id: 1, codigo: 'MAT-1', nombreCanonico: 'Cuero', origen: 'COMPRADO', unidad: 'M2', activo: true }]);
      btn(fixture, 'pedir').click();
      fixture.detectChanges();
      btn(fixture, 'confirmar').click();
      const req = http.expectOne('http://localhost:3001/catalog/materiales/1/desactivar');
      expect(req.request.method).toBe('PATCH');
      req.flush({});
      http.expectOne(listUrl).flush([]);
    });

    it('"Mostrar inactiv…" pide ?incluirInactivas=true y Reactivar hace el PATCH (sin confirmación)', () => {
      const fixture = iniciar([{ id: 1, codigo: 'MAT-1', nombreCanonico: 'Cuero', origen: 'COMPRADO', unidad: 'M2', activo: true }]);
      const casilla = el(fixture).querySelector<HTMLInputElement>('label.check input[type=checkbox]')!;
      casilla.click();
      const req = http.expectOne(listUrl + '?incluirInactivas=true');
      expect(req.request.method).toBe('GET');
      req.flush([{ id: 1, codigo: 'MAT-1', nombreCanonico: 'Cuero', origen: 'COMPRADO', unidad: 'M2', activo: true }, { id: 2, codigo: 'MAT-2', nombreCanonico: 'Hilo', origen: 'COMPRADO', unidad: 'M', activo: false }]);
      fixture.detectChanges();

      expect(el(fixture).querySelectorAll('tr.is-inactive, .badge-neutral').length).toBeGreaterThan(0);
      expect(el(fixture).textContent).toContain('Inactivo');
      const reactivar = Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('button'))
        .find((b) => b.textContent?.trim() === 'Reactivar')!;
      reactivar.click();
      const patch = http.expectOne('http://localhost:3001/catalog/materiales/2/reactivar');
      expect(patch.request.method).toBe('PATCH');
      patch.flush({});
      // Recarga respetando la casilla marcada.
      http.expectOne(listUrl + '?incluirInactivas=true').flush([]);
    });
  });
});
