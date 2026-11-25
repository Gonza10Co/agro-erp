import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ProductionByDayComponent, addDays, bogotaTime, longDate } from './production-by-day.component';
import { ProductionByDay, ProductionDayStation } from '../../core/api/models/fabricacion.models';
import { environment } from '../../../environments/environment';

const URL = `${environment.apiUrl}/fabricacion/production-by-day`;

function st(code: string, name: string, over: Partial<ProductionDayStation> = {}): ProductionDayStation {
  return { code, name, active: true, pairs: 0, inferred: 0, firstAt: null, lastAt: null, orders: [], ...over };
}
function day(date: string, stations: ProductionDayStation[]): ProductionByDay {
  return { date, today: '2026-11-25', updatedAt: '2026-11-25T15:30:00Z', stations };
}
const SABADO = day('2026-11-21', [
  st('PREPARACION', 'Preparación', {
    pairs: 1177, inferred: 7, firstAt: '2026-11-21T11:05:00Z', lastAt: '2026-11-22T04:59:00Z',
    orders: [{ ofId: 1, ofNumber: 21, productId: 5, product: 'Bota 101', pairs: 1177, inferred: 7, sizes: [{ sizeId: 3, size: 40, pairs: 1177, inferred: 7 }] }],
  }),
  st('BODEGA_CORTE', 'Bodega de corte', { pairs: 1111 }),
]);

describe('utilidades de producción por día', () => {
  it('addDays cruza mes, año y bisiesto', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
  it('la hora es la de Bogotá aunque en UTC sea otro día', () => {
    expect(bogotaTime('2026-11-22T04:59:00Z')).toBe('23:59');
    expect(bogotaTime('2026-11-21T05:00:00Z')).toBe('00:00');
  });
  it('longDate no corre el día', () => {
    expect(longDate('2026-11-21')).toContain('sábado');
    expect(longDate('2026-11-21')).toContain('21');
  });
});

describe('ProductionByDayComponent', () => {
  let http: HttpTestingController;
  function crear() {
    TestBed.configureTestingModule({
      imports: [ProductionByDayComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(ProductionByDayComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const click = (sel: string) => { (host.querySelector(sel) as HTMLButtonElement).click(); fixture.detectChanges(); };
    const flush = (url: string, body: ProductionByDay) => { http.expectOne(url).flush(body); fixture.detectChanges(); };
    return { fixture, host, click, flush };
  }
  afterEach(() => http?.verify());

  it('arranca en hoy del servidor, sin mandar fecha, y no deja pasar a mañana', () => {
    const { host, flush, click } = crear();
    flush(URL, day('2026-11-25', [st('PREPARACION', 'Preparación', { pairs: 3 })]));
    expect((host.querySelector('input[type=date]') as HTMLInputElement).value).toBe('2026-11-25');
    expect((host.querySelector('.next') as HTMLButtonElement).disabled).toBeTrue();
    expect(host.querySelector('button.hoy')).toBeNull();
    click('.prev');
    flush(`${URL}?date=2026-11-24`, day('2026-11-24', [st('PREPARACION', 'Preparación')]));
    expect((host.querySelector('.next') as HTMLButtonElement).disabled).toBeFalse();
    click('.next');
    flush(`${URL}?date=2026-11-25`, day('2026-11-25', []));
  });

  it('una tarjeta por estación, aclara que es entrada y qué significa Bodega', () => {
    const { host, flush } = crear();
    flush(URL, SABADO);
    expect(host.querySelectorAll('.estacion').length).toBe(2);
    const prep = host.querySelector('[data-station=PREPARACION]')!.textContent!;
    expect(prep).toContain('1177');
    expect(prep).toContain('7 de esos sin pistolazo');
    expect(prep).toContain('06:05');
    expect(prep).toContain('23:59');
    expect(prep).not.toContain('salió de Preparación');
    const bodega = host.querySelector('[data-station=BODEGA_CORTE]')!.textContent!;
    expect(bodega).toContain('1111');
    expect(bodega).toContain('Equivale a lo que salió de Preparación');
    expect(host.querySelector('.nota')!.textContent).toContain('entraron');
  });

  it('si ese día hubo Cierre no dice que Bodega es lo que salió de Preparación', () => {
    const { host, flush } = crear();
    flush(URL, day('2026-11-20', [st('CIERRE', 'Cierre', { active: false, pairs: 2 }), st('BODEGA_CORTE', 'Bodega de corte', { pairs: 2 })]));
    expect(host.textContent).not.toContain('salió de Preparación');
    expect(host.querySelector('[data-station=CIERRE]')!.textContent).toContain('apagada');
  });

  it('despliega y pliega el desglose por orden y talla', () => {
    const { host, flush, click } = crear();
    flush(URL, SABADO);
    expect(host.textContent).not.toContain('OF-21');
    click('.desplegar');
    expect(host.textContent).toContain('OF-21');
    expect(host.textContent).toContain('Bota 101');
    expect(host.querySelector('.talla')!.textContent).toContain('T40');
    click('.desplegar');
    expect(host.textContent).not.toContain('OF-21');
  });

  it('un día sin registros lo dice', () => {
    const { host, flush } = crear();
    flush(URL, day('2026-11-22', [st('PREPARACION', 'Preparación')]));
    expect(host.querySelector('.sin-registros')).not.toBeNull();
    expect(host.querySelector('.desplegar')).toBeNull();
  });

  it('escoger fecha carga ese día; borrarla no pide nada', () => {
    const { host, flush } = crear();
    flush(URL, day('2026-11-25', []));
    const input = host.querySelector('input[type=date]') as HTMLInputElement;
    input.value = '';
    input.dispatchEvent(new Event('change'));
    expect(input.value).toBe('2026-11-25');
    input.value = '2026-11-21';
    input.dispatchEvent(new Event('change'));
    flush(`${URL}?date=2026-11-21`, SABADO);
    expect(host.textContent).toContain('1177');
  });

  it('al pasar días rápido descarta la respuesta vieja', () => {
    const { host, flush, click } = crear();
    flush(URL, day('2026-11-25', []));
    click('.prev');
    const vieja = http.expectOne(`${URL}?date=2026-11-24`);
    click('.prev');
    expect(vieja.cancelled).toBeTrue();
    flush(`${URL}?date=2026-11-23`, day('2026-11-23', []));
    expect((host.querySelector('input[type=date]') as HTMLInputElement).value).toBe('2026-11-23');
  });

  it('si falla muestra el error en vez de los números de otro día', () => {
    const { fixture, host, flush, click } = crear();
    flush(URL, SABADO);
    click('.prev');
    http.expectOne(`${URL}?date=2026-11-20`).flush({ message: 'La fecha no es válida' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
    expect(host.textContent).toContain('La fecha no es válida');
    expect(host.textContent).not.toContain('1177');
  });
});
