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
