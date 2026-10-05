import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { programarCorteGuard } from './programar-corte.guard';

describe('programarCorteGuard', () => {
  let rol: string | null = null;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: { rol: () => rol } }],
    });
  });

  const correr = () => TestBed.runInInjectionContext(() => programarCorteGuard({} as any, {} as any));

  it('deja entrar a la gerencia y al jefe de corte', () => {
    for (const r of ['ADMIN', 'GERENTE', 'JEFE_CORTE']) {
      rol = r;
      expect(correr()).withContext(r).toBeTrue();
    }
  });

  it('devuelve al tablero de corte a los demás', () => {
    rol = 'CLIENTE';
    const res = correr() as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(res)).toBe('/corte');
  });
});
