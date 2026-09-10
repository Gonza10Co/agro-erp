import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ReferenciasListComponent } from './referencias-list.component';

describe('ReferenciasListComponent', () => {
  let http: HttpTestingController;
  const refsUrl = 'http://localhost:3001/catalog/referencias-abm';
  const tallasUrl = 'http://localhost:3001/catalog/tallas';

  function setup() {
    TestBed.configureTestingModule({
      imports: [ReferenciasListComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.createComponent(ReferenciasListComponent);
  }

  afterEach(() => http.verify());

  it('al iniciar hace GET referencias-abm y GET tallas (para el form)', () => {
    const fixture = setup();
    fixture.detectChanges();

    const reqRefs = http.expectOne(refsUrl);
    expect(reqRefs.request.method).toBe('GET');
    reqRefs.flush([{ id: 1, codigo: 'R1', nombreInterno: 'Bota', activo: true }]);

    const reqTallas = http.expectOne(tallasUrl);
    expect(reqTallas.request.method).toBe('GET');
    reqTallas.flush([{ id: 10, valor: 35, orden: 1 }, { id: 11, valor: 36, orden: 2 }]);

    expect(fixture.componentInstance.referencias().length).toBe(1);
    expect(fixture.componentInstance.tallas().length).toBe(2);
    expect(fixture.componentInstance.cargando()).toBe(false);
  });

  it('crear hace POST /catalog/referencias-abm con el dto y recarga', () => {
    const fixture = setup();
    fixture.detectChanges();

    http.expectOne(refsUrl).flush([]);
    http.expectOne(tallasUrl).flush([{ id: 10, valor: 35, orden: 1 }, { id: 11, valor: 36, orden: 2 }]);

    const cmp = fixture.componentInstance;
    cmp.codigo = 'R1';
    cmp.nombreInterno = 'Bota';
    cmp.tallaMinId = 10;
    cmp.tallaMaxId = 11;
    cmp.guardar();

    const reqPost = http.expectOne(refsUrl);
    expect(reqPost.request.method).toBe('POST');
    expect(reqPost.request.body).toEqual({ codigo: 'R1', nombreInterno: 'Bota', tallaMinId: 10, tallaMaxId: 11 });
    reqPost.flush({ id: 1 });

    // recarga tras crear
    const reqReload = http.expectOne(refsUrl);
    expect(reqReload.request.method).toBe('GET');
    reqReload.flush([]);

    expect(cmp.drawerAbierto()).toBe(false);
  });

  it('muestra las piezas por par del despiece, o un guion si la referencia no lo informa', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne(refsUrl).flush([
      { id: 1, codigo: '101', nombreInterno: 'PODEROSA', activo: true, piezasPorPar: 28 },
      { id: 2, codigo: '109', nombreInterno: 'NUEVA', activo: true, piezasPorPar: null },
    ]);
    http.expectOne(tallasUrl).flush([]);
    fixture.detectChanges();
    const celdas = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('td.num')).map((c) => c.textContent?.trim());
    expect(celdas).toEqual(['28', '—']);
  });

  it('el alta manda piezasPorPar solo cuando se diligenció', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne(refsUrl).flush([]);
    http.expectOne(tallasUrl).flush([{ id: 10, valor: 35, orden: 1 }, { id: 11, valor: 36, orden: 2 }]);
    const cmp = fixture.componentInstance;
    cmp.codigo = '107'; cmp.nombreInterno = 'Nueva'; cmp.tallaMinId = 10; cmp.tallaMaxId = 11; cmp.piezasPorPar = 28;
    cmp.guardar();
    const req = http.expectOne(refsUrl);
    expect(req.request.body.piezasPorPar).toBe(28);
    req.flush({ id: 3 });
    http.expectOne(refsUrl).flush([]);
  });

  it('abrir() y cerrar() controlan el drawer', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne(refsUrl).flush([]);
    http.expectOne(tallasUrl).flush([]);

    const cmp = fixture.componentInstance;
    expect(cmp.drawerAbierto()).toBe(false);
    cmp.abrir();
    expect(cmp.drawerAbierto()).toBe(true);
    cmp.cerrar();
    expect(cmp.drawerAbierto()).toBe(false);
  });
});
