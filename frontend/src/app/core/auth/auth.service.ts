import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, finalize, map, shareReplay, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

interface Tokens { accessToken: string; refreshToken: string; }

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  get accessToken(): string | null {
    return localStorage.getItem('accessToken');
  }

  isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  rol(): string | null {
    const t = this.accessToken;
    if (!t) return null;
    try {
      const payload = JSON.parse(atob(t.split('.')[1]));
      return payload.role ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Id del usuario en sesión (`sub` del JWT). Lo usa el ABM para no ofrecerle
   * a alguien desactivarse a sí mismo — el backend lo rechaza igual, pero
   * mostrar un botón que siempre falla es peor que no mostrarlo.
   */
  userId(): number | null {
    const t = this.accessToken;
    if (!t) return null;
    try {
      const payload = JSON.parse(atob(t.split('.')[1]));
      return payload.sub ?? null;
    } catch {
      return null;
    }
  }

  usuario(): { username: string; role: string } | null {
    const t = this.accessToken;
    if (!t) return null;
    try {
      const p = JSON.parse(atob(t.split('.')[1]));
      return { username: p.username ?? '', role: p.role ?? '' };
    } catch {
      return null;
    }
  }

  login(username: string, password: string): Observable<Tokens> {
    return this.http.post<Tokens>(`${this.apiUrl}/auth/login`, { username, password }).pipe(
      tap((tokens) => {
        localStorage.setItem('accessToken', tokens.accessToken);
        localStorage.setItem('refreshToken', tokens.refreshToken);
      }),
    );
  }

  /** Renovación en vuelo: si varios pistolazos rebotan a la vez, todos esperan la misma. */
  private renovando: Observable<string> | null = null;

  /**
   * Cambia el refresh token guardado por un par nuevo y devuelve el access token.
   * Lo usa el interceptor ante un 401: así la tablet de la estación nunca vuelve
   * al login mientras se use al menos una vez por semana.
   */
  renovar(): Observable<string> {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return throwError(() => new Error('Sin refresh token'));
    if (!this.renovando) {
      this.renovando = this.http.post<Tokens>(`${this.apiUrl}/auth/refresh`, { refreshToken }).pipe(
        tap((tokens) => {
          localStorage.setItem('accessToken', tokens.accessToken);
          localStorage.setItem('refreshToken', tokens.refreshToken);
        }),
        map((tokens) => tokens.accessToken),
        finalize(() => (this.renovando = null)),
        shareReplay(1),
      );
    }
    return this.renovando;
  }

  logout(): void {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }
}
