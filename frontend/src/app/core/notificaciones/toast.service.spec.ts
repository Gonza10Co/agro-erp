import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ToastService);
  });

  it('error() agrega un toast de tipo error con el mensaje', () => {
    service.error('Algo falló');
    const ts = service.toasts();
    expect(ts.length).toBe(1);
    expect(ts[0].tipo).toBe('error');
    expect(ts[0].mensaje).toBe('Algo falló');
  });

  it('asigna ids únicos a cada toast', () => {
    service.exito('a');
    service.info('b');
    const [t1, t2] = service.toasts();
    expect(t1.id).not.toBe(t2.id);
  });

  it('cerrar() quita el toast por id', () => {
    service.error('x');
    const id = service.toasts()[0].id;
    service.cerrar(id);
    expect(service.toasts().length).toBe(0);
  });

  it('auto-descarta el toast tras su duración', fakeAsync(() => {
    service.exito('ok');
    expect(service.toasts().length).toBe(1);
    tick(4000);
    expect(service.toasts().length).toBe(0);
  }));
});
