import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/login/login.component').then(m => m.LoginComponent) },
  { path: 'home', canActivate: [authGuard], loadComponent: () => import('./features/login/login.component').then(m => m.LoginComponent) },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
];
