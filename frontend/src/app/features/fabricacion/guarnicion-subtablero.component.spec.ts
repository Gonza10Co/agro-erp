import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { provideRouter } from '@angular/router';
import { GuarnicionSubtableroComponent } from './guarnicion-subtablero.component';

describe('GuarnicionSubtableroComponent', () => {
  let http: HttpTestingController;
  const base = 'http://localhost:3001';

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [GuarnicionSubtableroComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ ofId: '7' }) } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('agrupa los pares de Guarnición por sub-paso en 9 columnas', () => {
    const fixture = TestBed.createComponent(GuarnicionSubtableroComponent);
    fixture.detectChanges();
    http.expectOne(`${base}/fabricacion/tablero?ofId=7`).flush([
      { id: 1, codigo: 'OF1-0001', celulaActual: 'GUARNICION', subPasoActual: 'ARMADO', estado: 'EN_PROCESO', talla: { valor: '38' }, of: { consecutivo: 1 } },
      { id: 2, codigo: 'OF1-0002', celulaActual: 'GUARNICION', subPasoActual: 'STROBEL', estado: 'EN_PROCESO', talla: { valor: '40' }, of: { consecutivo: 1 } },
      { id: 3, codigo: 'OF1-0003', celulaActual: 'CORTE', subPasoActual: null, estado: 'EN_PROCESO', talla: { valor: '38' }, of: { consecutivo: 1 } },
    ]);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    // las 9 columnas de sub-paso presentes
    expect(el.textContent).toContain('Armado');
    expect(el.textContent).toContain('Strobel');
    expect(el.textContent).toContain('Amarre');
    // los pares de Guarnición aparecen; el de CORTE no
    expect(el.textContent).toContain('OF1-0001');
    expect(el.textContent).toContain('OF1-0002');
    expect(el.textContent).not.toContain('OF1-0003');
  });

  it('muestra error si el endpoint falla', () => {
    const fixture = TestBed.createComponent(GuarnicionSubtableroComponent);
    fixture.detectChanges();
    http.expectOne(`${base}/fabricacion/tablero?ofId=7`).flush('x', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No se pudo');
  });
});
