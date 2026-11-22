import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CommercialReportComponent } from './commercial-report.component';
import { CommercialReport } from '../../../core/api/models/commercial-report.models';

const m = (pairs: number, orders = 1, value = 0, dispatched = 0) => ({ pairs, orders, value, dispatched });

const REPORT: CommercialReport = {
  from: '2026-10-01', to: '2026-11-30', rows: 'client', months: ['2026-10', '2026-11'],
  kpis: { ...m(450, 2, 3_500_000, 340), pending: 110, unpricedPairs: 50, clients: 2 },
  byMonth: [{ month: '2026-10', ...m(150) }, { month: '2026-11', ...m(300) }],
  topClients: [{ key: '2', label: 'Beta', ...m(300) }, { key: '1', label: 'Alfa', ...m(150) }],
  topReferences: [{ key: '101', label: '101', ...m(450) }],
  pivot: {
    rows: [
      { key: '1', label: 'Alfa', cells: { '2026-10': m(150), '2026-11': m(0, 0) }, total: m(150) },
      { key: '2', label: 'Beta', cells: { '2026-10': m(0, 0), '2026-11': m(300) }, total: m(300) },
    ],
    totals: { cells: { '2026-10': m(150), '2026-11': m(300) }, total: m(450, 2, 3_500_000, 340) },
  },
  options: { clients: [{ id: 1, label: 'Alfa' }, { id: 2, label: 'Beta' }], brands: [], references: [], lines: [] },
};

describe('CommercialReportComponent', () => {
  let http: HttpTestingController;

  function setup() {
    TestBed.configureTestingModule({
      imports: [CommercialReportComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(CommercialReportComponent);
    f.detectChanges();
    return f;
  }

  afterEach(() => http.verify());

  it('pide el reporte sin anuladas, pinta KPIs y la tabla dinámica ordenada', () => {
    const f = setup();
    const req = http.expectOne((r) => r.url === 'http://localhost:3001/reports/commercial');
    expect(req.request.params.get('rows')).toBe('client');
    expect(req.request.params.get('statuses')).toBe('BORRADOR,CONFIRMADA,EN_PRODUCCION,CERRADA');
    req.flush(REPORT);
    f.detectChanges();
    const el: HTMLElement = f.nativeElement;
    expect(el.querySelector('.kpis')!.textContent).toContain('450');
    expect(el.textContent).toContain('50 pares sin precio no suman');
    const first = el.querySelector('.pivot tbody tr td')!.textContent!.trim();
    expect(first).toBe('Beta');
    expect(el.querySelectorAll('app-chart').length).toBe(2);
  });

  it('cambiar las filas vuelve a pedir; filtrar por cliente manda el id', () => {
    const f = setup();
    http.expectOne((r) => r.url.endsWith('/reports/commercial')).flush(REPORT);
    f.detectChanges();
    f.componentInstance.setRows('brand');
    expect(http.expectOne((r) => r.url.endsWith('/reports/commercial')).request.params.get('rows')).toBe('brand');
    f.componentInstance.addFilter('clientIds', '2');
    const req = http.expectOne((r) => r.url.endsWith('/reports/commercial'));
    expect(req.request.params.get('clientIds')).toBe('2');
    req.flush(REPORT);
    f.detectChanges();
    expect(f.componentInstance.activeChips()[0].label).toBe('Cliente: Beta');
  });

  it('la medida valor cambia la tabla sin volver a pedir', () => {
    const f = setup();
    http.expectOne((r) => r.url.endsWith('/reports/commercial')).flush(REPORT);
    f.componentInstance.measure.set('orders');
    f.detectChanges();
    expect(f.componentInstance.table()!.grandTotal).toBe(2);
    expect(f.componentInstance.monthChart().type).toBe('bar');
    f.componentInstance.measure.set('value');
    expect(f.componentInstance.monthChart().type).toBe('line');
  });
});
