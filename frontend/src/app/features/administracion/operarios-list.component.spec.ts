import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { OperariosListComponent } from './operarios-list.component';

const API = 'http://localhost:3001/operarios';

describe('OperariosListComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [OperariosListComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('pide TODOS los operarios, no solo los activos', () => {
    const fixture = TestBed.createComponent(OperariosListComponent);
    fixture.detectChanges();

    const req = http.expectOne(API);
    // Con `soloActivos` no se podría reactivar a quien volvió: no aparecería.
    expect(req.request.params.has('soloActivos')).toBeFalse();
    req.flush([]);
  });

  it('muestra a los retirados con su badge', () => {
    const fixture = TestBed.createComponent(OperariosListComponent);
    fixture.detectChanges();
    http.expectOne(API).flush([
      { id: 1, nombre: 'Ana', celula: 'CORTE', activo: true },
      { id: 2, nombre: 'Luis', celula: 'INYECCION', activo: false },
    ]);
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Ana');
    expect(texto).toContain('Luis');
    expect(texto).toContain('Retirado');
    expect(texto).toContain('Reactivar');
  });

  it('filtra por célula', () => {
    const fixture = TestBed.createComponent(OperariosListComponent);
    fixture.detectChanges();
    http.expectOne(API).flush([]);

    fixture.componentInstance.filtrar('GUARNICION');

    const req = http.expectOne((r) => r.url === API && r.params.get('celula') === 'GUARNICION');
    req.flush([]);
  });

  it('crea un operario con nombre y célula', () => {
    const fixture = TestBed.createComponent(OperariosListComponent);
    fixture.detectChanges();
    http.expectOne(API).flush([]);

    const c = fixture.componentInstance;
    c.abrirNuevo();
    c.nombre = '  Ana  ';
    c.celula = 'CORTE';
    c.guardar();

    const req = http.expectOne(API);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ nombre: 'Ana', celula: 'CORTE' });
    req.flush({ id: 1 });
    http.expectOne(API).flush([]);
  });

  it('editar usa PATCH sobre el id, no POST', () => {
    const fixture = TestBed.createComponent(OperariosListComponent);
    fixture.detectChanges();
    http.expectOne(API).flush([]);

    const c = fixture.componentInstance;
    c.abrirEditar({ id: 4, nombre: 'Ana', celula: 'CORTE', activo: true });
    c.celula = 'GUARNICION';
    c.guardar();

    const req = http.expectOne(`${API}/4`);
    expect(req.request.method).toBe('PATCH');
    req.flush({ id: 4 });
    http.expectOne(API).flush([]);
  });

  it('muestra el choque de nombres que reporta el backend', () => {
    const fixture = TestBed.createComponent(OperariosListComponent);
    fixture.detectChanges();
    http.expectOne(API).flush([]);

    const c = fixture.componentInstance;
    c.abrirNuevo();
    c.nombre = 'Ana';
    c.guardar();

    http.expectOne(API).flush(
      { message: 'Ya hay un operario "Ana" en CORTE' },
      { status: 409, statusText: 'Conflict' },
    );
    expect(c.error()).toContain('Ya hay un operario');
  });

  it('no llama a la API si el nombre va vacío', () => {
    const fixture = TestBed.createComponent(OperariosListComponent);
    fixture.detectChanges();
    http.expectOne(API).flush([]);

    const c = fixture.componentInstance;
    c.abrirNuevo();
    c.nombre = '   ';
    c.guardar();

    expect(c.error()).toContain('obligatorio');
    http.expectNone(API);
  });
});
