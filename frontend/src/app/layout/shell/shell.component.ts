import { Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { ThemeToggleComponent } from '../../shared/ui/theme-toggle/theme-toggle.component';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ThemeToggleComponent],
  host: { class: 'app-body' },
  styles: [`:host{display:flex;min-height:100dvh}`],
  template: `
    <aside class="app-sidebar">
      <a class="brand" routerLink="/pedidos/oc">
        <span class="brand-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5v9a4 4 0 0 0 4 4h10a2 2 0 0 0 2-2 4 4 0 0 0-3-3.9L11 10V5z"/></svg></span>
        <span class="brand-text"><b>BOTAS</b><small>AGROINDUSTRIAL</small></span>
      </a>
      <nav class="nav">
        <div class="nav-group">
          <div class="nav-group-h">Operación</div>
          <a class="nav-item" routerLink="/pedidos/oc" routerLinkActive="is-active">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h13l3 3v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M8 9h8M8 13h8M8 17h5"/></svg></span>
            <span class="nav-label">Órdenes de Compra</span>
          </a>
          <a class="nav-item" routerLink="/clientes" routerLinkActive="is-active">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0M16 5.5a3 3 0 0 1 0 5.6M21 20a5.5 5.5 0 0 0-4-5.3"/></svg></span>
            <span class="nav-label">Clientes</span>
          </a>
        </div>
        <div class="nav-group">
          <div class="nav-group-h">Planta · MES<span class="nav-tag">Próximamente</span></div>
          <a class="nav-item is-soon" href="#" tabindex="-1" aria-disabled="true">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.5 15.5M20 20L8.5 8.5"/></svg></span>
            <span class="nav-label">Corte & Guarnición</span>
          </a>
        </div>
      </nav>
      <div class="sidebar-foot">
        <div class="user-card">
          <span class="avatar">CM</span>
          <span class="user-meta"><b>Carolina M.</b><small>Oficial de ventas</small></span>
          <button class="icon-btn" type="button" title="Salir" (click)="logout()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
          </button>
        </div>
      </div>
    </aside>
    <main class="app-main">
      <header class="app-topbar">
        <div class="topbar-left"><h1 class="t-h2">Órdenes de Compra</h1></div>
        <div class="topbar-right">
          <app-theme-toggle />
        </div>
      </header>
      <router-outlet />
    </main>
  `,
})
export class ShellComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
