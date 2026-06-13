import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DespachosListComponent } from './despachos-list.component';

describe('DespachosListComponent', () => {
  let http: HttpTestingController;
  it('lista los despachos al iniciar y los renderiza', () => {
    TestBed.configureTestingModule({
      imports: [DespachosListComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(DespachosListComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('http://localhost:3001/despachos').flush([
      { id: 1, consecutivo: 5, fecha: '2026-06-05', autorizadoPorId: null, op: { consecutivo: 12, oc: { cliente: { nombre: 'Minera El Roble' } } } },
    ]);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('DSP-5');
    expect(text).toContain('Minera El Roble');
    http.verify();
  });
});
