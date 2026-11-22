import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { commercialReportGuard } from './commercial-report.guard';

describe('commercialReportGuard', () => {
  let rol: string | null = null;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: { rol: () => rol } }],
    });
  });

  const run = () => TestBed.runInInjectionContext(() => commercialReportGuard({} as any, {} as any));

  it('deja entrar a gerencia, admin, comercial (CLIENTE) y stage', () => {
    for (const r of ['ADMIN', 'GERENTE', 'CLIENTE', 'STAGE']) {
      rol = r;
      expect(run()).withContext(r).toBeTrue();
    }
  });

  it('devuelve a su pantalla a los perfiles de planta', () => {
    rol = 'OPERARIO';
    expect(TestBed.inject(Router).serializeUrl(run() as UrlTree)).toBe('/inicio');
    rol = 'JEFE_CORTE';
    expect(TestBed.inject(Router).serializeUrl(run() as UrlTree)).toBe('/corte');
  });
});
