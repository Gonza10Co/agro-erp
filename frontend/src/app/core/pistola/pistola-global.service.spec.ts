import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { ToastService } from '../notificaciones/toast.service';
import { CLAVE_CONFIG } from '../../features/fabricacion/config-estacion';
import { PistolaGlobalService } from './pistola-global.service';

describe('PistolaGlobalService', () => {
  let svc: PistolaGlobalService;
  let httpMock: HttpTestingController;
  let toast: ToastService;
  let router: { url: string };
  const URL = 'http://localhost:3001/fabricacion/par/OF19-0011/avanzar';

  function disparar(texto: string, doc: Document = document): KeyboardEvent {
    let t = 1000;
    let ultimo!: KeyboardEvent;
    for (const k of [...texto, 'Enter']) {
      t += 10;
      ultimo = { key: k, timeStamp: t, ctrlKey: false, metaKey: false, altKey: false, preventDefault: jasmine.createSpy('pd') } as any;
      svc.alTeclear(ultimo, doc);
    }
    return ultimo;
  }

  beforeEach(() => {
    router = { url: '/fabricacion/tablero' };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: router },
        { provide: AuthService, useValue: { isAuthenticated: () => true } },
      ],
    });
    svc = TestBed.inject(PistolaGlobalService);
    httpMock = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
    localStorage.setItem(CLAVE_CONFIG, JSON.stringify({ estacion: 'MONTAJE', operarioId: 3 }));
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.removeItem(CLAVE_CONFIG);
  });

  it('desde otra pantalla registra el par con la estación de la tablet y avisa en verde', () => {
    const enter = disparar('OF19-0011');
    expect(enter.preventDefault).toHaveBeenCalled();
    const req = httpMock.expectOne(URL);
    expect(req.request.body).toEqual({ operarioId: 3, estacion: 'MONTAJE' });
    req.flush({ codigo: 'OF19-0011', avance: { nombre: 'Inyección · Montaje', terminado: false, hoy: 12, calidad: 'PRIMERA' } });
    const t = toast.toasts()[0];
    expect(t.tipo).toBe('exito');
    expect(t.mensaje).toContain('OF19-0011 → Inyección · Montaje');
    expect(t.detalle).toContain('van 12 hoy');
  });

  it('el par repetido sale en amarillo', () => {
    disparar('OF19-0011');
    httpMock.expectOne(URL).flush(
      { message: 'Este par ya está registrado en Inyección · Montaje', motivo: 'REPETIDO' },
      { status: 409, statusText: 'Conflict' },
    );
    expect(toast.toasts()[0].tipo).toBe('alerta');
  });

  it('un error real sale en rojo y se queda hasta tocarlo', () => {
    disparar('OF19-0011');
    httpMock.expectOne(URL).flush({ message: 'Este par viene de Preparación' }, { status: 409, statusText: 'Conflict' });
    const t = toast.toasts()[0];
    expect(t.tipo).toBe('error');
    expect(t.fijo).toBeTrue();
    expect(t.mensaje).toContain('NO quedó registrado');
  });

  it('en la pantalla de estación no hace nada (ella maneja su pistolazo)', () => {
    router.url = '/fabricacion/estacion';
    disparar('OF19-0011');
    httpMock.expectNone(URL);
  });

  it('con el foco en un campo de texto deja que la pistola escriba ahí', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    disparar('OF19-0011');
    httpMock.expectNone(URL);
    input.remove();
  });

  it('sin estación configurada avisa en rojo sin llamar al servidor', () => {
    localStorage.removeItem(CLAVE_CONFIG);
    disparar('OF19-0011');
    httpMock.expectNone(URL);
    expect(toast.toasts()[0].mensaje).toContain('no tiene estación');
  });
});
