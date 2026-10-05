import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ShellComponent } from './shell.component';

describe('ShellComponent', () => {
  afterEach(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('agro-sidebar');
    localStorage.removeItem('agro-nav-grupos');
  });

  function crear() {
    TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    return { fixture, host: fixture.nativeElement as HTMLElement };
  }

  it('agrupa el menú por áreas, con Configuración cerrada al arrancar', () => {
    const { host } = crear();
    const areas = [...host.querySelectorAll('.nav-group-btn span')].map((e) => e.textContent?.trim());
    expect(areas).toEqual(['Ventas', 'Producción', 'Planta', 'Compras e inventario', 'Reportes', 'Configuración']);
    const cerradas = [...host.querySelectorAll('.nav-group.cerrado .nav-group-btn span')].map((e) => e.textContent?.trim());
    expect(cerradas).toEqual(['Configuración']);
  });

  it('abre y cierra un área, y recuerda cómo quedó', () => {
    const { fixture, host } = crear();
    const ventas = host.querySelectorAll('.nav-group-btn')[0] as HTMLButtonElement;
    ventas.click();
    fixture.detectChanges();
    expect(ventas.closest('.nav-group')!.classList.contains('cerrado')).toBeTrue();
    expect(JSON.parse(localStorage.getItem('agro-nav-grupos')!)).not.toContain('ventas');
  });

  it('las cargas por conteo van debajo de Inventario: botas y luego materiales', () => {
    const { host } = crear();
    const rutas = [...host.querySelectorAll('a.nav-item')].map((a) => a.getAttribute('href'));
    const i = rutas.indexOf('/inventario');
    expect(rutas.slice(i, i + 3)).toEqual(['/inventario', '/inventario/ajuste-pt', '/inventario/ajuste-mp']);
  });

  it('retiró del menú el puesto de operario (lo reemplazó Estación)', () => {
    const text = crear().host.textContent ?? '';
    expect(text).not.toContain('Puesto de operario');
    expect(text).toContain('Estación');
  });

  it('muestra el usuario logueado del JWT, no un nombre fijo', () => {
    const payload = btoa(JSON.stringify({ sub: 1, username: 'gerente', role: 'GERENTE' }));
    localStorage.setItem('accessToken', `x.${payload}.y`);
    TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('gerente');
    expect(text).toContain('Gerencia');
    expect(text).not.toContain('Carolina');
  });

  it('no tiene topbar y el toggle de tema vive en la sidebar', () => {
    TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.app-topbar')).toBeNull();
    expect(host.querySelector('.app-sidebar app-theme-toggle')).not.toBeNull();
  });

  it('colapsa la sidebar con el botón y persiste la preferencia', () => {
    TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.classList.contains('sb-collapsed')).toBeFalse();

    (host.querySelector('.collapse-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(host.classList.contains('sb-collapsed')).toBeTrue();
    expect(localStorage.getItem('agro-sidebar')).toBe('colapsada');

    (host.querySelector('.collapse-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(host.classList.contains('sb-collapsed')).toBeFalse();
    expect(localStorage.getItem('agro-sidebar')).toBe('expandida');
  });

  it('un rol CLIENTE ve el menú completo (liberado el 2026-08-12)', () => {
    const payload = btoa(JSON.stringify({ sub: 9, username: 'cliente', role: 'CLIENTE' }));
    localStorage.setItem('accessToken', `x.${payload}.y`);
    TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    // visibles (demos 1-2)
    expect(text).toContain('Órdenes de compra');
    expect(text).toContain('Órdenes de producción');
    expect(text).toContain('Clientes');
    expect(text).toContain('Configurador de BOM');
    // visibles desde el 2026-08-08: Entregas 5 y 6 liberadas al cliente.
    expect(text).toContain('Facturas');
    expect(text).toContain('Reporte diario');
    // visibles desde el 2026-08-12: se liberó el resto del sistema. Ya no hay
    // módulos INTERNOS, así que el cliente ve el mismo menú que un rol interno.
    expect(text).toContain('Inicio');
    expect(text).toContain('Despachos');
    expect(text).toContain('Cartera');
    expect(text).toContain('Indicadores');
    // El teaser "Planta · MES — Próximamente" se borró al liberar fabricación
    // (2026-08-08): el MES ya existe, anunciarlo como futuro se contradecía.
    expect(text).not.toContain('Próximamente');
  });

  it('un rol interno (ADMIN) ve los módulos restringidos', () => {
    const payload = btoa(JSON.stringify({ sub: 1, username: 'admin', role: 'ADMIN' }));
    localStorage.setItem('accessToken', `x.${payload}.y`);
    TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Inicio');
    expect(text).toContain('Facturas');
    expect(text).toContain('Indicadores');
    expect(text).toContain('Reporte diario');
  });

  it('un rol STAGE ve el menú completo, igual que el cliente', () => {
    const payload = btoa(JSON.stringify({ sub: 7, username: 'stage', role: 'STAGE' }));
    localStorage.setItem('accessToken', `x.${payload}.y`);
    TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    // lo del cliente + la próxima entrega
    expect(text).toContain('Órdenes de compra');
    expect(text).toContain('Clientes');
    expect(text).toContain('Compras');
    expect(text).toContain('Stage');
    // Entrega 5: `facturas` pasó a EN_STAGE para poder mostrar la factura de servicio
    // (maquila Feroz) en la demo — su única puerta es este ítem de menú.
    expect(text).toContain('Facturas');
    // Entrega 6: `fabricacion` y `reportes` pasaron a EN_STAGE por lo mismo. Son la
    // puerta al consumo real de materiales, a los sub-pasos de inyección y a la meta
    // diaria contra días hábiles — todo lo que se muestra el 2026-08-04.
    expect(text).toContain('Reporte diario');
    expect(text).toContain('Tablero por estaciones');
    // Desde el 2026-08-12 tampoco quedan internos ocultos para STAGE. Su privilegio
    // (alcanzar EN_STAGE) sigue vivo en el escalafón, pero hoy no hay nada ahí:
    // volverá a notarse cuando la próxima entrega nazca oculta al cliente.
    expect(text).toContain('Inicio');
    expect(text).toContain('Despachos');
  });

  it('arranca colapsada si la preferencia guardada es "colapsada"', () => {
    localStorage.setItem('agro-sidebar', 'colapsada');
    TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).classList.contains('sb-collapsed')).toBeTrue();
  });

  it('un JEFE_CORTE solo ve el control de corte en el menú', () => {
    const payload = btoa(JSON.stringify({ sub: 3, username: 'jefecorte', role: 'JEFE_CORTE' }));
    localStorage.setItem('accessToken', `x.${payload}.y`);
    const { host } = crear();
    const items = [...host.querySelectorAll('.nav-item .nav-label')].map((e) => e.textContent?.trim());
    expect(items).toEqual(['Control de corte']);
    const areas = [...host.querySelectorAll('.nav-group-btn span')].map((e) => e.textContent?.trim());
    expect(areas).toEqual(['Producción']);
    expect(host.textContent).toContain('Jefe de corte');
    expect(host.querySelector('a.brand')?.getAttribute('href')).toBe('/corte');
  });
});
