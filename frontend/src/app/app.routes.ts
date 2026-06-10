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
      { path: 'fabricacion', loadComponent: () => import('./features/fabricacion/of-list.component').then(m => m.OfListComponent) },
      { path: 'fabricacion/operario', loadComponent: () => import('./features/fabricacion/pantalla-operario.component').then(m => m.PantallaOperarioComponent) },
      { path: 'fabricacion/tablero', loadComponent: () => import('./features/fabricacion/tablero.component').then(m => m.FabricacionTableroComponent) },
      { path: 'fabricacion/guarnicion', loadComponent: () => import('./features/fabricacion/guarnicion-subtablero.component').then(m => m.GuarnicionSubtableroComponent) },
      { path: 'fabricacion/par/:codigo', loadComponent: () => import('./features/fabricacion/par-detalle.component').then(m => m.ParDetalleComponent) },
      { path: 'calidad', loadComponent: () => import('./features/calidad/dashboard-calidad.component').then(m => m.DashboardCalidadComponent) },
      { path: 'indicadores', loadComponent: () => import('./features/indicadores/dashboard-indicadores.component').then(m => m.DashboardIndicadoresComponent) },
      { path: '', pathMatch: 'full', redirectTo: 'pedidos/oc' },
    ],
  },
  { path: '**', redirectTo: '' },
];
