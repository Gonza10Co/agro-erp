import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { authErrorInterceptor } from './auth-error.interceptor';

describe('authErrorInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let router: jasmine.SpyObj<Router>;
  let auth: jasmine.SpyObj<AuthService>;

  beforeEach(() => {
    router = jasmine.createSpyObj('Router', ['navigateByUrl']);
    auth = jasmine.createSpyObj('AuthService', ['logout', 'renovar']);
    auth.renovar.and.returnValue(throwError(() => new Error('sin refresh')));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authErrorInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: router },
        { provide: AuthService, useValue: auth },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('en 401 sin sesión renovable hace logout y redirige a /login?expired=1', () => {
    http.get('http://localhost:3001/pedidos/oc').subscribe({ next: () => {}, error: () => {} });
    httpMock.expectOne('http://localhost:3001/pedidos/oc').flush('no', { status: 401, statusText: 'Unauthorized' });
    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login?expired=1');
  });

  it('en 401 renueva la sesión en silencio y repite la petición con el token nuevo', () => {
    auth.renovar.and.returnValue(of('token.nuevo'));
    let respuesta: unknown;
    http.post('http://localhost:3001/fabricacion/par/OF19-0001/avanzar', {}).subscribe((r) => (respuesta = r));
    httpMock.expectOne('http://localhost:3001/fabricacion/par/OF19-0001/avanzar').flush('no', { status: 401, statusText: 'Unauthorized' });
    const reintento = httpMock.expectOne('http://localhost:3001/fabricacion/par/OF19-0001/avanzar');
    expect(reintento.request.headers.get('Authorization')).toBe('Bearer token.nuevo');
    reintento.flush({ ok: true });
    expect(respuesta).toEqual({ ok: true });
    expect(auth.logout).not.toHaveBeenCalled();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('si el reintento vuelve a dar 401, va al login', () => {
    auth.renovar.and.returnValue(of('token.nuevo'));
    http.get('http://localhost:3001/pedidos/oc').subscribe({ next: () => {}, error: () => {} });
    httpMock.expectOne('http://localhost:3001/pedidos/oc').flush('no', { status: 401, statusText: 'Unauthorized' });
    httpMock.expectOne('http://localhost:3001/pedidos/oc').flush('no', { status: 401, statusText: 'Unauthorized' });
    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login?expired=1');
  });

  it('en 401 de /auth/refresh no intenta renovar otra vez', () => {
    http.post('http://localhost:3001/auth/refresh', {}).subscribe({ next: () => {}, error: () => {} });
    httpMock.expectOne('http://localhost:3001/auth/refresh').flush('no', { status: 401, statusText: 'Unauthorized' });
    expect(auth.renovar).not.toHaveBeenCalled();
  });

  it('en 401 de /auth/login NO redirige (login fallido)', () => {
    http.post('http://localhost:3001/auth/login', {}).subscribe({ next: () => {}, error: () => {} });
    httpMock.expectOne('http://localhost:3001/auth/login').flush('bad', { status: 401, statusText: 'Unauthorized' });
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('en error 500 no redirige', () => {
    http.get('http://localhost:3001/pedidos/oc').subscribe({ next: () => {}, error: () => {} });
    httpMock.expectOne('http://localhost:3001/pedidos/oc').flush('boom', { status: 500, statusText: 'Server Error' });
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });
});
