import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { TableroOrdenesComponent } from './tablero-ordenes.component';
import { environment } from '../../../environments/environment';

const BASE = `${environment.apiUrl}/fabricacion`;

function setup() {
  TestBed.configureTestingModule({
    imports: [TableroOrdenesComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const fixture = TestBed.createComponent(TableroOrdenesComponent);
  const http = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  http.expectOne(`${BASE}/tablero-ordenes`).flush({
    estaciones: [
      { codigo: 'PREPARACION', nombre: 'Preparación', orden: 1, celula: 'GUARNICION', subPaso: 'PREPARACION', subPasoInyeccion: null, activa: true },
      { codigo: 'BODEGA_CORTE', nombre: 'Bodega de corte', orden: 3, celula: 'ALMACEN', subPaso: null, subPasoInyeccion: null, activa: true },
    ],
    ordenes: [{
      id: 16, consecutivo: 1, estado: 'EN_PROCESO', fecha: '2026-09-09', op: 1, oc: 1, cliente: 'Cliente prueba', linea: 'Basarili',
      productos: ['Bota Poderosa 101'], programado: 1206, nacidos: 5, terminados: 1,
      porEstacion: { PREPARACION: 5, BODEGA_CORTE: 2 },
      programa: [{ productoConfiguradoId: 1, producto: 'Bota Poderosa 101', productoCodigo: 'PC', tallaId: 3, talla: '40', programado: 346, nacidos: 3, terminados: 1 }],
    }],
  });
  fixture.detectChanges();
  return { fixture, http };
}

describe('TableroOrdenesComponent', () => {
  it('una fila por OF y una columna por estación con pasados/programados', () => {
    const { fixture, http } = setup();
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('OF-1');
    expect(texto).toContain('Bodega de corte');
    expect(texto).toContain('1206');
    expect(fixture.componentInstance.pct(603, 1206)).toBe(50);
    http.verify();
  });

  it('al abrir una orden muestra el desglose por talla', () => {
    const { fixture, http } = setup();
    fixture.componentInstance.toggle(16);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('346');
    http.verify();
  });

  it('el buscador navega a la ficha del par', () => {
    const { fixture, http } = setup();
    const router = TestBed.inject(Router);
    const nav = spyOn(router, 'navigate').and.resolveTo(true);
    fixture.componentInstance.codigoBuscar = ' OF1-0004 ';
    fixture.componentInstance.buscarPar(new Event('submit'));
    expect(nav).toHaveBeenCalledWith(['/fabricacion/par', 'OF1-0004']);
    http.verify();
  });
});
