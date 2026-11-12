import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ProyeccionComponent } from './proyeccion.component';
import { Proyeccion } from '../../../core/api/models/proyeccion.models';

const URL = 'http://localhost:3001/pedidos/proyeccion';

const datos: Proyeccion = {
  hoy: '2026-11-12', paresPorDia: 1206, diasProceso: 6,
  disponible: [{ productoConfiguradoId: 20, producto: 'FORTIA', referencia: '107', marca: 'FORTIA', calidad: 'PRIMERA', tallas: [{ talla: 39, pares: 900 }, { talla: 42, pares: 50 }], total: 950 }],
  dias: [
    { fecha: '2026-11-12', capacidad: 1206, usado: 1206, libre: 0, bloques: [{ ocId: 1, consecutivo: 1, cliente: 'CALZATODO SA', pares: 603, tarde: false }, { ocId: 2, consecutivo: 19, cliente: 'CECILIA RENE', pares: 603, tarde: false }] },
    { fecha: '2026-11-13', capacidad: 1206, usado: 603, libre: 603, bloques: [{ ocId: 2, consecutivo: 19, cliente: 'CECILIA RENE', pares: 603, tarde: true }] },
    { fecha: '2026-11-14', capacidad: 1206, usado: 0, libre: 1206, bloques: [] },
  ],
  pedidos: [
    { ocId: 1, consecutivo: 1, cliente: 'CALZATODO SA', ocCliente: null, productos: ['PODEROSA'], referencias: ['101'], marcas: ['PODEROSA'], tieneOP: false, pares: 700, deBodega: 97, aProducir: 603, sinCupo: 0, compromiso: '2026-11-27', compromisoEstimado: true, inicio: '2026-11-12', finCorte: '2026-11-12', fin: '2026-11-20', diasAtraso: 0, estado: 'A_TIEMPO', tallas: [] },
    { ocId: 2, consecutivo: 19, cliente: 'CECILIA RENE', ocCliente: 'AGR-956', productos: ['ALPACA SUELA AZUL'], referencias: ['102'], marcas: ['ALPACA SUELA AZUL'], tieneOP: true, pares: 1206, deBodega: 0, aProducir: 1206, sinCupo: 0, compromiso: '2026-11-12', compromisoEstimado: false, inicio: '2026-11-12', finCorte: '2026-11-13', fin: '2026-11-21', diasAtraso: 9, estado: 'ATRASADO', tallas: [] },
  ],
  resumen: { pedidos: 2, pares: 1906, deBodega: 97, aProducir: 1809, atrasados: 1, sinCupo: 0, hastaCuando: '2026-11-21', primerCupoLibre: '2026-11-13', paresLibresEnVentana: 603, paresParaVender: 950 },
};

describe('ProyeccionComponent', () => {
  let http: HttpTestingController;

  function montar(respuesta: Proyeccion = datos) {
    TestBed.configureTestingModule({
      imports: [ProyeccionComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(ProyeccionComponent);
    f.detectChanges();
    http.expectOne(URL).flush(respuesta);
    f.detectChanges();
    return f;
  }

  afterEach(() => http.verify());

  it('muestra hasta cuándo hay trabajo, el cupo libre y los que no llegan', () => {
    const el: HTMLElement = montar().nativeElement;
    const kpis = [...el.querySelectorAll('.kpi-value')].map((k) => k.textContent!.trim());
    expect(kpis).toEqual(['sáb 21 nov', 'vie 13 nov', '950', '2', '1']);
    expect(el.querySelector('.kpi-mal')).not.toBeNull();
  });

  it('pinta una barra por día y marca en rojo lo que se fabrica después del compromiso', () => {
    const el: HTMLElement = montar().nativeElement;
    const dias = el.querySelectorAll('.dia');
    expect(dias.length).toBe(3);
    const segs1 = dias[0].querySelectorAll('.seg');
    expect(segs1.length).toBe(2);
    expect((segs1[0] as HTMLElement).style.width).toBe('50%');
    expect(segs1[1].classList.contains('mal')).toBeFalse(); // la marca de tarde la decide el servidor
    expect(dias[1].querySelector('.seg')!.classList.contains('mal')).toBeTrue();
    expect(dias[2].querySelectorAll('.seg').length).toBe(0);
  });

  it('filtra la tabla por cliente o referencia', () => {
    const f = montar();
    f.componentInstance.texto.set('cecilia');
    f.detectChanges();
    const filas = f.nativeElement.querySelectorAll('.tabla-pedidos tbody tr');
    expect(filas.length).toBe(1);
    expect(filas[0].textContent).toContain('AGR-956');
    expect(filas[0].textContent).toContain('9 días tarde');
  });

  it('sin pedidos lo dice en vez de mostrar un tablero vacío', () => {
    const el: HTMLElement = montar({ ...datos, dias: [], pedidos: [], resumen: { ...datos.resumen, pedidos: 0 } }).nativeElement;
    expect(el.textContent).toContain('No hay pedidos confirmados por entregar');
    expect(el.querySelector('.kpis')).toBeNull();
  });

  it('muestra lo que queda en bodega para vender por talla', () => {
    const el: HTMLElement = montar().nativeElement;
    expect(el.textContent).toContain('Queda en bodega para vender');
    const encabezado = [...el.querySelectorAll('.tabla-venta thead th')].map((th) => th.textContent!.trim());
    expect(encabezado).toEqual(['Ref.', 'Producto', '39', '42', 'Total']);
    const celdas = [...el.querySelectorAll('.tabla-venta tbody td')].map((td) => td.textContent!.trim());
    expect(celdas).toEqual(['107', 'FORTIA', '900', '50', '950']);
  });
});
