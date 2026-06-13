import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DashboardApi } from './dashboard.api';

describe('DashboardApi', () => {
  let api: DashboardApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [DashboardApi, provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(DashboardApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('resumen hace GET /dashboard', () => {
    api.resumen().subscribe();
    const req = http.expectOne('http://localhost:3001/dashboard');
    expect(req.request.method).toBe('GET');
    req.flush({});
  });
});
