import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { LoginComponent } from './login.component';

function setup(expired: string | null) {
  TestBed.configureTestingModule({
    imports: [LoginComponent],
    providers: [
      provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(expired ? { expired } : {}) } } },
    ],
  });
  return TestBed.createComponent(LoginComponent);
}

describe('LoginComponent', () => {
  it('se crea', () => {
    const fixture = setup(null);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('muestra el aviso de sesión expirada cuando ?expired=1', () => {
    const fixture = setup('1');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Tu sesión expiró');
  });

  it('no muestra el aviso sin el query param', () => {
    const fixture = setup(null);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Tu sesión expiró');
  });
});
