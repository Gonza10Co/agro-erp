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
    expect(fixture.componentInstance.marcas().length).toBe(1);
    expect(fixture.componentInstance.cargando()).toBe(false);
  });

  it('crear hace POST y recarga la lista', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('http://localhost:3001/catalog/marcas').flush([]);

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
});
