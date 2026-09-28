import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AjusteMpComponent } from './ajuste-mp.component';

describe('AjusteMpComponent', () => {
  let http: HttpTestingController;

  afterEach(() => localStorage.removeItem('accessToken'));

  function crear(rol: string) {
    localStorage.setItem('accessToken', `x.${btoa(JSON.stringify({ sub: 1, role: rol }))}.y`);
    TestBed.configureTestingModule({
      imports: [AjusteMpComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AjusteMpComponent);
    fixture.detectChanges();
    return fixture;
  }

  async function importar(fixture: ReturnType<typeof crear>, csv: string) {
    const input = document.createElement('input');
    const file = new File([csv], 'conteo.csv', { type: 'text/csv' });
    Object.defineProperty(input, 'files', { value: [file] });
    await fixture.componentInstance.importar({ target: input } as unknown as Event);
  }

  it('lee el conteo con coma decimal, previsualiza y muestra la diferencia', async () => {
    const fixture = crear('GERENTE');
    await importar(fixture, 'codigo_material;conteo_fisico\nCUERO-01;12,5\nHILO-02;\n');

    const req = http.expectOne((r) => r.url.endsWith('/inventario/material/ajuste/previsualizar'));
    expect(req.request.body).toEqual({ filas: [{ fila: 2, codigo: 'CUERO-01', conteo: 12.5 }] });
    req.flush({
      filas: [
        { fila: 2, codigo: 'CUERO-01', conteo: 12.5, material: 'Cuero graso', unidad: 'DM2', actual: 10, reservado: 0, diferencia: 2.5, error: null },
      ],
      resumen: { filas: 1, errores: 0, sinCambio: 0, suben: 1, bajan: 0, cantidadEntra: 2.5, cantidadSale: 0 },
    });
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Cuero graso');
    expect(text).toContain('1 vacías (no se tocan)');
    expect(text).toContain('+2.5 unidades');
    expect(text).toContain('Aplicar ajuste');
    http.verify();
  });

  it('un rol sin permiso revisa pero no puede aplicar', async () => {
    const fixture = crear('CLIENTE');
    await importar(fixture, 'codigo_material;conteo_fisico\nCUERO-01;3\n');
    http.expectOne((r) => r.url.endsWith('/previsualizar')).flush({
      filas: [{ fila: 2, codigo: 'CUERO-01', conteo: 3, material: 'Cuero', unidad: 'DM2', actual: 0, reservado: 0, diferencia: 3, error: null }],
      resumen: { filas: 1, errores: 0, sinCambio: 0, suben: 1, bajan: 0, cantidadEntra: 3, cantidadSale: 0 },
    });
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Solo gerencia o administración');
    expect(text).not.toContain('Aplicar ajuste');
  });
});
