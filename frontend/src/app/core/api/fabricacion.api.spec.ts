import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FabricacionApi } from './fabricacion.api';
import { environment } from '../../../environments/environment';

describe('FabricacionApi', () => {
  let api: FabricacionApi;
  let httpMock: HttpTestingController;
  const base = environment.apiUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FabricacionApi, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(FabricacionApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('generarOF hace POST a /fabricacion/of con opId', () => {
    api.generarOF(100).subscribe();
    const req = httpMock.expectOne(`${base}/fabricacion/of`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ opId: 100 });
    req.flush({ id: 1, consecutivo: 5, opId: 100, totalPares: 12 });
  });

  it('avanzar hace POST con operario y máquina', () => {
    api.avanzar('OF5-0001', 3, 4).subscribe();
    const req = httpMock.expectOne(`${base}/fabricacion/par/OF5-0001/avanzar`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ operarioId: 3, maquinaId: 4 });
    req.flush({});
  });

  it('tablero filtra por ofId', () => {
    api.tablero(1).subscribe();
    const req = httpMock.expectOne(`${base}/fabricacion/tablero?ofId=1`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('operarios filtra por célula', () => {
    api.operarios('CORTE').subscribe();
    const req = httpMock.expectOne(`${base}/fabricacion/operarios?celula=CORTE`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });
});
