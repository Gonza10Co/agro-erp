import { TestBed } from '@angular/core/testing';
import { TallaGridComponent } from './talla-grid.component';
import { Talla } from '../../../core/api/models/pedidos.models';

const TALLAS: Talla[] = [
  { id: 1, valor: 38, orden: 1 },
  { id: 2, valor: 39, orden: 2 },
];

describe('TallaGridComponent', () => {
  function setup(valores: Record<number, number>) {
    TestBed.configureTestingModule({ imports: [TallaGridComponent] });
    const fixture = TestBed.createComponent<TallaGridComponent>(TallaGridComponent);
    fixture.componentRef.setInput('tallas', TALLAS);
    fixture.componentRef.setInput('valores', valores);
    fixture.detectChanges();
    return fixture;
  }

  it('muestra el total de la curva', () => {
    const fixture = setup({ 1: 10, 2: 5 });
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('15');
  });

  it('emite el mapa actualizado al editar una talla', () => {
    const fixture = setup({ 1: 10 });
    const c = fixture.componentInstance;
    let emitido = null as Record<number, number> | null;
    c.cambio.subscribe((m: Record<number, number>) => (emitido = m));
    const input = (fixture.nativeElement as HTMLElement).querySelector('input') as HTMLInputElement;
    input.value = '7';
    input.dispatchEvent(new Event('input'));
    expect(emitido).toEqual({ 1: 7 });
  });

  it('trunca decimales a entero', () => {
    const fixture = setup({});
    const c = fixture.componentInstance;
    let emitido = null as Record<number, number> | null;
    c.cambio.subscribe((m: Record<number, number>) => (emitido = m));
    c.onInput(1, { target: { value: '2.7' } } as any);
    expect(emitido).toEqual({ 1: 2 });
  });

  it('clampa negativos a 0', () => {
    const fixture = setup({});
    const c = fixture.componentInstance;
    let emitido = null as Record<number, number> | null;
    c.cambio.subscribe((m: Record<number, number>) => (emitido = m));
    c.onInput(1, { target: { value: '-3' } } as any);
    expect(emitido).toEqual({ 1: 0 });
  });
});
