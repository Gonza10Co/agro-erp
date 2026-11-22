import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CLAVE_DESFASE, aHoraServidor, desfaseReloj, medirReloj, reiniciarReloj, relojInterceptor } from './reloj-servidor';

describe('reloj del servidor', () => {
  afterEach(() => reiniciarReloj());

  it('mide el desfase con el header Date y lo guarda en la tablet', () => {
    const ahora = Date.parse('2026-11-21T15:00:00.000Z');
    medirReloj('Sat, 21 Nov 2026 15:10:00 GMT', ahora); // la tablet va 10 min atrasada
    expect(desfaseReloj()).toBe(600_500);
    expect(localStorage.getItem(CLAVE_DESFASE)).toBe('600500');
  });

  it('menos de 2 s es ruido: desfase 0', () => {
    medirReloj('Sat, 21 Nov 2026 15:00:01 GMT', Date.parse('2026-11-21T15:00:00.000Z'));
    expect(desfaseReloj()).toBe(0);
  });

  it('ignora un header ausente o ilegible', () => {
    medirReloj(null);
    medirReloj('ayer');
    expect(desfaseReloj()).toBeNull();
  });

  it('corrige una hora de la tablet a hora del servidor', () => {
    expect(aHoraServidor('2026-11-21T15:00:00.000Z', 60_000)).toBe('2026-11-21T15:01:00.000Z');
    expect(aHoraServidor('2026-11-21T15:00:00.000Z', null)).toBe('2026-11-21T15:00:00.000Z');
  });

  it('el interceptor mide con las respuestas del API', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([relojInterceptor])), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpClient);
    const mock = TestBed.inject(HttpTestingController);
    http.get('http://localhost:3001/fabricacion/hoy').subscribe();
    const fecha = new Date(Date.now() + 5 * 60_000).toUTCString();
    mock.expectOne('http://localhost:3001/fabricacion/hoy').flush({}, { headers: { Date: fecha } });
    expect(desfaseReloj()).toBeGreaterThan(4 * 60_000);
    mock.verify();
  });

  it('una respuesta lenta no se usa para medir (su Date ya viene viejo)', fakeAsync(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([relojInterceptor])), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpClient);
    const mock = TestBed.inject(HttpTestingController);
    http.get('http://localhost:3001/fabricacion/hoy').subscribe();
    const fecha = new Date(Date.now() + 5 * 60_000).toUTCString();
    tick(3000);
    mock.expectOne('http://localhost:3001/fabricacion/hoy').flush({}, { headers: { Date: fecha } });
    expect(desfaseReloj()).toBeNull();
    mock.verify();
  }));
});
