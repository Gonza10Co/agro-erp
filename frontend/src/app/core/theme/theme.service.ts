import { Injectable, signal } from '@angular/core';

export type Theme = 'light' | 'dark';
const KEY = 'agro-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(this.read());

  constructor() {
    this.apply(this.theme());
  }

  toggle(): void {
    const next: Theme = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    this.apply(next);
    try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
  }

  private read(): Theme {
    try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
  }

  private apply(t: Theme): void {
    const el = document.documentElement;
    if (t === 'dark') el.setAttribute('data-theme', 'dark');
    else el.removeAttribute('data-theme');
  }
}
