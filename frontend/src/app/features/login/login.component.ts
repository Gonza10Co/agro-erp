import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ThemeToggleComponent } from '../../shared/ui/theme-toggle/theme-toggle.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, ThemeToggleComponent],
  styles: [`
    :host{min-height:100vh;display:grid;grid-template-columns:1.05fr .95fr}
    /* panel marca */
    .brand-panel{position:relative;background:var(--neu-950);color:var(--neu-0);padding:var(--sp-12);display:flex;flex-direction:column;justify-content:space-between;overflow:hidden}
    .brand-panel::before{content:"";position:absolute;inset:0;background:
      radial-gradient(120% 80% at 100% 0%, color-mix(in oklch,var(--accent) 26%,transparent), transparent 55%),
      radial-gradient(90% 70% at 0% 100%, color-mix(in oklch,var(--primary) 30%,transparent), transparent 50%);}
    .bp-grid{position:absolute;inset:0;background-image:linear-gradient(var(--neu-0) 1px,transparent 1px),linear-gradient(90deg,var(--neu-0) 1px,transparent 1px);background-size:48px 48px;opacity:.035}
    .bp-content{position:relative;z-index:1}
    .bp-logo{display:flex;align-items:center;gap:13px}
    .bp-mark{width:42px;height:42px;border-radius:var(--r-md);background:var(--accent);display:grid;place-items:center;color:var(--accent-fg)}
    .bp-mark svg{width:26px;height:26px}
    .bp-logo b{font-size:18px;font-weight:700;letter-spacing:.02em;display:block;line-height:1}
    .bp-logo small{font-family:var(--font-mono);font-size:9px;letter-spacing:.22em;color:color-mix(in oklch,var(--neu-0) 60%,transparent);margin-top:4px;display:block}
    .bp-headline{position:relative;z-index:1;max-width:18ch}
    .bp-headline h1{font-size:38px;line-height:1.1;letter-spacing:-0.025em;font-weight:700}
    .bp-headline .accent{color:var(--accent)}
    .bp-headline p{margin-top:18px;color:color-mix(in oklch,var(--neu-0) 72%,transparent);font-size:15px;line-height:1.6;max-width:38ch}
    .bp-stats{position:relative;z-index:1;display:flex;gap:var(--sp-8)}
    .bp-stat .v{font-family:var(--font-mono);font-size:26px;font-weight:600;letter-spacing:-0.02em}
    .bp-stat .l{font-size:12px;color:color-mix(in oklch,var(--neu-0) 58%,transparent);margin-top:3px}
    .bp-quote{position:relative;z-index:1;font-size:13px;color:color-mix(in oklch,var(--neu-0) 55%,transparent);border-left:2px solid var(--accent);padding-left:14px}
    /* panel form */
    .form-panel{display:flex;align-items:center;justify-content:center;padding:var(--sp-8);background:var(--bg)}
    .login-card{width:100%;max-width:380px}
    .login-card .lead{margin-bottom:var(--sp-8)}
    .login-card h2{font-size:26px;font-weight:700;letter-spacing:-0.02em}
    .login-card .lead p{color:var(--text-muted);font-size:var(--text-sm);margin-top:6px}
    .login-card .field{margin-bottom:var(--sp-4)}
    .row-between{display:flex;align-items:center;justify-content:space-between}
    .link{color:var(--primary);font-size:var(--text-caption);font-weight:var(--fw-medium);cursor:pointer}
    .link:hover{text-decoration:underline}
    .login-foot{margin-top:var(--sp-6);text-align:center;font-size:var(--text-caption);color:var(--text-subtle)}
    .login-error{color:var(--error);font-size:var(--text-sm);margin-top:var(--sp-3)}
    .theme-fab{position:fixed;top:18px;right:18px;z-index:10}
    @media(max-width:880px){:host{grid-template-columns:1fr}.brand-panel{display:none}}
  `],
  template: `
    <div class="brand-panel">
      <div class="bp-grid"></div>
      <div class="bp-content bp-logo">
        <span class="bp-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5v9a4 4 0 0 0 4 4h10a2 2 0 0 0 2-2 4 4 0 0 0-3-3.9L11 10V5z"/></svg></span>
        <span><b>BOTAS AGROINDUSTRIAL</b><small>ERP · MES · IBAGUÉ</small></span>
      </div>
      <div class="bp-headline">
        <h1>Tu operación, <span class="accent">paso a paso</span> y sin perder un par.</h1>
        <p>Del pedido a la inyección, del amarre al despacho. El sistema que sigue el ritmo de la planta.</p>
      </div>
      <div>
        <div class="bp-stats">
          <div class="bp-stat"><div class="v">40</div><div class="l">años de oficio</div></div>
          <div class="bp-stat"><div class="v">350K</div><div class="l">pares / año</div></div>
          <div class="bp-stat"><div class="v">200</div><div class="l">clientes</div></div>
        </div>
        <div class="bp-quote" style="margin-top:28px">"Entre menos datos manuales, mejor." — filosofía de operación.</div>
      </div>
    </div>

    <div class="form-panel">
      <div class="theme-fab"><app-theme-toggle /></div>
      <form class="login-card" (ngSubmit)="onSubmit()">
        <div class="lead">
          <h2>Ingresar</h2>
          <p>Accedé con tu cuenta corporativa para gestionar pedidos y producción.</p>
        </div>
        <div class="field">
          <label class="label" for="u">Usuario</label>
          <div class="input-group">
            <span class="ig-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg></span>
            <input class="input" id="u" name="username" [(ngModel)]="username" placeholder="admin" autocomplete="username" />
          </div>
        </div>
        <div class="field">
          <label class="label" for="p">Contraseña</label>
          <div class="input-group has-suffix">
            <span class="ig-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></span>
            <input class="input" id="p" name="password" [type]="showPassword() ? 'text' : 'password'" [(ngModel)]="password" placeholder="••••••••" autocomplete="current-password" />
            <button type="button" class="ig-suffix" style="border:0;background:none;cursor:pointer;color:var(--text-subtle)" (click)="showPassword.set(!showPassword())">{{ showPassword() ? 'OCULTAR' : 'VER' }}</button>
          </div>
        </div>
        <button class="btn btn-primary btn-lg btn-block" type="submit" [class.is-loading]="loading()" [disabled]="loading()">Ingresar</button>
        @if (error()) { <p class="login-error">{{ error() }}</p> }
        <div class="login-foot">¿Problemas para entrar? <a class="link">Contactá a TI</a></div>
      </form>
    </div>
  `,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  username = '';
  password = '';
  showPassword = signal(false);
  loading = signal(false);
  error = signal('');

  onSubmit(): void {
    if (this.loading()) return;
    this.error.set('');
    this.loading.set(true);
    this.auth.login(this.username, this.password).subscribe({
      next: () => this.router.navigateByUrl('/'),
      error: () => {
        this.error.set('Credenciales inválidas');
        this.loading.set(false);
      },
    });
  }
}
