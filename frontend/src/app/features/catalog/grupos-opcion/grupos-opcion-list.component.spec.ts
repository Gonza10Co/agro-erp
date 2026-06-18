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
});
