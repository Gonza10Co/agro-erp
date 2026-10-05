import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CorteTableroComponent, cumplimientoMedible } from './corte-tablero.component';

describe('cumplimientoMedible', () => {
  it('no mide el cumplimiento de una orden que apenas está programada', () => {
    // El backend calcula 0/820 = 0. Pintarlo como "0%" en rojo acusa a una
    // orden a la que todavía nadie le ha puesto tijera.
    expect(cumplimientoMedible('PROGRAMADA', 0)).toBeNull();
  });

  it('tampoco mientras corte la está trabajando: lo cortado se reporta al entregar', () => {
    expect(cumplimientoMedible('EN_CORTE', 0)).toBeNull();
  });

  it('sí lo mide desde que corte entregó', () => {
    expect(cumplimientoMedible('ENTREGADA', 0.62)).toBeCloseTo(0.62, 5);
    expect(cumplimientoMedible('EN_GUARNICION', 1)).toBe(1);
    expect(cumplimientoMedible('CERRADA', 0.983)).toBeCloseTo(0.983, 5);
  });

  it('respeta el null que ya venía del backend', () => {
    expect(cumplimientoMedible('CERRADA', null)).toBeNull();
  });
});

describe('CorteTableroComponent: botón "Nueva orden de corte"', () => {
  const base = 'http://localhost:3001';

  function render(rol: string) {
    TestBed.configureTestingModule({
      imports: [CorteTableroComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthService, useValue: { rol: () => rol } },
      ],
    });
    const fixture = TestBed.createComponent(CorteTableroComponent);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${base}/catalog/lineas`).flush([]);
    http.expectOne((r) => r.url === `${base}/corte/tablero`).flush({ ordenes: [], resumen: null });
    fixture.detectChanges();
    http.verify();
    return fixture.nativeElement.querySelector('a[href="/corte/ordenes/nueva"]');
  }

  for (const rol of ['ADMIN', 'GERENTE', 'JEFE_CORTE']) {
    it(`lo ve ${rol}`, () => expect(render(rol)).not.toBeNull());
  }

  it('no lo ve el CLIENTE', () => expect(render('CLIENTE')).toBeNull());
});
