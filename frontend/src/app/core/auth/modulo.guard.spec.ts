import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { moduloGuard } from './modulo.guard';
import { NIVEL_MODULO, NIVEL_SECCION } from './modulos';

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

  // Desde el 2026-08-12 NO queda ningún módulo INTERNO, así que ya no hay ejemplo
  // fijo que usar (antes fue `facturas`, después `cartera`). Se oculta uno a
  // propósito y se restaura: así el test prueba el MECANISMO del guard y no el
  // estado del tablero, que cambia en cada entrega.
  it('bloquea a CLIENTE un módulo oculto y lo redirige a su ruta inicial', () => {
    setRol('CLIENTE');
    const original = NIVEL_MODULO.cartera;
    NIVEL_MODULO.cartera = 'INTERNO';
    try {
      const res = correr('cartera') as UrlTree;
      expect(res.toString()).toBe('/inicio');
    } finally {
      NIVEL_MODULO.cartera = original;
    }
  });

  it('con el tablero real, el CLIENTE entra a cartera (liberada el 2026-08-12)', () => {
    setRol('CLIENTE');
    expect(correr('cartera')).toBeTrue();
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
    // Igual que arriba: ya no queda ninguna sección EN_STAGE, así que se simula.
    it('bloquea al CLIENTE una sección EN_STAGE aunque el módulo sea suyo', () => {
      setRol('CLIENTE');
      const original = NIVEL_SECCION['operar-produccion'];
      NIVEL_SECCION['operar-produccion'] = 'EN_STAGE';
      try {
        const res = correr('pedidos', 'operar-produccion') as UrlTree;
        expect(res.toString()).toBe('/inicio');
      } finally {
        NIVEL_SECCION['operar-produccion'] = original;
      }
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
      const original = NIVEL_MODULO.cartera;
      NIVEL_MODULO.cartera = 'INTERNO';
      try {
        const res = correr('cartera', 'costo-utilidad-oc') as UrlTree;
        expect(res.toString()).toBe('/inicio');
      } finally {
        NIVEL_MODULO.cartera = original;
      }
    });
  });
});
