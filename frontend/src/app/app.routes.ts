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
      { path: 'pedidos/oc', loadComponent: () => import('./features/pedidos/oc/oc-list.component').then(m => m.OcListComponent) },
      { path: 'pedidos/oc/nueva', loadComponent: () => import('./features/pedidos/oc/oc-crear.component').then(m => m.OcCrearComponent) },
      { path: 'pedidos/op', loadComponent: () => import('./features/pedidos/op/op-list.component').then(m => m.OpListComponent) },
      { path: 'pedidos/op/:id', loadComponent: () => import('./features/pedidos/op/op-detalle.component').then(m => m.OpDetalleComponent) },
      { path: 'clientes', loadComponent: () => import('./features/clientes/clientes-list.component').then(m => m.ClientesListComponent) },
      { path: 'catalog/configurador', loadComponent: () => import('./features/catalog/configurador/configurador.component').then(m => m.ConfiguradorComponent) },
      { path: 'despachos', loadComponent: () => import('./features/despachos/despachos-list.component').then(m => m.DespachosListComponent) },
      { path: 'compras/requerimiento/:id', loadComponent: () => import('./features/compras/requerimiento.component').then(m => m.RequerimientoComponent) },
      { path: '', pathMatch: 'full', redirectTo: 'pedidos/oc' },
    ],
  },
  { path: '**', redirectTo: '' },
];
