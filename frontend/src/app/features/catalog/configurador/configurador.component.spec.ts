import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ConfiguradorComponent } from './configurador.component';
import { ReferenciaConfig } from '../../../core/api/models/catalogo.models';

const BASE = 'http://localhost:3001/catalog';
const CONFIG: ReferenciaConfig = {
  referencia: { id: 1, codigo: '101', nombreInterno: 'PODEROSA base', tallaMin: 38, tallaMax: 46 },
  marcas: [{ id: 5, codigo: 'PODEROSA', nombre: 'Poderosa', tipo: 'PROPIA' }],
  ejes: [{ grupo: { id: 1, codigo: 'COLOR', nombre: 'Color', obligatorio: true }, opciones: [{ id: 8, codigo: 'CAFE', nombre: 'Café' }] }],
};

describe('ConfiguradorComponent', () => {
  let http: HttpTestingController;
  function crear() {
    TestBed.configureTestingModule({
      imports: [ConfiguradorComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(ConfiguradorComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges(); // ngOnInit
    return fixture;
  }
  afterEach(() => http.verify());

  it('pide las referencias al iniciar', () => {
    const fixture = crear();
    const req = http.expectOne(`${BASE}/referencias`);
    expect(req.request.method).toBe('GET');
    req.flush([{ id: 1, codigo: '101', nombreInterno: 'PODEROSA base' }]);
  });

  it('al elegir referencia carga su config y fija la talla mínima', () => {
    const fixture = crear();
    http.expectOne(`${BASE}/referencias`).flush([{ id: 1, codigo: '101', nombreInterno: 'PODEROSA base' }]);
    const cmp = fixture.componentInstance;
    cmp.elegirReferencia({ id: 1, codigo: '101', nombreInterno: 'PODEROSA base' });
    http.expectOne(`${BASE}/referencias/1/config`).flush(CONFIG);
    expect(cmp.tallaSel()).toBe(38);
    expect(cmp.faltantes()).toEqual(['Color']);
  });

  it('con la selección completa dispara resolve y guarda el resultado', fakeAsync(() => {
    const fixture = crear();
    http.expectOne(`${BASE}/referencias`).flush([{ id: 1, codigo: '101', nombreInterno: 'PODEROSA base' }]);
    const cmp = fixture.componentInstance;
    cmp.elegirReferencia({ id: 1, codigo: '101', nombreInterno: 'PODEROSA base' });
    http.expectOne(`${BASE}/referencias/1/config`).flush(CONFIG);
    cmp.setOpcion(1, 8);
    tick(150);
    const req = http.expectOne((r) => r.url === `${BASE}/bom/resolve`);
    expect(req.request.params.get('referenciaId')).toBe('1');
    expect(req.request.params.get('talla')).toBe('38');
    expect(req.request.params.getAll('opcionIds')).toEqual(['8']);
    req.flush({ arbol: [{ materialId: 1, codigo: 'X', nombre: 'X', unidad: 'M', origen: 'COMPRADO', consumo: 0.1, hijos: [] }], comprados: [] });
    expect(cmp.resultado()?.arbol.length).toBe(1);
  }));
});
