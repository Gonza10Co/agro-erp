import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { UsuariosListComponent } from './usuarios-list.component';

const API = 'http://localhost:3001/usuarios';

/** Token con `sub` = id, que es de donde el ABM saca "quién soy". */
function sesion(sub: number): void {
  const payload = btoa(JSON.stringify({ sub, username: 'admin', role: 'ADMIN' }));
  localStorage.setItem('accessToken', `x.${payload}.y`);
}

describe('UsuariosListComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    sesion(1);
    TestBed.configureTestingModule({
      imports: [UsuariosListComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => localStorage.removeItem('accessToken'));

  function crearFixture() {
    const fixture = TestBed.createComponent(UsuariosListComponent);
    fixture.detectChanges();
    http.expectOne(`${API}/roles`).flush([
      { id: 1, name: 'ADMIN' },
      { id: 2, name: 'GERENTE' },
    ]);
    return fixture;
  }

  it('lista los usuarios con su rol y estado', () => {
    const fixture = crearFixture();
    http.expectOne(API).flush([
      { id: 1, username: 'admin', isActive: true, createdAt: '', role: { id: 1, name: 'ADMIN' } },
      { id: 7, username: 'jp', isActive: false, createdAt: '', role: { id: 2, name: 'GERENTE' } },
    ]);
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('admin');
    expect(texto).toContain('jp');
    expect(texto).toContain('GERENTE');
    expect(texto).toContain('Activo');
    expect(texto).toContain('Inactivo');
  });

  it('al usuario en sesión no le ofrece desactivarse (el backend lo rechaza igual)', () => {
    const fixture = crearFixture();
    http.expectOne(API).flush([
      { id: 1, username: 'admin', isActive: true, createdAt: '', role: { id: 1, name: 'ADMIN' } },
    ]);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const desactivar = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Desactivar',
    ) as HTMLButtonElement;
    expect(desactivar.disabled).toBeTrue();
    expect(host.textContent).toContain('· tú');
  });

  it('crea un usuario mandando la contraseña, no un hash', () => {
    const fixture = crearFixture();
    http.expectOne(API).flush([]);
    fixture.detectChanges();

    const c = fixture.componentInstance;
    c.abrirNuevo();
    c.username = 'nuevo';
    c.password = 'clavelarga1';
    c.roleId = 2;
    c.guardar();

    const req = http.expectOne(API);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      username: 'nuevo',
      password: 'clavelarga1',
      roleId: 2,
    });
    req.flush({ id: 9 });
    http.expectOne(API).flush([]); // recarga
  });

  it('rechaza en el front una contraseña de menos de 8 sin llamar a la API', () => {
    const fixture = crearFixture();
    http.expectOne(API).flush([]);
    fixture.detectChanges();

    const c = fixture.componentInstance;
    c.abrirNuevo();
    c.username = 'nuevo';
    c.password = 'corta';
    c.roleId = 2;
    c.guardar();

    expect(c.error()).toContain('8 caracteres');
    http.expectNone(API);
  });

  it('muestra el motivo real del backend al desactivar (p. ej. último ADMIN)', () => {
    const fixture = crearFixture();
    http.expectOne(API).flush([
      { id: 3, username: 'otro', isActive: true, createdAt: '', role: { id: 1, name: 'ADMIN' } },
    ]);
    fixture.detectChanges();

    const c = fixture.componentInstance;
    c.cambiarEstado(
      { id: 3, username: 'otro', isActive: true, createdAt: '', role: { id: 1, name: 'ADMIN' } },
      false,
    );

    http.expectOne(`${API}/3`).flush(
      { message: 'Es el último ADMIN activo: deja el sistema sin quién lo administre' },
      { status: 400, statusText: 'Bad Request' },
    );
    // Un "no se pudo" genérico dejaría al admin sin saber qué hizo mal.
    expect(c.errorTabla()).toContain('último ADMIN activo');
  });

  it('resetea la contraseña por su endpoint propio', () => {
    const fixture = crearFixture();
    http.expectOne(API).flush([]);
    fixture.detectChanges();

    const c = fixture.componentInstance;
    c.abrirPassword({ id: 7, username: 'jp', isActive: true, createdAt: '', role: { id: 2, name: 'GERENTE' } });
    c.password = 'nuevaClave1';
    c.guardar();

    const req = http.expectOne(`${API}/7/password`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ password: 'nuevaClave1' });
    req.flush({ ok: true });
    http.expectOne(API).flush([]);
  });

  it('advierte que los usuarios no se eliminan', () => {
    const fixture = crearFixture();
    http.expectOne(API).flush([]);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'no se eliminan',
    );
  });
});
