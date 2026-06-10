import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { FabricacionTableroComponent } from './tablero.component';

describe('FabricacionTableroComponent', () => {
  it('agrupa pares por célula y separa terminados', () => {
    TestBed.configureTestingModule({
      imports: [FabricacionTableroComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(FabricacionTableroComponent);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('http://localhost:3001/fabricacion/tablero').flush([
      { id: 1, codigo: 'OF5-0001', celulaActual: 'CORTE', estado: 'EN_PROCESO', talla: { valor: 38 }, of: { consecutivo: 5 } },
      { id: 2, codigo: 'OF5-0002', celulaActual: 'GUARNICION', estado: 'EN_PROCESO', talla: { valor: 39 }, of: { consecutivo: 5 } },
      { id: 3, codigo: 'OF5-0003', celulaActual: 'PT', estado: 'TERMINADO', talla: { valor: 40 }, of: { consecutivo: 5 } },
    ]);
    fixture.detectChanges();
    const comp = fixture.componentInstance;
    expect(comp.porCelula()['CORTE'].length).toBe(1);
    expect(comp.porCelula()['GUARNICION'].length).toBe(1);
    expect(comp.terminados().length).toBe(1);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('OF5-0001');
    expect(text).toContain('Terminados');
    http.verify();
  });

  it('muestra error si el tablero no carga', () => {
    TestBed.configureTestingModule({
      imports: [FabricacionTableroComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(FabricacionTableroComponent);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('http://localhost:3001/fabricacion/tablero').error(new ProgressEvent('error'));
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No se pudo cargar el tablero');
    http.verify();
  });
});
