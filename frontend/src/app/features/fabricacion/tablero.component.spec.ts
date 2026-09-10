import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { FabricacionTableroComponent } from './tablero.component';

const RESUMEN = {
  celulas: [
    { celula: 'CORTE', total: 0, tallas: [] },
    { celula: 'GUARNICION', total: 340, tallas: [{ talla: 38, cantidad: 200 }, { talla: 40, cantidad: 140 }] },
    { celula: 'ALMACEN', total: 0, tallas: [] },
    { celula: 'INYECCION', total: 420, tallas: [{ talla: 38, cantidad: 420 }] },
    { celula: 'PT', total: 0, tallas: [] },
  ],
  terminados: 146,
  fueraDeFlujo: 2,
  total: 908,
};

function montar() {
  TestBed.configureTestingModule({
    imports: [FabricacionTableroComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const fixture = TestBed.createComponent(FabricacionTableroComponent);
  const http = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return { fixture, http, el: fixture.nativeElement as HTMLElement };
}

describe('FabricacionTableroComponent', () => {
  it('muestra el conteo por célula y el desglose por talla, sin pedir la lista de pares', () => {
    const { fixture, http, el } = montar();
    http.expectOne('http://localhost:3001/fabricacion/tablero-resumen').flush(RESUMEN);
    fixture.detectChanges();

    expect(el.textContent).toContain('340');
    expect(el.textContent).toContain('420');
    expect(el.textContent).toContain('146'); // terminados
    expect(el.textContent).toContain('908 pares en la orden');
    // El desglose por talla es lo que la planta pregunta.
    expect(el.textContent).toContain('38');
    // Nadie abrió una columna: el detalle no se pide.
    http.verify();
  });

  it('pide el detalle de una célula solo al abrirla', () => {
    const { fixture, http, el } = montar();
    http.expectOne('http://localhost:3001/fabricacion/tablero-resumen').flush(RESUMEN);
    fixture.detectChanges();

    fixture.componentInstance.abrir('GUARNICION');
    const req = http.expectOne(
      (r) => r.url === 'http://localhost:3001/fabricacion/tablero' && r.params.get('celula') === 'GUARNICION',
    );
    expect(req.request.params.get('estados')).toBe('EN_PROCESO');
    req.flush([
      { id: 1, codigo: 'OF1-0001', celulaActual: 'GUARNICION', subPasoActual: 'STROBEL', estado: 'EN_PROCESO', talla: { valor: '38' }, of: { consecutivo: 1 } },
    ]);
    fixture.detectChanges();

    expect(el.textContent).toContain('OF1-0001');
    expect(el.textContent).toContain('Strobel');
    http.verify();
  });

  it('la franja de fuera de flujo pide bajas y cancelados juntos', () => {
    const { fixture, http, el } = montar();
    http.expectOne('http://localhost:3001/fabricacion/tablero-resumen').flush(RESUMEN);
    fixture.detectChanges();
    expect(el.textContent).toContain('2 fuera de flujo');

    fixture.componentInstance.abrir('FUERA');
    const req = http.expectOne(
      (r) => r.url === 'http://localhost:3001/fabricacion/tablero' && r.params.get('estados') === 'DADO_DE_BAJA,CANCELADO',
    );
    req.flush([
      { id: 2, codigo: 'OF1-0002', celulaActual: 'INYECCION', estado: 'DADO_DE_BAJA', talla: { valor: '38' }, of: { consecutivo: 1 } },
      { id: 3, codigo: 'OF1-0003', celulaActual: 'CORTE', estado: 'CANCELADO', talla: { valor: '40' }, of: { consecutivo: 1 } },
    ]);
    fixture.detectChanges();

    expect(el.textContent).toContain('baja');
    expect(el.textContent).toContain('cancelado');
    http.verify();
  });

  it('muestra error si el tablero no carga', () => {
    const { fixture, http, el } = montar();
    http.expectOne('http://localhost:3001/fabricacion/tablero-resumen').error(new ProgressEvent('error'));
    fixture.detectChanges();
    expect(el.textContent).toContain('No se pudo cargar el tablero');
    http.verify();
  });

  it('mantiene el enlace al sub-tablero de Guarnición', () => {
    const { fixture, http, el } = montar();
    http.expectOne('http://localhost:3001/fabricacion/tablero-resumen').flush(RESUMEN);
    fixture.detectChanges();
    const link = el.querySelector('a[href*="/fabricacion/guarnicion"]');
    expect(link).not.toBeNull();
    http.verify();
  });
});
