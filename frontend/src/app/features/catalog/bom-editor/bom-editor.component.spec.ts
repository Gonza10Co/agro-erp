import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { BomEditorComponent } from './bom-editor.component';

const BASE = 'http://localhost:3001/catalog';

const rutaMock = { snapshot: { paramMap: { get: () => '1' } } } as unknown as ActivatedRoute;

function cargar(http: HttpTestingController) {
  http.expectOne(`${BASE}/referencias/1/config`).flush({
    referencia: { id: 1, codigo: '101', nombreInterno: 'PODEROSA', tallaMin: 38, tallaMax: 40 },
    marcas: [], ejes: [],
  });
  http.expectOne(`${BASE}/tallas`).flush([
    { id: 10, valor: 38, orden: 38 }, { id: 11, valor: 39, orden: 39 },
    { id: 12, valor: 40, orden: 40 }, { id: 13, valor: 41, orden: 41 },
  ]);
  http.expectOne(`${BASE}/materiales`).flush([
    { id: 30, codigo: 'SUELA', nombreCanonico: 'Suela base', origen: 'COMPRADO', unidad: 'PAR' },
    { id: 31, codigo: 'MICRO', nombreCanonico: 'Micropiel', origen: 'COMPRADO', unidad: 'M' },
  ]);
  http.expectOne(`${BASE}/bom/1/versiones`).flush([
    {
      id: 9, version: 2, activo: true, vigenteDesde: '2026-01-01',
      lineas: [
        { id: 1, materialId: 30, claseConsumo: 'FIJO', consumoFijo: '1', mermaPct: null, lineasTalla: [] },
      ],
    },
  ]);
}

describe('BomEditorComponent', () => {
  let http: HttpTestingController;
  function crear() {
    TestBed.configureTestingModule({
      imports: [BomEditorComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: rutaMock },
      ],
    });
    const fixture = TestBed.createComponent(BomEditorComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges(); // ngOnInit
    return fixture;
  }
  afterEach(() => http.verify());

  it('carga la referencia, tallas en rango y las líneas de la versión activa', () => {
    const fixture = crear();
    cargar(http);
    const cmp = fixture.componentInstance;
    expect(cmp.ref()?.codigo).toBe('101');
    expect(cmp.tallas().map((t) => t.valor)).toEqual([38, 39, 40]); // 41 queda fuera de rango
    expect(cmp.versionActiva()).toBe(2);
    expect(cmp.lineas().length).toBe(1);
    expect(cmp.lineas()[0].consumoFijo).toBe(1);
  });

  it('guardar arma el payload y hace POST /catalog/bom/version', () => {
    const fixture = crear();
    cargar(http);
    const cmp = fixture.componentInstance;
    cmp.guardar();
    const req = http.expectOne(`${BASE}/bom/version`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      referenciaId: 1,
      lineas: [{ materialId: 30, claseConsumo: 'FIJO', mermaPct: undefined, consumoFijo: 1 }],
    });
    req.flush({ id: 10, version: 3, activo: true, vigenteDesde: '', lineas: [] });
    expect(cmp.versionActiva()).toBe(3);
    expect(cmp.okMsg()).toContain('v3');
  });

  it('una línea nueva CURVA sin tallas no se aplica', () => {
    const fixture = crear();
    cargar(http);
    const cmp = fixture.componentInstance;
    cmp.abrirNueva();
    cmp.setBorrador('materialId', 31);
    cmp.setClase('CURVA');
    cmp.aplicarLinea();
    expect(cmp.errorDrawer()).toBeTruthy();
    expect(cmp.lineas().length).toBe(1); // sigue solo la original
  });

  it('aplica una línea CURVA válida con tallas', () => {
    const fixture = crear();
    cargar(http);
    const cmp = fixture.componentInstance;
    cmp.abrirNueva();
    cmp.setBorrador('materialId', 31);
    cmp.setClase('CURVA');
    cmp.setTalla(10, 0.1);
    cmp.aplicarLinea();
    expect(cmp.lineas().length).toBe(2);
    expect(cmp.drawerAbierto()).toBe(false);
  });
});
