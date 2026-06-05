import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { RequerimientoComponent } from './requerimiento.component';
import { ComprasApi } from '../../core/api/compras.api';
import { Requerimiento } from '../../core/api/models/compras.models';

const datos: Requerimiento = {
  id: 1, consecutivo: 1, opId: 7, fecha: '2026-06-05',
  grupos: [
    { proveedor: { id: 7, nombre: 'Curtiembre Andina' }, lineas: [
      { materialId: 1, materialCodigo: 'CUERO-NEGRO', materialNombre: 'Cuero negro', proveedorId: 7, proveedorNombre: 'Curtiembre Andina', cantNecesaria: 100, cantDisponible: 30, cantAComprar: 70 },
    ] },
    { proveedor: null, lineas: [
      { materialId: 9, materialCodigo: 'PEGANTE', materialNombre: 'Pegante', proveedorId: null, proveedorNombre: null, cantNecesaria: 5, cantDisponible: 0, cantAComprar: 5 },
    ] },
  ],
};

describe('RequerimientoComponent', () => {
  function setup(req: Requerimiento) {
    const api = { obtener: () => of(req) };
    TestBed.configureTestingModule({
      imports: [RequerimientoComponent],
      providers: [
        provideRouter([]),
        { provide: ComprasApi, useValue: api },
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: '1' })) } },
      ],
    });
    const fixture = TestBed.createComponent(RequerimientoComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renderiza un grupo por proveedor y el grupo "Sin proveedor"', () => {
    const el: HTMLElement = setup(datos).nativeElement;
    expect(el.textContent).toContain('Curtiembre Andina');
    expect(el.textContent).toContain('Sin proveedor');
    expect(el.textContent).toContain('CUERO-NEGRO');
    expect(el.textContent).toContain('70');
  });

  it('muestra estado vacío cuando no hay grupos', () => {
    const el: HTMLElement = setup({ ...datos, grupos: [] }).nativeElement;
    expect(el.textContent).toContain('Nada que comprar');
  });
});
