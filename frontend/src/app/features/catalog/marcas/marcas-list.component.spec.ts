import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { MarcasListComponent } from './marcas-list.component';
import { Material } from '../../../core/api/materiales.api';

describe('MarcasListComponent', () => {
  let http: HttpTestingController;

  function setup() {
    TestBed.configureTestingModule({
      imports: [MarcasListComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.createComponent(MarcasListComponent);
  }

  afterEach(() => http.verify());

  it('carga la lista (GET) al iniciar', () => {
    const fixture = setup();
    fixture.detectChanges();
    const req = http.expectOne('http://localhost:3001/catalog/marcas');
    expect(req.request.method).toBe('GET');
    req.flush([
      { id: 1, codigo: 'BAS', nombre: 'Basarili', tipo: 'PROPIA', clienteId: null, activo: true },
    ]);
    // El constructor también carga las líneas para el dropdown.
    http.expectOne('http://localhost:3001/catalog/lineas').flush([]);
    expect(fixture.componentInstance.marcas().length).toBe(1);
    expect(fixture.componentInstance.cargando()).toBe(false);
  });

  it('crear hace POST y recarga la lista', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('http://localhost:3001/catalog/marcas').flush([]);
    http.expectOne('http://localhost:3001/catalog/lineas').flush([]);

    const cmp = fixture.componentInstance;
    cmp.abrirNueva();
    cmp.codigo = 'MQ1';
    cmp.nombre = 'Maquila Uno';
    cmp.tipo = 'MAQUILA';
    cmp.guardar();

    const post = http.expectOne('http://localhost:3001/catalog/marcas');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ codigo: 'MQ1', nombre: 'Maquila Uno', tipo: 'MAQUILA' });
    post.flush({ id: 2 });

    // recarga tras crear
    const reload = http.expectOne('http://localhost:3001/catalog/marcas');
    expect(reload.request.method).toBe('GET');
    reload.flush([]);
    expect(cmp.drawerAbierto()).toBe(false);
  });

  it('al asignar una línea el PATCH incluye lineaId', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('http://localhost:3001/catalog/marcas').flush([
      { id: 5, codigo: 'AGRO', nombre: 'Agro', tipo: 'PROPIA', lineaId: null, activo: true },
    ]);
    http.expectOne('http://localhost:3001/catalog/lineas').flush([
      { id: 2, codigo: 'AGRO', nombre: 'Agro', celulaInicial: 'CORTE', activo: true },
    ]);

    const cmp = fixture.componentInstance;
    cmp.abrirEditar({ id: 5, codigo: 'AGRO', nombre: 'Agro', tipo: 'PROPIA', lineaId: null, activo: true });
    cmp.lineaId = 2;
    cmp.guardar();

    const patch = http.expectOne('http://localhost:3001/catalog/marcas/5');
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ nombre: 'Agro', tipo: 'PROPIA', lineaId: 2 });
    patch.flush({ id: 5 });
    http.expectOne('http://localhost:3001/catalog/marcas').flush([]);
  });

  // ── Confirmación en línea + reactivar (caso real: se desactivó la ref. 101 con un clic sin querer) ──
  describe('desactivar con confirmación y reactivar', () => {
    const listUrl = 'http://localhost:3001/catalog/marcas';
    function iniciar(filas: unknown[]) {
      const fixture = setup();
      fixture.detectChanges();
      http.expectOne(listUrl).flush(filas);
      http.expectOne('http://localhost:3001/catalog/lineas').flush([]);
      fixture.detectChanges();
      return fixture;
    }
    const el = (f: { nativeElement: HTMLElement }) => f.nativeElement as HTMLElement;
    const btn = (f: { nativeElement: HTMLElement }, accion: string) =>
      el(f).querySelector<HTMLButtonElement>(`button[data-accion="${accion}"]`)!;

    it('el primer clic en Desactivar NO llama al backend: solo muestra la confirmación', () => {
      const fixture = iniciar([{ id: 1, codigo: 'BAS', nombre: 'Basarili', tipo: 'PROPIA', activo: true }]);
      btn(fixture, 'pedir').click();
      fixture.detectChanges();
      http.expectNone((r) => r.method === 'PATCH');
      expect(el(fixture).textContent).toContain('¿Desactivar BAS?');
      expect(btn(fixture, 'confirmar').textContent).toContain('Sí, desactivar');
    });

    it('Cancelar cierra la confirmación sin llamar al backend', () => {
      const fixture = iniciar([{ id: 1, codigo: 'BAS', nombre: 'Basarili', tipo: 'PROPIA', activo: true }]);
      btn(fixture, 'pedir').click();
      fixture.detectChanges();
      btn(fixture, 'cancelar').click();
      fixture.detectChanges();
      http.expectNone((r) => r.method === 'PATCH');
      expect(btn(fixture, 'confirmar')).toBeNull();
      expect(btn(fixture, 'pedir')).not.toBeNull();
    });

    it('"Sí, desactivar" hace el PATCH de desactivar y recarga', () => {
      const fixture = iniciar([{ id: 1, codigo: 'BAS', nombre: 'Basarili', tipo: 'PROPIA', activo: true }]);
      btn(fixture, 'pedir').click();
      fixture.detectChanges();
      btn(fixture, 'confirmar').click();
      const req = http.expectOne('http://localhost:3001/catalog/marcas/1/desactivar');
      expect(req.request.method).toBe('PATCH');
      req.flush({});
      http.expectOne(listUrl).flush([]);
    });

    it('"Mostrar inactiv…" pide ?incluirInactivas=true y Reactivar hace el PATCH (sin confirmación)', () => {
      const fixture = iniciar([{ id: 1, codigo: 'BAS', nombre: 'Basarili', tipo: 'PROPIA', activo: true }]);
      const casilla = el(fixture).querySelector<HTMLInputElement>('label.check input[type=checkbox]')!;
      casilla.click();
      const req = http.expectOne(listUrl + '?incluirInactivas=true');
      expect(req.request.method).toBe('GET');
      req.flush([{ id: 1, codigo: 'BAS', nombre: 'Basarili', tipo: 'PROPIA', activo: true }, { id: 2, codigo: 'OLD', nombre: 'Vieja', tipo: 'PROPIA', activo: false }]);
      fixture.detectChanges();

      expect(el(fixture).querySelectorAll('tr.is-inactive, .badge-neutral').length).toBeGreaterThan(0);
      expect(el(fixture).textContent).toContain('Inactiva');
      const reactivar = Array.from(el(fixture).querySelectorAll<HTMLButtonElement>('button'))
        .find((b) => b.textContent?.trim() === 'Reactivar')!;
      reactivar.click();
      const patch = http.expectOne('http://localhost:3001/catalog/marcas/2/reactivar');
      expect(patch.request.method).toBe('PATCH');
      patch.flush({});
      // Recarga respetando la casilla marcada.
      http.expectOne(listUrl + '?incluirInactivas=true').flush([]);
    });
  });

  // ── Materiales propios de la marca (marquilla/malla según la marca, en todas las referencias) ──
  describe('materiales propios de la marca', () => {
    const API = 'http://localhost:3001';
    const MARCA = { id: 5, codigo: 'ABZ', nombre: 'ABRUZZO', tipo: 'MAQUILA', activo: true };
    const AGRO: Material = { id: 10, codigo: 'MQ-AGRO', nombreCanonico: 'MARQUILLA AGRO', origen: 'COMPRADO', unidad: 'UND' };
    const ABZ: Material = { id: 11, codigo: 'MQ-ABZ', nombreCanonico: 'MARQUILLA ABRUZZO', origen: 'COMPRADO', unidad: 'UND' };
    const REGLA = {
      id: 9,
      materialObjetivo: { id: 10, codigo: 'MQ-AGRO', nombre: 'MARQUILLA AGRO' },
      materialNuevo: { id: 11, codigo: 'MQ-ABZ', nombre: 'MARQUILLA ABRUZZO' },
    };
    const el = (f: { nativeElement: HTMLElement }) => f.nativeElement as HTMLElement;
    const boton = (f: { nativeElement: HTMLElement }, texto: string) =>
      Array.from(el(f).querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === texto);

    function abrirPanel(reglas: unknown[] = [REGLA]) {
      const fixture = setup();
      fixture.detectChanges();
      http.expectOne(`${API}/catalog/marcas`).flush([MARCA]);
      http.expectOne(`${API}/catalog/lineas`).flush([]);
      fixture.detectChanges();
      boton(fixture, 'Materiales')!.click();
      http.expectOne(`${API}/catalog/marcas/5/materiales`).flush(reglas);
      http.expectOne(`${API}/catalog/materiales`).flush([AGRO, ABZ]);
      fixture.detectChanges();
      return fixture;
    }

    it('"Materiales" abre el panel de la marca y lista sus reemplazos', () => {
      const fixture = abrirPanel();
      const texto = el(fixture).textContent ?? '';
      expect(texto).toContain('Materiales propios de ABRUZZO');
      expect(texto).toContain('en el BOM de cualquier referencia se cambia el material de la izquierda por el de la derecha');
      expect(texto).toContain('MARQUILLA AGRO');
      expect(texto).toContain('→');
      expect(texto).toContain('MARQUILLA ABRUZZO');
      expect(fixture.componentInstance.materialesActivos().length).toBe(2);
    });

    it('Agregar sin elegir los dos materiales muestra el error en línea y no llama al backend', () => {
      const fixture = abrirPanel([]);
      const cmp = fixture.componentInstance;
      cmp.elegirObjetivo(AGRO);
      cmp.agregarMaterial();
      fixture.detectChanges();
      http.expectNone((r) => r.method === 'POST');
      expect(el(fixture).textContent).toContain('Elige el material del BOM base y el de la marca');
    });

    it('Agregar hace POST con los dos ids y muestra el reemplazo nuevo', () => {
      const fixture = abrirPanel([]);
      const cmp = fixture.componentInstance;
      cmp.elegirObjetivo(AGRO);
      cmp.elegirNuevo(ABZ);
      cmp.agregarMaterial();
      const post = http.expectOne(`${API}/catalog/marcas/5/materiales`);
      expect(post.request.method).toBe('POST');
      expect(post.request.body).toEqual({ materialObjetivoId: 10, materialNuevoId: 11 });
      post.flush(REGLA);
      fixture.detectChanges();
      expect(cmp.materialesMarca()).toEqual([REGLA]);
      expect(el(fixture).textContent).toContain('MARQUILLA ABRUZZO');
      // El formulario queda limpio para el siguiente reemplazo.
      expect(cmp.objetivo()).toBeNull();
      expect(cmp.nuevo()).toBeNull();
    });

    it('el rechazo del backend (duplicado) se muestra en línea', () => {
      const fixture = abrirPanel([REGLA]);
      const cmp = fixture.componentInstance;
      cmp.elegirObjetivo(AGRO);
      cmp.elegirNuevo(ABZ);
      cmp.agregarMaterial();
      http.expectOne(`${API}/catalog/marcas/5/materiales`).flush(
        { message: 'MARQUILLA AGRO ya se reemplaza por MARQUILLA ABRUZZO en esta marca; quita ese reemplazo primero' },
        { status: 400, statusText: 'Bad Request' },
      );
      fixture.detectChanges();
      expect(el(fixture).textContent).toContain('ya se reemplaza por MARQUILLA ABRUZZO');
      expect(cmp.materialesMarca().length).toBe(1);
    });

    it('Quitar pide confirmación en línea y solo "Sí, quitar" hace el DELETE', () => {
      const fixture = abrirPanel([REGLA]);
      boton(fixture, 'Quitar')!.click();
      fixture.detectChanges();
      http.expectNone((r) => r.method === 'DELETE');
      expect(el(fixture).textContent).toContain('¿Quitar este reemplazo?');
      boton(fixture, 'Sí, quitar')!.click();
      const del = http.expectOne(`${API}/catalog/marcas/5/materiales/9`);
      expect(del.request.method).toBe('DELETE');
      del.flush({ id: 9 });
      fixture.detectChanges();
      expect(fixture.componentInstance.materialesMarca()).toEqual([]);
      expect(el(fixture).textContent).toContain('Esta marca todavía no tiene materiales propios');
    });
  });
});
