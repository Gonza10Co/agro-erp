import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { moduloGuard } from './modulo.guard';

function setRol(role: string): void {
  const payload = btoa(JSON.stringify({ sub: 1, username: 'u', role }));
  localStorage.setItem('accessToken', `x.${payload}.y`);
}

function correr(modulo: string | undefined) {
  const route = { data: modulo ? { modulo } : {} } as unknown as ActivatedRouteSnapshot;
  return TestBed.runInInjectionContext(() =>
    moduloGuard(route, {} as RouterStateSnapshot),
  );
}

describe('moduloGuard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });
  afterEach(() => localStorage.removeItem('accessToken'));

  it('permite a CLIENTE un módulo de demos 1-2', () => {
    setRol('CLIENTE');
    expect(correr('pedidos')).toBeTrue();
  });

  it('bloquea a CLIENTE un módulo oculto y lo redirige a /pedidos/oc', () => {
    setRol('CLIENTE');
    const res = correr('facturas') as UrlTree;
    expect(res.toString()).toBe('/pedidos/oc');
  });

  it('permite todo a ADMIN', () => {
    setRol('ADMIN');
    expect(correr('facturas')).toBeTrue();
    expect(correr('reportes')).toBeTrue();
  });

  it('permite rutas sin módulo declarado', () => {
    setRol('CLIENTE');
    expect(correr(undefined)).toBeTrue();
  });
});
