import { TestBed } from '@angular/core/testing';
import { BomArbolComponent } from './bom-arbol.component';
import { NodoBom } from '../../../../core/api/models/catalogo.models';

const NODOS: NodoBom[] = [
  { materialId: 2, codigo: 'PLANT-PU', nombre: 'PLANTILLA PU', unidad: 'PAR', origen: 'FABRICADO', consumo: 1, hijos: [
    { materialId: 3, codigo: 'POLIOL', nombre: 'POLIOL JF', unidad: 'KG', origen: 'COMPRADO', consumo: 0.04, hijos: [] },
  ] },
];

describe('BomArbolComponent', () => {
  it('renderiza nodos e hijos recursivamente', () => {
    TestBed.configureTestingModule({ imports: [BomArbolComponent] });
    const fixture = TestBed.createComponent(BomArbolComponent);
    fixture.componentRef.setInput('nodos', NODOS);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('PLANTILLA PU');
    expect(text).toContain('POLIOL JF'); // hijo (recursión)
  });
});
