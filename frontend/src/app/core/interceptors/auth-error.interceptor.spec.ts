import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { authErrorInterceptor } from './auth-error.interceptor';

describe('authErrorInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let router: jasmine.SpyObj<Router>;
  let auth: jasmine.SpyObj<AuthService>;

  beforeEach(() => {
    router = jasmine.createSpyObj('Router', ['navigateByUrl']);
    auth = jasmine.createSpyObj('AuthService', ['logout']);
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

  it('en 401 de una request normal hace logout y redirige a /login?expired=1', () => {
    http.get('http://localhost:3001/pedidos/oc').subscribe({ next: () => {}, error: () => {} });
    httpMock.expectOne('http://localhost:3001/pedidos/oc').flush('no', { status: 401, statusText: 'Unauthorized' });
    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login?expired=1');
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
