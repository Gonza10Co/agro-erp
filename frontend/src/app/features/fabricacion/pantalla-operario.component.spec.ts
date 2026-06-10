import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PantallaOperarioComponent } from './pantalla-operario.component';
import { AuthService } from '../../core/auth/auth.service';

const BASE = 'http://localhost:3001/fabricacion';
const CALIDAD = 'http://localhost:3001/calidad';

function setup() {
  TestBed.configureTestingModule({
    imports: [PantallaOperarioComponent],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(PantallaOperarioComponent);
  const http = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  http.expectOne(`${BASE}/operarios?celula=CORTE`).flush([{ id: 1, nombre: 'Pedro', celula: 'CORTE', activo: true }]);
  http.expectOne(`${BASE}/maquinas?celula=CORTE`).flush([{ id: 2, codigo: 'M1', nombre: 'Cortadora', celula: 'CORTE', activo: true }]);
  fixture.detectChanges();
  return { fixture, http };
}

/** Como `puedeBaja` se calcula al construir el componente, hay que fijar el rol ANTES de crearlo. */
function setupReporte(rol: string) {
  TestBed.configureTestingModule({
    imports: [PantallaOperarioComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AuthService, useValue: { rol: () => rol } },
    ],
  });
  const fixture = TestBed.createComponent(PantallaOperarioComponent);
  const http = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  http.expectOne(`${BASE}/operarios?celula=CORTE`).flush([{ id: 1, nombre: 'Pedro', celula: 'CORTE', activo: true }]);
  http.expectOne(`${BASE}/maquinas?celula=CORTE`).flush([{ id: 2, codigo: 'M1', nombre: 'Cortadora', celula: 'CORTE', activo: true }]);
  fixture.detectChanges();
  return { fixture, http };
}

const TIPOS = [
  { id: 4, codigo: 'STROBEL-RASGADO', nombre: 'Strobel rasgado', celulaCausante: 'GUARNICION', clase: 'REPROCESO' },
  { id: 8, codigo: 'DANO-ROBOT', nombre: 'Daño de robot en capellada', celulaCausante: 'INYECCION', clase: 'BAJA' },
];

function parInyeccion(estado: 'EN_PROCESO' | 'TERMINADO') {
  return {
    id: 1, codigo: 'OF1-0001', celulaActual: 'INYECCION', estado,
    of: { consecutivo: 1 }, talla: { valor: '38' },
    eventos: [], incidencias: [], reponeA: null, repuestoPor: null,
  };
}

function buscarPar(fixture: ReturnType<typeof setupReporte>['fixture'], http: HttpTestingController, estado: 'EN_PROCESO' | 'TERMINADO') {
  const comp = fixture.componentInstance;
  comp.codigo = 'OF1-0001';
  comp.buscar();
  http.expectOne(`${BASE}/par/OF1-0001`).flush(parInyeccion(estado));
  fixture.detectChanges();
}

function botonPorTexto(fixture: { nativeElement: HTMLElement }, texto: string): HTMLButtonElement | undefined {
  const botones = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
  return botones.find((b) => (b.textContent ?? '').includes(texto));
}

describe('PantallaOperarioComponent', () => {
  it('busca un par y permite avanzarlo', () => {
    const { fixture, http } = setup();
    const comp = fixture.componentInstance;
    comp.codigo = 'OF5-0001';
    comp.buscar();
    http.expectOne(`${BASE}/par/OF5-0001`).flush({
      id: 9, codigo: 'OF5-0001', estado: 'EN_PROCESO', celulaActual: 'CORTE',
      of: { consecutivo: 5 }, talla: { valor: 38 }, eventos: [],
    });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('OF5-0001');

    comp.avanzar(comp.par()!);
    http.expectOne(`${BASE}/par/OF5-0001/avanzar`).flush({});
    fixture.detectChanges();
    expect(comp.msg()).toContain('avanzado');
    expect(comp.codigo).toBe('');
    http.verify();
  });

  it('ante corte de red muestra mensaje de conexión y conserva el código para reintentar', () => {
    const { fixture, http } = setup();
    const comp = fixture.componentInstance;
    comp.codigo = 'OF5-0001';
    comp.buscar();
    http.expectOne(`${BASE}/par/OF5-0001`).error(new ProgressEvent('error'), { status: 0 });
    expect(comp.esError()).toBeTrue();
    expect(comp.msg()).toContain('conexión');
    expect(comp.codigo).toBe('OF5-0001');
    http.verify();
  });

  it('avanzar sin operario/máquina muestra aviso sin llamar a la API', () => {
    const { fixture, http } = setup();
    const comp = fixture.componentInstance;
    comp.operarioId = undefined;
    comp.maquinaId = undefined;
    comp.par.set({
      id: 9, codigo: 'OF5-0001', estado: 'EN_PROCESO', celulaActual: 'CORTE',
      of: { consecutivo: 5 }, talla: { valor: 38 }, eventos: [],
    } as never);
    comp.avanzar(comp.par()!);
    expect(comp.esError()).toBeTrue();
    expect(comp.msg()).toContain('Seleccioná operario');
    http.verify(); // ningún POST debe haberse emitido
  });

  it('si la API de catálogos falla, limpia operario/máquina y avisa', () => {
    TestBed.configureTestingModule({
      imports: [PantallaOperarioComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(PantallaOperarioComponent);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne(`${BASE}/operarios?celula=CORTE`).error(new ProgressEvent('error'), { status: 0 });
    http.expectOne(`${BASE}/maquinas?celula=CORTE`).error(new ProgressEvent('error'), { status: 0 });
    const comp = fixture.componentInstance;
    expect(comp.operarioId).toBeUndefined();
    expect(comp.maquinaId).toBeUndefined();
    expect(comp.esError()).toBeTrue();
    http.verify();
  });
});

describe('reporte de daño', () => {
  it('muestra "Reportar daño" solo con par EN_PROCESO', () => {
    const { fixture, http } = setupReporte('GERENTE');
    buscarPar(fixture, http, 'EN_PROCESO');
    expect(botonPorTexto(fixture, 'Reportar daño')).toBeDefined();
    http.verify();

    // mismo par pero TERMINADO: el botón no debe existir
    const comp = fixture.componentInstance;
    comp.codigo = 'OF1-0001';
    comp.buscar();
    http.expectOne(`${BASE}/par/OF1-0001`).flush(parInyeccion('TERMINADO'));
    fixture.detectChanges();
    expect(botonPorTexto(fixture, 'Reportar daño')).toBeUndefined();
    http.verify();
  });

  it('REPROCESO: postea sin pedir descripción y confirma', () => {
    const { fixture, http } = setupReporte('GERENTE');
    buscarPar(fixture, http, 'EN_PROCESO');
    const comp = fixture.componentInstance;

    botonPorTexto(fixture, 'Reportar daño')!.click();
    http.expectOne(`${CALIDAD}/tipos-dano`).flush(TIPOS);
    comp.tipoDanoId = 4;
    fixture.detectChanges();

    const operarioId = comp.operarioId;
    expect(operarioId).toBeDefined();

    botonPorTexto(fixture, 'Registrar reproceso')!.click();
    const req = http.expectOne(`${CALIDAD}/pares/OF1-0001/incidencias`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.tipoDanoId).toBe(4);
    expect(req.request.body.operarioId).toBe(operarioId);
    expect(req.request.body.descripcion).toBeUndefined(); // sin descripción en reproceso
    req.flush({ incidencia: { id: 1, tipoDano: TIPOS[0] }, parReposicion: null });
    fixture.detectChanges();

    expect(comp.msg()).toContain('Reproceso registrado');
    http.verify();
  });

  it('BAJA: deshabilita envío sin descripción y muestra reposición al éxito', () => {
    const { fixture, http } = setupReporte('GERENTE');
    buscarPar(fixture, http, 'EN_PROCESO');
    const comp = fixture.componentInstance;

    botonPorTexto(fixture, 'Reportar daño')!.click();
    http.expectOne(`${CALIDAD}/tipos-dano`).flush(TIPOS);
    comp.tipoDanoId = 8;
    comp.descripcion = '';
    fixture.detectChanges();

    expect(botonPorTexto(fixture, 'Dar de baja')!.disabled).toBeTrue();

    comp.descripcion = 'robot dañó capellada';
    fixture.detectChanges();
    const boton = botonPorTexto(fixture, 'Dar de baja')!;
    expect(boton.disabled).toBeFalse();
    boton.click();
    http.expectOne(`${CALIDAD}/pares/OF1-0001/incidencias`).flush({
      incidencia: { id: 1, tipoDano: TIPOS[1] },
      parReposicion: { codigo: 'OF1-0001-R1' },
    });
    fixture.detectChanges();

    expect(comp.msg()).toContain('OF1-0001-R1');
    http.verify();
  });

  it('BAJA con rol no gerente: botón deshabilitado y aviso', () => {
    const { fixture, http } = setupReporte('VENTAS');
    buscarPar(fixture, http, 'EN_PROCESO');
    const comp = fixture.componentInstance;

    botonPorTexto(fixture, 'Reportar daño')!.click();
    http.expectOne(`${CALIDAD}/tipos-dano`).flush(TIPOS);
    comp.tipoDanoId = 8;
    comp.descripcion = 'x';
    fixture.detectChanges();

    expect(botonPorTexto(fixture, 'Dar de baja')!.disabled).toBeTrue();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Solo un gerente');
    http.verify();
  });
});

describe('sub-pasos de Guarnición', () => {
  function buscarParGuarnicion(
    fixture: ReturnType<typeof setup>['fixture'],
    http: HttpTestingController,
    par: Record<string, unknown>,
  ) {
    const comp = fixture.componentInstance;
    comp.codigo = 'OF1-0001';
    comp.buscar();
    http.expectOne(`${BASE}/par/OF1-0001`).flush(par);
    fixture.detectChanges();
  }

  const EN_PROCESO_BASE = {
    id: 1, codigo: 'OF1-0001', estado: 'EN_PROCESO',
    of: { consecutivo: 1 }, talla: { valor: '38' },
    eventos: [], incidencias: [], reponeA: null, repuestoPor: null,
  };

  it('en Guarnición · Armado el botón avanza al siguiente sub-paso (Vistas) y el badge muestra el sub-paso', () => {
    const { fixture, http } = setup();
    buscarParGuarnicion(fixture, http, { ...EN_PROCESO_BASE, celulaActual: 'GUARNICION', subPasoActual: 'ARMADO' });

    const boton = botonPorTexto(fixture, 'Avanzar');
    expect(boton).toBeDefined();
    expect(boton!.textContent).toContain('Vistas');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Armado');
    http.verify();
  });

  it('en AMARRE el botón usa la copia de salida a Almacén (capellada)', () => {
    const { fixture, http } = setup();
    buscarParGuarnicion(fixture, http, { ...EN_PROCESO_BASE, celulaActual: 'GUARNICION', subPasoActual: 'AMARRE' });

    const boton = botonPorTexto(fixture, 'Almacén');
    expect(boton).toBeDefined();
    expect(boton!.textContent).toContain('capellada');
    http.verify();
  });

  it('en Corte (sin sub-paso) el botón avanza a Guarnición', () => {
    const { fixture, http } = setup();
    buscarParGuarnicion(fixture, http, { ...EN_PROCESO_BASE, celulaActual: 'CORTE', subPasoActual: null });

    const boton = botonPorTexto(fixture, 'Avanzar');
    expect(boton).toBeDefined();
    expect(boton!.textContent).toContain('Guarnición');
    http.verify();
  });
});
