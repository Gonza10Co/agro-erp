import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { FabricacionTableroComponent } from './tablero.component';

const RESUMEN = {
  // Columnas por ESTACIÓN: Montaje y Finizaje se ven aparte aunque compartan célula.
  estaciones: [
    { codigo: 'PREPARACION', nombre: 'Preparación', total: 340, tallas: [{ talla: 38, cantidad: 200 }, { talla: 40, cantidad: 140 }] },
    { codigo: 'BODEGA_CORTE', nombre: 'Bodega de corte', total: 0, tallas: [] },
    { codigo: 'MONTAJE', nombre: 'Inyección · Montaje', total: 420, tallas: [{ talla: 38, cantidad: 420 }] },
    { codigo: 'FINIZAJE', nombre: 'Inyección · Finizaje', total: 12, tallas: [{ talla: 38, cantidad: 12 }] },
    { codigo: 'PT', nombre: 'Producto terminado', total: 0, tallas: [] },
  ],
  terminados: 146,
  fueraDeFlujo: 2,
  total: 920,
  programado: 1206,
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
  it('muestra una columna por estación con su desglose, sin pedir la lista de pares', () => {
    const { fixture, http, el } = montar();
    http.expectOne('http://localhost:3001/fabricacion/tablero-resumen').flush(RESUMEN);
    fixture.detectChanges();

    expect(el.textContent).toContain('Preparación');
    expect(el.textContent).toContain('340');
    // Montaje y Finizaje son puestos distintos: no se suman en una columna "Inyección".
    expect(el.textContent).toContain('Inyección · Montaje');
    expect(el.textContent).toContain('Inyección · Finizaje');
    expect(el.textContent).toContain('12');
    // Y no queda rastro del vocabulario de células (la columna "Corte" que nunca se llenaba).
    expect(el.textContent).not.toContain('Corte │');
    expect(el.textContent).toContain('146'); // terminados
    // El pie mide lo nacido contra lo programado, no solo lo que existe.
    expect(el.textContent).toContain('920');
    expect(el.textContent).toContain('de 1206 pares nacidos');
    // Nadie abrió una columna: el detalle no se pide.
    http.verify();
  });

  it('pide el detalle de una estación solo al abrirla', () => {
    const { fixture, http, el } = montar();
    http.expectOne('http://localhost:3001/fabricacion/tablero-resumen').flush(RESUMEN);
    fixture.detectChanges();

    fixture.componentInstance.abrir('PREPARACION');
    const req = http.expectOne(
      (r) => r.url === 'http://localhost:3001/fabricacion/tablero' && r.params.get('estacion') === 'PREPARACION',
    );
    expect(req.request.params.get('estados')).toBe('EN_PROCESO');
    req.flush([
      { id: 1, codigo: 'OF1-0001', celulaActual: 'GUARNICION', subPasoActual: 'PREPARACION', estado: 'EN_PROCESO', talla: { valor: '38' }, of: { consecutivo: 1 } },
    ]);
    fixture.detectChanges();

    expect(el.textContent).toContain('OF1-0001');
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

  it('la columna Corte muestra lo que falta por nacer y no se puede abrir', () => {
    const { fixture, http, el } = montar();
    http.expectOne('http://localhost:3001/fabricacion/tablero-resumen').flush({
      ...RESUMEN,
      estaciones: [{ codigo: 'CORTE_PENDIENTE', nombre: 'Corte', total: 286, tallas: [] }, ...RESUMEN.estaciones],
    });
    fixture.detectChanges();

    expect(el.textContent).toContain('Corte');
    expect(el.textContent).toContain('286');
    // No hay pares que listar: ahí el par todavía no existe.
    const boton = el.querySelector('.col-num') as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    http.verify();
  });

  it('muestra la columna "Otros" solo cuando hay pares fuera de las estaciones activas', () => {
    const { fixture, http, el } = montar();
    http.expectOne('http://localhost:3001/fabricacion/tablero-resumen').flush({
      ...RESUMEN,
      estaciones: [...RESUMEN.estaciones, { codigo: 'OTROS', nombre: 'Otros', total: 7, tallas: [] }],
    });
    fixture.detectChanges();
    expect(el.textContent).toContain('Otros');
    expect(el.textContent).toContain('7');
    http.verify();
  });
});
