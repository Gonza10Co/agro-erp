import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { LineasListComponent } from './lineas-list.component';

describe('LineasListComponent', () => {
  let http: HttpTestingController;

  function setup() {
    TestBed.configureTestingModule({
      imports: [LineasListComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.createComponent(LineasListComponent);
  }

  afterEach(() => http.verify());

  it('carga la lista (GET) al iniciar', () => {
    const fixture = setup();
    fixture.detectChanges();
    const req = http.expectOne('http://localhost:3001/catalog/lineas');
    expect(req.request.method).toBe('GET');
    req.flush([
      { id: 4, codigo: 'FEROZ', nombre: 'Feroz', celulaInicial: 'INYECCION', activo: true },
    ]);
    expect(fixture.componentInstance.lineas().length).toBe(1);
    expect(fixture.componentInstance.cargando()).toBe(false);
  });

  it('crear hace POST con la célula inicial y recarga la lista', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('http://localhost:3001/catalog/lineas').flush([]);

    const cmp = fixture.componentInstance;
    cmp.abrirNueva();
    cmp.codigo = 'FEROZ';
    cmp.nombre = 'Feroz';
    cmp.celulaInicial = 'INYECCION';
    cmp.guardar();

    const post = http.expectOne('http://localhost:3001/catalog/lineas');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ codigo: 'FEROZ', nombre: 'Feroz', celulaInicial: 'INYECCION' });
    post.flush({ id: 4 });

    const reload = http.expectOne('http://localhost:3001/catalog/lineas');
    expect(reload.request.method).toBe('GET');
    reload.flush([]);
    expect(cmp.drawerAbierto()).toBe(false);
  });
});
