import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.component').then(m => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell/shell.component').then(m => m.ShellComponent),
    children: [
      { path: 'pedidos/oc', loadComponent: () => import('./features/placeholder.component').then(m => m.PlaceholderComponent) },
      { path: 'clientes', loadComponent: () => import('./features/clientes/clientes-list.component').then(m => m.ClientesListComponent) },
      { path: '', pathMatch: 'full', redirectTo: 'pedidos/oc' },
    ],
  },
  { path: '**', redirectTo: '' },
];
