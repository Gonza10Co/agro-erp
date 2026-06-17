import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { moduloGuard } from './core/auth/modulo.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.component').then(m => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    canActivateChild: [moduloGuard],
    loadComponent: () => import('./layout/shell/shell.component').then(m => m.ShellComponent),
    children: [
      { path: 'inicio', data: { modulo: 'inicio' }, loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent) },
      { path: 'pedidos/oc', data: { modulo: 'pedidos' }, loadComponent: () => import('./features/pedidos/oc/oc-list.component').then(m => m.OcListComponent) },
      { path: 'pedidos/oc/nueva', data: { modulo: 'pedidos' }, loadComponent: () => import('./features/pedidos/oc/oc-crear.component').then(m => m.OcCrearComponent) },
      { path: 'pedidos/op', data: { modulo: 'pedidos' }, loadComponent: () => import('./features/pedidos/op/op-list.component').then(m => m.OpListComponent) },
      { path: 'pedidos/op/:id', data: { modulo: 'pedidos' }, loadComponent: () => import('./features/pedidos/op/op-detalle.component').then(m => m.OpDetalleComponent) },
      { path: 'clientes', data: { modulo: 'clientes' }, loadComponent: () => import('./features/clientes/clientes-list.component').then(m => m.ClientesListComponent) },
      { path: 'catalog/configurador', data: { modulo: 'catalogo' }, loadComponent: () => import('./features/catalog/configurador/configurador.component').then(m => m.ConfiguradorComponent) },
      { path: 'catalog/bom/:referenciaId/editar', data: { modulo: 'maestros' }, loadComponent: () => import('./features/catalog/bom-editor/bom-editor.component').then(m => m.BomEditorComponent) },
      { path: 'catalog/marcas', data: { modulo: 'maestros' }, loadComponent: () => import('./features/catalog/marcas/marcas-list.component').then(m => m.MarcasListComponent) },
      { path: 'catalog/materiales', data: { modulo: 'maestros' }, loadComponent: () => import('./features/catalog/materiales/materiales-list.component').then(m => m.MaterialesListComponent) },
      { path: 'catalog/referencias', data: { modulo: 'maestros' }, loadComponent: () => import('./features/catalog/referencias/referencias-list.component').then(m => m.ReferenciasListComponent) },
      { path: 'catalog/grupos-opcion', data: { modulo: 'maestros' }, loadComponent: () => import('./features/catalog/grupos-opcion/grupos-opcion-list.component').then(m => m.GruposOpcionListComponent) },
      { path: 'despachos', data: { modulo: 'despachos' }, loadComponent: () => import('./features/despachos/despachos-list.component').then(m => m.DespachosListComponent) },
      { path: 'facturas', data: { modulo: 'facturas' }, loadComponent: () => import('./features/facturas/facturas-list.component').then(m => m.FacturasListComponent) },
      { path: 'cartera', data: { modulo: 'cartera' }, loadComponent: () => import('./features/cartera/cartera-list.component').then(m => m.CarteraListComponent) },
      { path: 'compras/requerimiento/:id', data: { modulo: 'compras' }, loadComponent: () => import('./features/compras/requerimiento.component').then(m => m.RequerimientoComponent) },
      { path: 'compras/ordenes', data: { modulo: 'compras' }, loadComponent: () => import('./features/compras/ocp-list.component').then(m => m.OcpListComponent) },
      { path: 'compras/ordenes/:id', data: { modulo: 'compras' }, loadComponent: () => import('./features/compras/ocp-detalle.component').then(m => m.OcpDetalleComponent) },
      { path: 'inventario', data: { modulo: 'inventario' }, loadComponent: () => import('./features/inventario/inventario-consolidado.component').then(m => m.InventarioConsolidadoComponent) },
      { path: 'fabricacion', data: { modulo: 'fabricacion' }, loadComponent: () => import('./features/fabricacion/of-list.component').then(m => m.OfListComponent) },
      { path: 'fabricacion/operario', data: { modulo: 'fabricacion' }, loadComponent: () => import('./features/fabricacion/pantalla-operario.component').then(m => m.PantallaOperarioComponent) },
      { path: 'fabricacion/tablero', data: { modulo: 'fabricacion' }, loadComponent: () => import('./features/fabricacion/tablero.component').then(m => m.FabricacionTableroComponent) },
      { path: 'fabricacion/guarnicion', data: { modulo: 'fabricacion' }, loadComponent: () => import('./features/fabricacion/guarnicion-subtablero.component').then(m => m.GuarnicionSubtableroComponent) },
      { path: 'fabricacion/par/:codigo', data: { modulo: 'fabricacion' }, loadComponent: () => import('./features/fabricacion/par-detalle.component').then(m => m.ParDetalleComponent) },
      { path: 'calidad', data: { modulo: 'calidad' }, loadComponent: () => import('./features/calidad/dashboard-calidad.component').then(m => m.DashboardCalidadComponent) },
      { path: 'indicadores', data: { modulo: 'indicadores' }, loadComponent: () => import('./features/indicadores/dashboard-indicadores.component').then(m => m.DashboardIndicadoresComponent) },
      { path: 'reportes/diario', data: { modulo: 'reportes' }, loadComponent: () => import('./features/reportes/reporte-diario.component').then(m => m.ReporteDiarioComponent) },
      { path: '', pathMatch: 'full', redirectTo: 'inicio' },
    ],
  },
  { path: '**', redirectTo: '' },
];
