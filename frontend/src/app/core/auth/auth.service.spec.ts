import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), AuthService] });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    localStorage.clear();
  });

  afterEach(() => httpMock.verify());

  it('guarda el access token tras login', () => {
    service.login('admin', 'admin123').subscribe();
    const req = httpMock.expectOne('http://localhost:3001/auth/login');
    expect(req.request.method).toBe('POST');
    req.flush({ accessToken: 'AT', refreshToken: 'RT' });
    expect(service.accessToken).toBe('AT');
    expect(service.isAuthenticated()).toBe(true);
  });

  it('limpia los tokens en logout', () => {
    localStorage.setItem('accessToken', 'AT');
    service.logout();
    expect(service.accessToken).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
  });
});
