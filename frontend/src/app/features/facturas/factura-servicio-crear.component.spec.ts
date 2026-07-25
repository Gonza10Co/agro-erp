import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FacturaServicioCrearComponent } from './factura-servicio-crear.component';

const API = 'http://localhost:3001';

describe('FacturaServicioCrearComponent', () => {
  let http: HttpTestingController;

  function setup() {
    TestBed.configureTestingModule({
      imports: [FacturaServicioCrearComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(FacturaServicioCrearComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges(); // ngOnInit
    http.expectOne(`${API}/clientes`).flush([
      { id: 7, nombre: 'Minera El Roble', activo: true },
      { id: 8, nombre: 'Cliente inactivo', activo: false },
    ]);
    http.expectOne(`${API}/catalog/lineas`).flush([
      { id: 4, codigo: 'FEROZ', nombre: 'Feroz', celulaInicial: 'INYECCION', activo: true },
    ]);
    http.expectOne(`${API}/facturas/servicio/catalogo`).flush([
      { id: 1, codigo: 'INY-CAPELLADA', nombre: 'Inyección de suela', unidad: 'PAR', precioBase: 4200, activo: true },
    ]);
    return fixture;
  }
  afterEach(() => http.verify());

  it('solo ofrece clientes activos', () => {
    const c = setup().componentInstance;
    expect(c.clientes().length).toBe(1);
    expect(c.clientes()[0].nombre).toBe('Minera El Roble');
  });

  it('al elegir línea pregunta cuántos pares terminó (la cantidad no se inventa)', () => {
    const c = setup().componentInstance;
    c.cambiarLinea(4);
    const req = http.expectOne((r) => r.url === `${API}/facturas/servicio/sugerencia`);
    expect(req.request.params.get('lineaId')).toBe('4');
    req.flush({ linea: { id: 4, codigo: 'FEROZ', nombre: 'Feroz' }, anio: 2026, mes: 7, paresTerminados: 2016 });
    expect(c.sugerencia()?.paresTerminados).toBe(2016);

    c.usarSugerencia();
    expect(c.lineasForm()[0].cantidad).toBe(2016);
  });

  it('elegir un servicio del catálogo prellena precio y descripción, pero se pueden cambiar', () => {
    const c = setup().componentInstance;
    c.elegirServicio(0, 1);
    expect(c.lineasForm()[0].precioUnitario).toBe(4200);
    expect(c.lineasForm()[0].descripcion).toBe('Inyección de suela');
    c.setLinea(0, 'precioUnitario', 5000);
    expect(c.lineasForm()[0].precioUnitario).toBe(5000);
  });

  it('calcula subtotal, IVA y total', () => {
    const c = setup().componentInstance;
    c.clienteId.set(7);
    c.elegirServicio(0, 1);
    c.setLinea(0, 'cantidad', 2016);
    expect(c.subtotal()).toBe(8467200);
    expect(c.iva()).toBe(1608768);
    expect(c.total()).toBe(10075968);
  });

  it('no deja emitir sin cliente ni sin una línea completa', () => {
    const c = setup().componentInstance;
    expect(c.valido()).toBeFalse();
    c.clienteId.set(7);
    expect(c.valido()).toBeFalse(); // línea vacía
    c.elegirServicio(0, 1);
    c.setLinea(0, 'cantidad', 10);
    expect(c.valido()).toBeTrue();
  });

  it('emite la factura con línea de producción y cantidad', () => {
    const c = setup().componentInstance;
    c.clienteId.set(7);
    c.lineaId.set(4);
    c.elegirServicio(0, 1);
    c.setLinea(0, 'cantidad', 2016);
    c.emitir();

    const req = http.expectOne(`${API}/facturas/servicio`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      clienteId: 7,
      lineaId: 4,
      lineas: [
        { servicioId: 1, descripcion: 'Inyección de suela', cantidad: 2016, precioUnitario: 4200 },
      ],
    });
    req.flush({ id: 99 });
  });

  it('acepta una línea libre, sin servicio del catálogo', () => {
    const c = setup().componentInstance;
    c.clienteId.set(7);
    c.setLinea(0, 'descripcion', 'Mantenimiento de inyectora');
    c.setLinea(0, 'cantidad', 1);
    c.setLinea(0, 'precioUnitario', 350000);
    expect(c.valido()).toBeTrue();
    c.emitir();
    const req = http.expectOne(`${API}/facturas/servicio`);
    expect(req.request.body.lineas[0]).toEqual({
      servicioId: undefined,
      descripcion: 'Mantenimiento de inyectora',
      cantidad: 1,
      precioUnitario: 350000,
    });
    req.flush({ id: 100 });
  });
});
