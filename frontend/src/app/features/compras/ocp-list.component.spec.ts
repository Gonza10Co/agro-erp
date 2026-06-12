import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { OcpListComponent } from './ocp-list.component';
import { ComprasApi } from '../../core/api/compras.api';
import { OcpResumen } from '../../core/api/models/compras.models';

const datos: OcpResumen[] = [
  {
    id: 10,
    consecutivo: 1,
    proveedor: { id: 7, nombre: 'Curtiembre Andina' },
    requerimiento: { id: 1, consecutivo: 9 },
    fecha: '2026-06-12',
    estado: 'PARCIAL',
    totalPedido: 30,
    totalRecibido: 20,
  },
  {
    id: 11,
    consecutivo: 2,
    proveedor: { id: 8, nombre: 'Químicos del Tolima' },
    requerimiento: null,
    fecha: '2026-06-12',
    estado: 'PENDIENTE',
    totalPedido: 8,
    totalRecibido: 0,
  },
];

describe('OcpListComponent', () => {
  function setup(items: OcpResumen[]) {
    TestBed.configureTestingModule({
      imports: [OcpListComponent],
      providers: [
        provideRouter([]),
        { provide: ComprasApi, useValue: { listarOrdenes: () => of(items) } },
      ],
    });
    const fixture = TestBed.createComponent(OcpListComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renderiza una fila por OCP con proveedor, origen y estado', () => {
    const el: HTMLElement = setup(datos).nativeElement;
    expect(el.textContent).toContain('OCP-1');
    expect(el.textContent).toContain('Curtiembre Andina');
    expect(el.textContent).toContain('REQ-9');
    expect(el.textContent).toContain('Parcial');
    expect(el.textContent).toContain('Pendiente');
  });

  it('muestra el avance recibido/pedido', () => {
    const el: HTMLElement = setup(datos).nativeElement;
    expect(el.textContent).toContain('20');
    expect(el.textContent).toContain('30');
  });

  it('muestra estado vacío sin órdenes', () => {
    const el: HTMLElement = setup([]).nativeElement;
    expect(el.textContent).toContain('Sin órdenes de compra');
  });
});
