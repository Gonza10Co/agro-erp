import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { moduloGuard } from './modulo.guard';

function setRol(role: string): void {
  const payload = btoa(JSON.stringify({ sub: 1, username: 'u', role }));
  localStorage.setItem('accessToken', `x.${payload}.y`);
}

function correr(modulo: string | undefined, seccion?: string) {
  const data: Record<string, string> = {};
  if (modulo) data['modulo'] = modulo;
  if (seccion) data['seccion'] = seccion;
  const route = { data } as unknown as ActivatedRouteSnapshot;
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

  describe('gate por SECCIÓN (pantalla nueva dentro de un módulo ya entregado)', () => {
    // El módulo alcanza para el menú, no para la URL: sin esto el cliente entra
    // tecleando la ruta aunque el botón esté oculto (el backend no gatea por nivel).
    it('bloquea al CLIENTE una sección EN_STAGE aunque el módulo sea suyo', () => {
      setRol('CLIENTE');
      const res = correr('pedidos', 'operar-produccion') as UrlTree;
      expect(res.toString()).toBe('/pedidos/oc');
    });

    it('deja pasar al perfil STAGE a esa misma sección', () => {
      setRol('STAGE');
      expect(correr('pedidos', 'operar-produccion')).toBeTrue();
    });

    it('deja pasar a los roles internos', () => {
      setRol('ADMIN');
      expect(correr('pedidos', 'operar-produccion')).toBeTrue();
    });

    it('deja pasar al CLIENTE a una sección ya liberada (OCP manual)', () => {
      setRol('CLIENTE');
      expect(correr('compras', 'ocp-manual')).toBeTrue();
    });

    it('el módulo sigue mandando: sección visible no abre un módulo oculto', () => {
      setRol('CLIENTE');
      const res = correr('facturas', 'costo-utilidad-oc') as UrlTree;
      expect(res.toString()).toBe('/pedidos/oc');
    });
  });
});
