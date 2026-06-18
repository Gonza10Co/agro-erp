import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ProveedoresListComponent } from './proveedores-list.component';

describe('ProveedoresListComponent', () => {
  let http: HttpTestingController;

  function setup() {
    TestBed.configureTestingModule({
      imports: [ProveedoresListComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(ProveedoresListComponent);
    http = TestBed.inject(HttpTestingController);
    return fixture;
  }

  afterEach(() => http.verify());

  it('carga los proveedores al iniciar (GET)', () => {
    const fixture = setup();
    fixture.detectChanges();
    const req = http.expectOne('http://localhost:3001/proveedores');
    expect(req.request.method).toBe('GET');
    req.flush([{ id: 1, nit: '800', nombre: 'CueroSur', ciudad: 'Ibagué', activo: true }]);
    expect(fixture.componentInstance.proveedores().length).toBe(1);
    expect(fixture.componentInstance.cargando()).toBe(false);
  });

  it('crear hace POST y recarga la lista', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('http://localhost:3001/proveedores').flush([]);

    const cmp = fixture.componentInstance;
    cmp.abrirNuevo();
    cmp.nit = '800';
    cmp.nombre = 'CueroSur';
    cmp.guardar();

    const post = http.expectOne((r) => r.method === 'POST' && r.url === 'http://localhost:3001/proveedores');
    expect(post.request.body).toEqual({ nit: '800', nombre: 'CueroSur', ciudad: undefined });
    post.flush({ id: 1, nit: '800', nombre: 'CueroSur', activo: true });

    // recarga
    http.expectOne('http://localhost:3001/proveedores').flush([{ id: 1, nit: '800', nombre: 'CueroSur', activo: true }]);
    expect(cmp.drawerAbierto()).toBe(false);
  });
});
