import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { OfListComponent } from './of-list.component';

describe('OfListComponent', () => {
  it('lista las OF con su OP, conteo de pares y badge de estado', () => {
    TestBed.configureTestingModule({
      imports: [OfListComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(OfListComponent);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('http://localhost:3001/fabricacion/of').flush([
      { id: 1, consecutivo: 5, estado: 'TERMINADA', fecha: '2026-06-07', op: { consecutivo: 9005 }, _count: { pares: 12 } },
    ]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('OF-5');
    expect(el.textContent).toContain('OP-9005');
    expect(el.textContent).toContain('12');
    expect(el.querySelector('.badge-accent')).toBeTruthy(); // TERMINADA resalta
    http.verify();
  });
});
