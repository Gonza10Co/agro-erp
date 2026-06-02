import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <form (ngSubmit)="onSubmit()">
      <h1>agro-erp</h1>
      <input name="username" [(ngModel)]="username" placeholder="Usuario" />
      <input name="password" type="password" [(ngModel)]="password" placeholder="Contraseña" />
      <button type="submit">Entrar</button>
      @if (error()) { <p class="error">{{ error() }}</p> }
    </form>
  `,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  username = '';
  password = '';
  error = signal('');

  onSubmit(): void {
    this.auth.login(this.username, this.password).subscribe({
      next: () => this.router.navigateByUrl('/home'),
      error: () => this.error.set('Credenciales inválidas'),
    });
  }
}
