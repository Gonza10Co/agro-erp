import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { OcListComponent } from './oc-list.component';
import { PedidosApi } from '../../../core/api/pedidos.api';

const OC_FILA = {
  id: 7, consecutivo: 12, clienteId: 1, fecha: '2026-06-01T00:00:00.000Z', estado: 'CONFIRMADA',
  cliente: { id: 1, nit: '900', nombre: 'ACME' }, ordenProduccion: null,
};

describe('OcListComponent', () => {
  let apiMock: { listarOC: jasmine.Spy; obtenerOC: jasmine.Spy; exportarOC: jasmine.Spy };
  function setup(filas: any[] = [OC_FILA], query: Record<string, string> = {}) {
    apiMock = {
      listarOC: jasmine.createSpy('listarOC').and.returnValue(of(filas)),
      obtenerOC: jasmine.createSpy('obtenerOC').and.returnValue(of(OC_FILA)),
      exportarOC: jasmine.createSpy('exportarOC').and.returnValue(of({ pedidos: [], tallas: [] })),
    };
    TestBed.configureTestingModule({
      imports: [OcListComponent],
      providers: [
        { provide: PedidosApi, useValue: apiMock },
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
      ],
    });
    return TestBed.createComponent(OcListComponent);
  }

  it('carga las OCs al iniciar y las expone', () => {
    const fixture = setup();
    fixture.detectChanges();
    expect(apiMock.listarOC).toHaveBeenCalled();
    expect(fixture.componentInstance.ocs().length).toBe(1);
    expect(fixture.componentInstance.cargando()).toBe(false);
  });

  it('abrir(oc) selecciona la fila y arma el título; cerrar() limpia la selección', () => {
    const fixture = setup();
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    expect(cmp.seleccionada()).toBeNull();
    cmp.abrir(OC_FILA as any);
    expect(cmp.seleccionada()?.id).toBe(7);
    expect(cmp.tituloDrawer()).toBe('OC #12');
    cmp.cerrar();
    expect(cmp.seleccionada()).toBeNull();
  });

  it('onCambio() recarga la lista (mantiene los datos frescos detrás del drawer)', () => {
    const fixture = setup();
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    cmp.onCambio();
    expect(apiMock.listarOC).toHaveBeenCalledTimes(2); // init + recarga
  });

  it('descargarExcel() pide el export UNA vez y baja pedidos AAAA-MM-DD.xlsx', () => {
    const fixture = setup();
    fixture.detectChanges();
    const click = spyOn(HTMLAnchorElement.prototype, 'click');
    let nombre = '';
    click.and.callFake(function (this: HTMLAnchorElement) { nombre = this.download; });
    fixture.componentInstance.descargarExcel();
    expect(apiMock.exportarOC).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(nombre).toMatch(/^pedidos \d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(fixture.componentInstance.descargando()).toBe(false);
  });

  it('el botón Descargar Excel está en la lista', () => {
    const fixture = setup();
    fixture.detectChanges();
    const botones = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    expect(botones.some((b) => b.textContent?.includes('Descargar Excel'))).toBe(true);
  });

  describe('despacho parcial', () => {
    const PARCIAL = { ...OC_FILA, id: 8, consecutivo: 13, estado: 'EN_PRODUCCION',
      ordenProduccion: { id: 3, consecutivo: 4, estado: 'EN_PRODUCCION' },
      dispatch: { deliveries: 2, dispatchedPairs: 1200, neededPairs: 2000, partial: true } };
    const CERRADA = { ...OC_FILA, id: 9, consecutivo: 14, estado: 'CERRADA',
      ordenProduccion: { id: 4, consecutivo: 5, estado: 'DESPACHADA' },
      dispatch: { deliveries: 3, dispatchedPairs: 20, neededPairs: 20, partial: false } };

    function setupCon(filas: any[]) {
      const fixture = setup(filas);
      fixture.detectChanges();
      return fixture;
    }

    it('pone el chip con entregas y pares solo en los pedidos abiertos que ya despacharon algo', () => {
      const fixture = setupCon([PARCIAL, CERRADA, OC_FILA]);
      const filas = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr');
      expect(filas[0].textContent).toContain('Despacho parcial');
      expect(filas[0].textContent).toContain('2 entregas · 1.200 de 2.000 pares');
      expect(filas[1].textContent).not.toContain('Despacho parcial');
      expect(filas[2].textContent).not.toContain('Despacho parcial');
    });

    it('el filtro "Con despacho parcial" deja solo esos pedidos', () => {
      const fixture = setupCon([PARCIAL, CERRADA, OC_FILA]);
      const cmp = fixture.componentInstance;
      expect(cmp.parciales()).toBe(1);
      cmp.setFilters({ partial: true });
      fixture.detectChanges();
      expect(cmp.ocsVista().map((o) => o.id)).toEqual([8]);
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Con despacho parcial (1)');
    });
  });

  describe('filtros, totales y exportes', () => {
    const A = { ...OC_FILA, id: 1, consecutivo: 1, estado: 'CONFIRMADA', fechaEntrega: '2026-12-01T00:00:00.000Z',
      cliente: { id: 1, nit: '900', nombre: 'ACME' }, linea: { id: 4, codigo: 'FEROZ', nombre: 'Feroz' },
      summary: { pairs: 100, brands: [{ id: 2, nombre: 'Agro' }], references: [{ id: 5, codigo: '101' }] },
      dispatch: { deliveries: 1, dispatchedPairs: 40, neededPairs: 100, partial: true } };
    const B = { ...OC_FILA, id: 2, consecutivo: 2, estado: 'BORRADOR',
      cliente: { id: 2, nit: '800', nombre: 'Botas García' }, linea: null,
      summary: { pairs: 30, brands: [{ id: 3, nombre: 'Basarili' }], references: [{ id: 6, codigo: '105' }] }, dispatch: null };

    it('lee los filtros de la URL al abrir y muestra totales de lo filtrado', () => {
      const fixture = setup([A, B], { brand: '2' });
      fixture.detectChanges();
      const cmp = fixture.componentInstance;
      expect(cmp.ocsVista().map((o) => o.id)).toEqual([1]);
      expect(cmp.totals()).toEqual({ orders: 1, pairs: 100, dispatched: 40, pending: 60 });
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Marca: Agro');
    });

    it('setFilters escribe los query params y limpiar los borra', () => {
      const fixture = setup([A, B]);
      fixture.detectChanges();
      const nav = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
      const cmp = fixture.componentInstance;
      cmp.setFilters({ client: 'garcia', status: 'BORRADOR' });
      expect(cmp.ocsVista().map((o) => o.id)).toEqual([2]);
      expect(nav.calls.mostRecent().args[1]?.queryParams).toEqual(jasmine.objectContaining({ client: 'garcia', status: 'BORRADOR', brand: null }));
      cmp.clearFilters();
      expect(cmp.ocsVista().length).toBe(2);
      expect(nav.calls.mostRecent().args[1]?.queryParams?.['client']).toBeNull();
    });

    it('el Excel lleva solo los pedidos filtrados', () => {
      const fixture = setup([A, B], { client: 'acme' });
      fixture.detectChanges();
      const d: any = { pedidos: [{ consecutivo: 1 }, { consecutivo: 2 }], tallas: [{ consecutivo: 1 }, { consecutivo: 2 }, { consecutivo: 2 }] };
      const r = fixture.componentInstance.soloVisibles(d);
      expect(r.pedidos.map((p) => p.consecutivo)).toEqual([1]);
      expect(r.tallas.map((t) => t.consecutivo)).toEqual([1]);
    });

    it('sin filtros el Excel va completo', () => {
      const fixture = setup([A, B]);
      fixture.detectChanges();
      const d: any = { pedidos: [{ consecutivo: 1 }, { consecutivo: 2 }], tallas: [] };
      expect(fixture.componentInstance.soloVisibles(d)).toBe(d);
    });

    it('trae el botón Imprimir pedidos', () => {
      const fixture = setup([A, B]);
      fixture.detectChanges();
      const botones = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
      expect(botones.some((b) => b.textContent?.includes('Imprimir pedidos'))).toBe(true);
    });
  });
});
