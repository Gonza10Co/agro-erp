import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { OcpDetalleComponent } from './ocp-detalle.component';
import { ComprasApi } from '../../core/api/compras.api';
import { OcpDetalle } from '../../core/api/models/compras.models';

const detalle: OcpDetalle = {
  id: 10,
  consecutivo: 1,
  proveedor: { id: 7, nombre: 'Curtiembre Andina' },
  requerimiento: { id: 1, consecutivo: 9 },
  fecha: '2026-06-12',
  estado: 'PARCIAL',
  valorEstimado: null,
  observaciones: null,
  lineas: [
    {
      id: 1, materialId: 7, materialCodigo: 'MICRO-NEG', materialNombre: 'Microfibra negra',
      unidad: 'm', cantPedida: 30, cantRecibida: 20, pendiente: 10, costoUnitario: null,
    },
  ],
  recepciones: [
    { id: 70, consecutivo: 1, fecha: '2026-06-11', observaciones: 'parcial', lineas: [{ ocpLineaId: 1, cantidad: 20 }] },
  ],
  devoluciones: [
    { id: 80, consecutivo: 1, fecha: '2026-06-12', causa: 'Defectos de calidad', observaciones: null, lineas: [{ materialId: 7, materialCodigo: 'MICRO-NEG', materialNombre: 'Microfibra negra', cantidad: 3 }] },
  ],
};

function setup(d: OcpDetalle | null) {
  const api = {
    obtenerOrden: () => (d ? of(d) : throwError(() => new Error('404'))),
  };
  TestBed.configureTestingModule({
    imports: [OcpDetalleComponent],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ComprasApi, useValue: api },
      { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: '10' })) } },
    ],
  });
  const fixture = TestBed.createComponent(OcpDetalleComponent);
  fixture.detectChanges();
  return fixture;
}

describe('OcpDetalleComponent', () => {
  it('renderiza cabecera, líneas con pendiente e historial', () => {
    const el: HTMLElement = setup(detalle).nativeElement;
    expect(el.textContent).toContain('OCP-1');
    expect(el.textContent).toContain('Curtiembre Andina');
    expect(el.textContent).toContain('MICRO-NEG');
    expect(el.textContent).toContain('Parcial');
    expect(el.textContent).toContain('REC-1');
    expect(el.textContent).toContain('DEV-1');
    expect(el.textContent).toContain('Defectos de calidad');
  });

  it('muestra acciones de recepción y devolución cuando aplican', () => {
    const el: HTMLElement = setup(detalle).nativeElement;
    expect(el.textContent).toContain('Registrar recepción');
    expect(el.textContent).toContain('Devolución a proveedor');
  });

  it('oculta "Registrar recepción" cuando la OCP está COMPLETA', () => {
    const el: HTMLElement = setup({
      ...detalle,
      estado: 'COMPLETA',
      lineas: [{ ...detalle.lineas[0], cantRecibida: 30, pendiente: 0 }],
    }).nativeElement;
    expect(el.textContent).not.toContain('Registrar recepción');
    expect(el.textContent).toContain('Devolución a proveedor');
  });

  it('muestra error si la OCP no existe', () => {
    const el: HTMLElement = setup(null).nativeElement;
    expect(el.textContent).toContain('No se encontró la orden de compra');
  });
});

describe('OcpDetalleComponent — anulación (Entrega 4)', () => {
  it('muestra "Anular orden" solo cuando no hay mercancía movida', () => {
    const sinMovimientos: OcpDetalle = { ...detalle, recepciones: [], devoluciones: [],
      lineas: [{ ...detalle.lineas[0], cantRecibida: 0, pendiente: 30 }] };
    const el: HTMLElement = setup(sinMovimientos).nativeElement;
    expect(el.textContent).toContain('Anular orden');
  });

  it('con recepciones NO ofrece anular; ANULADA esconde recepción/devolución', () => {
    const el: HTMLElement = setup(detalle).nativeElement; // tiene recepciones
    expect(el.textContent).not.toContain('Anular orden');

    TestBed.resetTestingModule();
    const anulada: OcpDetalle = { ...detalle, estado: 'ANULADA', recepciones: [], devoluciones: [],
      lineas: [{ ...detalle.lineas[0], cantRecibida: 0, pendiente: 30 }] };
    const el2: HTMLElement = setup(anulada).nativeElement;
    expect(el2.textContent).toContain('Anulada');
    expect(el2.textContent).not.toContain('Registrar recepción');
  });

  it('muestra el costo unitario de la línea y el total estimado', () => {
    const conCosto: OcpDetalle = { ...detalle, valorEstimado: 36000,
      lineas: [{ ...detalle.lineas[0], costoUnitario: 1200 }] };
    const el: HTMLElement = setup(conCosto).nativeElement;
    expect(el.textContent).toContain('total estimado');
    expect(el.textContent).toContain('$36,000');
    expect(el.textContent).toContain('$1,200');
  });
});
