import { Component, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { ThemeToggleComponent } from '../../shared/ui/theme-toggle/theme-toggle.component';
import { AuthService } from '../../core/auth/auth.service';

const SIDEBAR_KEY = 'agro-sidebar';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ThemeToggleComponent],
  host: { class: 'app-body', '[class.sb-collapsed]': 'collapsed()' },
  styles: [`:host{display:flex;min-height:100dvh}`],
  template: `
    <aside class="app-sidebar">
      <div class="sidebar-head">
        <a class="brand" routerLink="/pedidos/oc">
          <span class="brand-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5v9a4 4 0 0 0 4 4h10a2 2 0 0 0 2-2 4 4 0 0 0-3-3.9L11 10V5z"/></svg></span>
          <span class="brand-text"><b>BOTAS</b><small>AGROINDUSTRIAL</small></span>
        </a>
        <div class="sidebar-actions">
          <app-theme-toggle />
          <button class="icon-btn collapse-btn" type="button" [title]="collapsed() ? 'Expandir menú' : 'Colapsar menú'" (click)="toggleSidebar()">
            @if (collapsed()) {
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 17l5-5-5-5M13 17l5-5-5-5"/></svg>
            } @else {
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/></svg>
            }
          </button>
        </div>
      </div>
      <nav class="nav">
        <div class="nav-group">
          <div class="nav-group-h">Operación</div>
          <a class="nav-item" routerLink="/inicio" routerLinkActive="is-active" title="Inicio">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"/></svg></span>
            <span class="nav-label">Inicio</span>
          </a>
          <a class="nav-item" routerLink="/pedidos/oc" routerLinkActive="is-active" title="Órdenes de Compra">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h13l3 3v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M8 9h8M8 13h8M8 17h5"/></svg></span>
            <span class="nav-label">Órdenes de Compra</span>
          </a>
          <a class="nav-item" routerLink="/pedidos/op" routerLinkActive="is-active" title="Órdenes de Producción">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg></span>
            <span class="nav-label">Órdenes de Producción</span>
          </a>
          <a class="nav-item" routerLink="/despachos" routerLinkActive="is-active" title="Despachos">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h13v10H3zM16 10h3l2 3v4h-5zM7 17a2 2 0 1 0 4 0M16 17a2 2 0 1 0 4 0"/></svg></span>
            <span class="nav-label">Despachos</span>
          </a>
          <a class="nav-item" routerLink="/facturas" routerLinkActive="is-active" title="Facturas">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM8 8h8M8 12h8M8 16h5"/></svg></span>
            <span class="nav-label">Facturas</span>
          </a>
          <a class="nav-item" routerLink="/cartera" routerLinkActive="is-active" title="Cartera">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/></svg></span>
            <span class="nav-label">Cartera</span>
          </a>
          <a class="nav-item" routerLink="/compras/ordenes" routerLinkActive="is-active" title="Compras">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6h15l-1.5 9h-12zM6 6L5 3H2"/><circle cx="8" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/></svg></span>
            <span class="nav-label">Compras</span>
          </a>
          <a class="nav-item" routerLink="/inventario" routerLinkActive="is-active" title="Inventario">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/></svg></span>
            <span class="nav-label">Inventario</span>
          </a>
          <a class="nav-item" routerLink="/fabricacion/tablero" routerLinkActive="is-active" [routerLinkActiveOptions]="{exact: true}" title="Tablero de fabricación">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="5" height="16"/><rect x="10" y="4" width="5" height="10"/><rect x="17" y="4" width="4" height="7"/></svg></span>
            <span class="nav-label">Tablero de fabricación</span>
          </a>
          <a class="nav-item" routerLink="/fabricacion/operario" routerLinkActive="is-active" title="Puesto de operario">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h13l5 5v5h-2M3 7v10h2M9 7V4h4v3"/><circle cx="7" cy="17" r="2"/><circle cx="18" cy="17" r="2"/></svg></span>
            <span class="nav-label">Puesto de operario</span>
          </a>
          <a class="nav-item" routerLink="/calidad" routerLinkActive="is-active" title="Calidad">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 4v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V7z"/><path d="M9 12l2 2 4-4"/></svg></span>
            <span class="nav-label">Calidad</span>
          </a>
          <a class="nav-item" routerLink="/indicadores" routerLinkActive="is-active" title="Indicadores">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5M4 19h16M8 16v-5M12 16V8M16 16v-3"/></svg></span>
            <span class="nav-label">Indicadores</span>
          </a>
          <a class="nav-item" routerLink="/reportes/diario" routerLinkActive="is-active" title="Reporte diario">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M8 8h8M8 12h8M8 16h4"/></svg></span>
            <span class="nav-label">Reporte diario</span>
          </a>
          <a class="nav-item" routerLink="/clientes" routerLinkActive="is-active" title="Clientes">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0M16 5.5a3 3 0 0 1 0 5.6M21 20a5.5 5.5 0 0 0-4-5.3"/></svg></span>
            <span class="nav-label">Clientes</span>
          </a>
        </div>
        <div class="nav-group">
          <div class="nav-group-h">Catálogo</div>
          <a class="nav-item" routerLink="/catalog/configurador" routerLinkActive="is-active" title="Configurador de BOM">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M4 12h16M4 17h10"/><circle cx="19" cy="17" r="2"/></svg></span>
            <span class="nav-label">Configurador de BOM</span>
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
          <span class="avatar">{{ iniciales }}</span>
          <span class="user-meta"><b>{{ usuario?.username ?? '—' }}</b><small>{{ rolLabel }}</small></span>
          <button class="icon-btn" type="button" title="Salir" (click)="logout()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
          </button>
        </div>
      </div>
    </aside>
    <main class="app-main">
      <router-outlet />
    </main>
  `,
})
export class ShellComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly collapsed = signal(this.leerColapsada());
  readonly usuario = this.auth.usuario();
  readonly iniciales = (this.usuario?.username ?? '?').slice(0, 2).toUpperCase();
  readonly rolLabel =
    ({ ADMIN: 'Administración', GERENTE: 'Gerencia', VENTAS: 'Ventas' } as Record<string, string>)[
      this.usuario?.role ?? ''
    ] ?? (this.usuario?.role ?? '');

  toggleSidebar(): void {
    this.collapsed.update((v) => !v);
    try { localStorage.setItem(SIDEBAR_KEY, this.collapsed() ? 'colapsada' : 'expandida'); } catch { /* ignore */ }
  }

  logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }

  private leerColapsada(): boolean {
    try { return localStorage.getItem(SIDEBAR_KEY) === 'colapsada'; } catch { return false; }
  }
}
