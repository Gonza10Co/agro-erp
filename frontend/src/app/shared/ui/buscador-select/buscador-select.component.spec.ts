import { TestBed } from '@angular/core/testing';
import { BuscadorSelectComponent } from './buscador-select.component';

interface Item { id: number; nombre: string; nit: string; }

describe('BuscadorSelectComponent', () => {
  function setup(items: Item[]) {
    TestBed.configureTestingModule({ imports: [BuscadorSelectComponent] });
    const fixture = TestBed.createComponent<BuscadorSelectComponent<Item>>(BuscadorSelectComponent);
    fixture.componentRef.setInput('items', items);
    fixture.componentRef.setInput('etiqueta', (i: Item) => i.nombre);
    fixture.componentRef.setInput('sub', (i: Item) => i.nit);
    fixture.detectChanges();
    return fixture;
  }
  const ITEMS: Item[] = [
    { id: 1, nombre: 'Minera El Roble', nit: '900111' },
    { id: 2, nombre: 'Maquila Norte', nit: '901222' },
  ];

  it('filtra la lista por etiqueta', () => {
    const fixture = setup(ITEMS);
    const c = fixture.componentInstance;
    c.filtro.set('maqui');
    expect(c.filtrados().map(i => i.id)).toEqual([2]);
  });

  it('filtra también por sub (NIT)', () => {
    const fixture = setup(ITEMS);
    fixture.componentInstance.filtro.set('900111');
    expect(fixture.componentInstance.filtrados().map(i => i.id)).toEqual([1]);
  });

  it('emite seleccionar al elegir un item', () => {
    const fixture = setup(ITEMS);
    const c = fixture.componentInstance;
    let elegido = null as Item | null;
    c.seleccionar.subscribe((i: Item) => (elegido = i));
    c.elegir(ITEMS[0]);
    expect(elegido).toEqual(ITEMS[0]);
    expect(c.abierto()).toBe(false);
  });
});
