import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { InventarioConsolidadoComponent } from './inventario-consolidado.component';

const API = 'http://localhost:3001/inventario';

const CONSOLIDADO = {
  materiales: [],
  pt: [],
  totales: { materiales: 0, pt: 0 },
};

function movimiento(extra: Record<string, unknown> = {}) {
  return {
    id: 1,
    tipo: 'AJUSTE',
    motivo: 'AJUSTE_MANUAL',
    cantidad: 12,
    referencia: 'REQ-7',
    observaciones: null,
    createdAt: '2026-08-13T10:00:00.000Z',
    material: {
      codigo: 'PMAR145',
      nombreCanonico: 'Marquilla',
      unidadMedida: { codigo: 'UND' },
    },
    inventarioPT: null,
    usuario: { username: 'almacen' },
    ...extra,
  };
}

describe('InventarioConsolidadoComponent · kardex', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [InventarioConsolidadoComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  function montar(movimientos: unknown[]) {
    const fixture = TestBed.createComponent(InventarioConsolidadoComponent);
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${API}/consolidado`).flush(CONSOLIDADO);
    http.expectOne((r) => r.url === `${API}/movimientos`).flush(movimientos);
    http
      .expectOne((r) => r.url === 'http://localhost:3001/catalog/lineas')
      .flush([]);
    fixture.detectChanges();
    return fixture;
  }

  it('muestra la observación que escribió el almacenista', () => {
    // El dato se guardaba desde siempre (MovimientoInventario.observaciones) y
    // no había columna donde leerlo: se capturaba a ciegas.
    const fixture = montar([
      movimiento({ observaciones: 'Sobrante del corte de la OF-31' }),
    ]);
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Observaciones');
    expect(texto).toContain('Sobrante del corte de la OF-31');
  });

  it('pone guion cuando el movimiento no trae observación', () => {
    // Los movimientos automáticos (producción, despacho) nunca la traen: la
    // columna no puede quedar en blanco o parece que se perdió el dato.
    const fixture = montar([movimiento({ observaciones: null })]);
    const filas = (fixture.nativeElement as HTMLElement).querySelectorAll(
      'tbody tr',
    );
    const celdas = filas[filas.length - 1].querySelectorAll('td');
    expect(celdas[celdas.length - 1].textContent?.trim()).toBe('—');
  });

  it('la observación va también en el title, porque el texto es libre', () => {
    const fixture = montar([
      movimiento({ observaciones: 'Devolución parcial autorizada por gerencia' }),
    ]);
    const celda = (fixture.nativeElement as HTMLElement).querySelector(
      'tbody tr td[title]',
    ) as HTMLElement;
    expect(celda.getAttribute('title')).toBe(
      'Devolución parcial autorizada por gerencia',
    );
  });
});
