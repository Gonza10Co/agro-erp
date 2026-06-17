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
    return fixture;
  }

  afterEach(() => http.verify());

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
});
