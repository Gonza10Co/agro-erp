import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ShellComponent } from './shell.component';

describe('ShellComponent', () => {
  afterEach(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('agro-sidebar');
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

  it('un rol CLIENTE solo ve los ítems de demos 1-2', () => {
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
    expect(text).toContain('Órdenes de Compra');
    expect(text).toContain('Órdenes de Producción');
    expect(text).toContain('Clientes');
    expect(text).toContain('Configurador de BOM');
    // ocultos (demos posteriores)
    expect(text).not.toContain('Inicio');
    expect(text).not.toContain('Despachos');
    expect(text).not.toContain('Facturas');
    expect(text).not.toContain('Cartera');
    expect(text).not.toContain('Indicadores');
    expect(text).not.toContain('Reporte diario');
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

  it('un rol STAGE ve lo del cliente + la próxima entrega (Compras, Facturas), pero no los módulos internos', () => {
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
    expect(text).toContain('Órdenes de Compra');
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
    expect(text).toContain('Tablero de fabricación');
    // internos ocultos
    expect(text).not.toContain('Inicio');
    expect(text).not.toContain('Despachos');
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
});
