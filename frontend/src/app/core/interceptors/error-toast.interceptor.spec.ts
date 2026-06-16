import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ToastService } from '../notificaciones/toast.service';
import { errorToastInterceptor } from './error-toast.interceptor';

describe('errorToastInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let toast: jasmine.SpyObj<ToastService>;

  beforeEach(() => {
    toast = jasmine.createSpyObj('ToastService', ['error']);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorToastInterceptor])),
        provideHttpClientTesting(),
        { provide: ToastService, useValue: toast },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('en 500 toastea con el mensaje del backend', () => {
    http.get('http://localhost:3001/pedidos/oc').subscribe({ next: () => {}, error: () => {} });
    httpMock
      .expectOne('http://localhost:3001/pedidos/oc')
      .flush({ message: 'Explotó el server' }, { status: 500, statusText: 'Server Error' });
    expect(toast.error).toHaveBeenCalledWith('Explotó el server');
  });

  it('en 400 con array de mensajes (class-validator) los une', () => {
    http.post('http://localhost:3001/clientes', {}).subscribe({ next: () => {}, error: () => {} });
    httpMock
      .expectOne('http://localhost:3001/clientes')
      .flush({ message: ['nombre requerido', 'nit inválido'] }, { status: 400, statusText: 'Bad Request' });
    expect(toast.error).toHaveBeenCalledWith('nombre requerido · nit inválido');
  });

  it('en 401 NO toastea (lo maneja authError con logout+redirect)', () => {
    http.get('http://localhost:3001/pedidos/oc').subscribe({ next: () => {}, error: () => {} });
    httpMock.expectOne('http://localhost:3001/pedidos/oc').flush('no', { status: 401, statusText: 'Unauthorized' });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('en /auth/login NO toastea (el login muestra error inline)', () => {
    http.post('http://localhost:3001/auth/login', {}).subscribe({ next: () => {}, error: () => {} });
    httpMock.expectOne('http://localhost:3001/auth/login').flush('bad', { status: 400, statusText: 'Bad Request' });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('en status 0 (sin red) muestra mensaje de conexión', () => {
    http.get('http://localhost:3001/x').subscribe({ next: () => {}, error: () => {} });
    httpMock
      .expectOne('http://localhost:3001/x')
      .error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    expect(toast.error).toHaveBeenCalledWith('Sin conexión con el servidor.');
  });
});
