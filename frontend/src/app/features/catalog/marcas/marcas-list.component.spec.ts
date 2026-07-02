import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { MarcasListComponent } from './marcas-list.component';

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
});
