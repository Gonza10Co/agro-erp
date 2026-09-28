import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { ThemeToggleComponent } from '../../shared/ui/theme-toggle/theme-toggle.component';
import { AuthService } from '../../core/auth/auth.service';
import { Modulo, Seccion, puedeVerModulo, puedeVerSeccion } from '../../core/auth/modulos';

const SIDEBAR_KEY = 'agro-sidebar';
const GRUPOS_KEY = 'agro-nav-grupos';

type GrupoNav = 'ventas' | 'produccion' | 'planta' | 'compras' | 'reportes' | 'configuracion';

/** Configuración se toca poco: arranca cerrada para que el menú respire. */
const GRUPOS_ABIERTOS_INICIO: GrupoNav[] = ['ventas', 'produccion', 'planta', 'compras', 'reportes'];

/** A qué área pertenece cada ruta: la del lugar donde uno está se abre sola. */
const GRUPO_POR_RUTA: [string, GrupoNav][] = [
  ['/pedidos/oc', 'ventas'], ['/clientes', 'ventas'], ['/despachos', 'ventas'],
  ['/facturas', 'ventas'], ['/cartera', 'ventas'],
  ['/pedidos/op', 'produccion'], ['/corte', 'produccion'], ['/fabricacion/tablero', 'produccion'],
  ['/fabricacion/ordenes', 'produccion'], ['/fabricacion/estacion', 'planta'],
  ['/fabricacion', 'produccion'], ['/calidad', 'planta'],
  ['/compras', 'compras'], ['/proveedores', 'compras'], ['/inventario', 'compras'],
  ['/reportes', 'reportes'], ['/indicadores', 'reportes'],
  ['/catalog', 'configuracion'], ['/administracion', 'configuracion'],
];

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
          <!-- Monograma BÁ del cliente (vectorizado de su logo) -->
          <span class="brand-mark"><svg viewBox="0 0 499 355" fill="currentColor"><path fill-rule="evenodd" d="M375 55L305 162L352 229L418 139L418 276L357 279L306 353L496 355L499 59ZM2 54L0 353L48 354L80 306L81 138L181 135L114 198L112 245L202 247L221 274L137 277L85 354L268 354L332 260L268 163L302 107L273 59ZM396 23L398 25L493 25L499 21L499 2L496 0L413 0L405 8Z"/></svg></span>
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
        @if (puedeVer('inicio')) {
        <div class="nav-group nav-inicio">
          <a class="nav-item" routerLink="/inicio" routerLinkActive="is-active" title="Inicio">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"/></svg></span>
            <span class="nav-label">Inicio</span>
          </a>
        </div>
        }
        @if (puedeVer('clientes') || puedeVer('pedidos') || puedeVer('despachos') || puedeVer('facturas') || puedeVer('cartera')) {
        <div class="nav-group" [class.cerrado]="!abierto('ventas')">
          <button class="nav-group-h nav-group-btn" type="button" (click)="toggleGrupo('ventas')" [attr.aria-expanded]="abierto('ventas')">
            <span>Ventas</span>
            <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          <div class="nav-items">
          @if (puedeVer('clientes')) {
          <a class="nav-item" routerLink="/clientes" routerLinkActive="is-active" title="Clientes">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0M16 5.5a3 3 0 0 1 0 5.6M21 20a5.5 5.5 0 0 0-4-5.3"/></svg></span>
            <span class="nav-label">Clientes</span>
          </a>
          }
          @if (puedeVer('pedidos')) {
          <a class="nav-item" routerLink="/pedidos/oc" routerLinkActive="is-active" title="Órdenes de compra del cliente (OC)">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h13l3 3v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M8 9h8M8 13h8M8 17h5"/></svg></span>
            <span class="nav-label">Órdenes de compra</span>
          </a>
          }
          @if (puedeVer('despachos')) {
          <a class="nav-item" routerLink="/despachos" routerLinkActive="is-active" title="Despachos">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h13v10H3zM16 10h3l2 3v4h-5zM7 17a2 2 0 1 0 4 0M16 17a2 2 0 1 0 4 0"/></svg></span>
            <span class="nav-label">Despachos</span>
          </a>
          }
          @if (puedeVer('facturas')) {
          <a class="nav-item" routerLink="/facturas" routerLinkActive="is-active" title="Facturas">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM8 8h8M8 12h8M8 16h5"/></svg></span>
            <span class="nav-label">Facturas</span>
          </a>
          }
          @if (puedeVer('cartera')) {
          <a class="nav-item" routerLink="/cartera" routerLinkActive="is-active" title="Cartera">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/></svg></span>
            <span class="nav-label">Cartera</span>
          </a>
          }
          </div>
        </div>
        }
        @if (puedeVer('pedidos') || puedeVer('fabricacion')) {
        <div class="nav-group" [class.cerrado]="!abierto('produccion')">
          <button class="nav-group-h nav-group-btn" type="button" (click)="toggleGrupo('produccion')" [attr.aria-expanded]="abierto('produccion')">
            <span>Producción</span>
            <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          <div class="nav-items">
          @if (puedeVer('pedidos')) {
          <a class="nav-item" routerLink="/pedidos/op" routerLinkActive="is-active" title="Órdenes de producción (OP)">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg></span>
            <span class="nav-label">Órdenes de producción</span>
          </a>
          }
          @if (puedeVer('fabricacion') && puedeVerSec('programacion-corte')) {
          <a class="nav-item" routerLink="/corte" routerLinkActive="is-active" [routerLinkActiveOptions]="{exact: true}" title="Control de corte">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8 7.5L20 18M8 16.5L20 6"/></svg></span>
            <span class="nav-label">Control de corte</span>
          </a>
          }
          @if (puedeVer('fabricacion')) {
          <a class="nav-item" routerLink="/fabricacion" routerLinkActive="is-active" [routerLinkActiveOptions]="{exact: true}" title="Órdenes de fabricación (OF)">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h10"/><circle cx="19" cy="18" r="2"/></svg></span>
            <span class="nav-label">Órdenes de fabricación</span>
          </a>
          }
          @if (puedeVer('fabricacion')) {
          <a class="nav-item" routerLink="/fabricacion/tablero" routerLinkActive="is-active" [routerLinkActiveOptions]="{exact: true}" title="Tablero por estaciones: dónde están hoy los pares">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="5" height="16"/><rect x="10" y="4" width="5" height="10"/><rect x="17" y="4" width="4" height="7"/></svg></span>
            <span class="nav-label">Tablero por estaciones</span>
          </a>
          }
          @if (puedeVer('fabricacion') && puedeVerSec('piloto')) {
          <a class="nav-item" routerLink="/fabricacion/ordenes" routerLinkActive="is-active" title="Tablero por órdenes">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18M3 12h18M3 19h18"/><path d="M7 5v14M13 5v14"/></svg></span>
            <span class="nav-label">Tablero por órdenes</span>
          </a>
          }
          </div>
        </div>
        }
        @if ((puedeVer('fabricacion') && puedeVerSec('piloto')) || puedeVer('calidad')) {
        <div class="nav-group" [class.cerrado]="!abierto('planta')">
          <button class="nav-group-h nav-group-btn" type="button" (click)="toggleGrupo('planta')" [attr.aria-expanded]="abierto('planta')">
            <span>Planta</span>
            <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          <div class="nav-items">
          @if (puedeVer('fabricacion') && puedeVerSec('piloto')) {
          <a class="nav-item" routerLink="/fabricacion/estacion" routerLinkActive="is-active" title="Estación (piloto)">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/><path d="M9 7h6M9 10h6M9 13h3"/></svg></span>
            <span class="nav-label">Estación</span>
          </a>
          }
          @if (puedeVer('calidad')) {
          <a class="nav-item" routerLink="/calidad" routerLinkActive="is-active" title="Calidad">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 4v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V7z"/><path d="M9 12l2 2 4-4"/></svg></span>
            <span class="nav-label">Calidad</span>
          </a>
          }
          @if (puedeVer('fabricacion') && puedeVerSec('piloto')) {
          <a class="nav-item" routerLink="/tv" target="_blank" title="TV de planta (abre aparte)">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg></span>
            <span class="nav-label">TV de planta</span>
          </a>
          }
          </div>
        </div>
        }
        @if (puedeVer('compras') || puedeVer('proveedores') || puedeVer('inventario')) {
        <div class="nav-group" [class.cerrado]="!abierto('compras')">
          <button class="nav-group-h nav-group-btn" type="button" (click)="toggleGrupo('compras')" [attr.aria-expanded]="abierto('compras')">
            <span>Compras e inventario</span>
            <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          <div class="nav-items">
          @if (puedeVer('compras')) {
          <a class="nav-item" routerLink="/compras/ordenes" routerLinkActive="is-active" title="Órdenes de compra a proveedor (OCP)">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6h15l-1.5 9h-12zM6 6L5 3H2"/><circle cx="8" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/></svg></span>
            <span class="nav-label">Órdenes a proveedor</span>
          </a>
          }
          @if (puedeVer('proveedores')) {
          <a class="nav-item" routerLink="/proveedores" routerLinkActive="is-active" title="Proveedores">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h13l5 5v5h-2M3 7v10h2M9 7V4h4v3"/><circle cx="7" cy="17" r="2"/><circle cx="18" cy="17" r="2"/></svg></span>
            <span class="nav-label">Proveedores</span>
          </a>
          }
          @if (puedeVer('inventario')) {
          <a class="nav-item" routerLink="/inventario" routerLinkActive="is-active" [routerLinkActiveOptions]="{exact: true}" title="Inventario">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/></svg></span>
            <span class="nav-label">Inventario</span>
          </a>
          }
          @if (puedeVer('inventario') && puedeVerSec('ajuste-pt')) {
          <a class="nav-item" routerLink="/inventario/ajuste-pt" routerLinkActive="is-active" title="Carga y ajuste de inventario de botas">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/><path d="M12 4v11M8 8l4-4 4 4"/></svg></span>
            <span class="nav-label">Carga y ajuste de botas</span>
          </a>
          }
          @if (puedeVer('inventario') && puedeVerSec('ajuste-mp')) {
          <a class="nav-item" routerLink="/inventario/ajuste-mp" routerLinkActive="is-active" title="Carga y ajuste de materiales">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/><path d="M8 4h8M8 8h8M12 8v7M9 12l3 3 3-3"/></svg></span>
            <span class="nav-label">Carga y ajuste de materiales</span>
          </a>
          }
          </div>
        </div>
        }
        @if (puedeVer('reportes') || puedeVer('indicadores')) {
        <div class="nav-group" [class.cerrado]="!abierto('reportes')">
          <button class="nav-group-h nav-group-btn" type="button" (click)="toggleGrupo('reportes')" [attr.aria-expanded]="abierto('reportes')">
            <span>Reportes</span>
            <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          <div class="nav-items">
          @if (puedeVer('reportes')) {
          <a class="nav-item" routerLink="/reportes/diario" routerLinkActive="is-active" title="Reporte diario">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M8 8h8M8 12h8M8 16h4"/></svg></span>
            <span class="nav-label">Reporte diario</span>
          </a>
          }
          @if (puedeVer('indicadores')) {
          <a class="nav-item" routerLink="/indicadores" routerLinkActive="is-active" title="Indicadores">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5M4 19h16M8 16v-5M12 16V8M16 16v-3"/></svg></span>
            <span class="nav-label">Indicadores</span>
          </a>
          }
          </div>
        </div>
        }
        @if (puedeVer('catalogo') || puedeVer('maestros') || puedeVer('administracion')) {
        <div class="nav-group" [class.cerrado]="!abierto('configuracion')">
          <button class="nav-group-h nav-group-btn" type="button" (click)="toggleGrupo('configuracion')" [attr.aria-expanded]="abierto('configuracion')">
            <span>Configuración</span>
            <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          <div class="nav-items">
          @if (puedeVer('catalogo') || puedeVer('maestros')) {
            <div class="nav-sub-h">Catálogo</div>
          }
          @if (puedeVer('maestros')) {
          <a class="nav-item" routerLink="/catalog/referencias" routerLinkActive="is-active" title="Referencias">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v5H4zM4 13h16v7H4z"/></svg></span>
            <span class="nav-label">Referencias</span>
          </a>
          <a class="nav-item" routerLink="/catalog/marcas" routerLinkActive="is-active" title="Marcas">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg></span>
            <span class="nav-label">Marcas</span>
          </a>
          <a class="nav-item" routerLink="/catalog/materiales" routerLinkActive="is-active" title="Materiales">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9"/></svg></span>
            <span class="nav-label">Materiales</span>
          </a>
          <a class="nav-item" routerLink="/catalog/piezas" routerLinkActive="is-active" title="Piezas de la bota (despiece)">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17V9a4 4 0 0 1 4-4h1l1 4 4 2 5 3v3z"/><path d="M9 5v4"/></svg></span>
            <span class="nav-label">Piezas</span>
          </a>
          <a class="nav-item" routerLink="/catalog/lineas" routerLinkActive="is-active" title="Líneas de producción">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></span>
            <span class="nav-label">Líneas</span>
          </a>
          <a class="nav-item" routerLink="/catalog/grupos-opcion" routerLinkActive="is-active" title="Grupos de opción">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="1.5"/><circle cx="16" cy="12" r="1.5"/><circle cx="10" cy="18" r="1.5"/></svg></span>
            <span class="nav-label">Grupos de opción</span>
          </a>
          }
          @if (puedeVer('catalogo')) {
          <a class="nav-item" routerLink="/catalog/configurador" routerLinkActive="is-active" title="Configurador de BOM">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M4 12h16M4 17h10"/><circle cx="19" cy="17" r="2"/></svg></span>
            <span class="nav-label">Configurador de BOM</span>
          </a>
          }
          @if (puedeVer('administracion')) {
            <div class="nav-sub-h">Administración</div>
          <a class="nav-item" routerLink="/administracion/usuarios" routerLinkActive="is-active" title="Usuarios del sistema">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/></svg></span>
            <span class="nav-label">Usuarios</span>
          </a>
          <a class="nav-item" routerLink="/administracion/operarios" routerLinkActive="is-active" title="Operarios de planta">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20v-1a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v1"/><circle cx="12" cy="7" r="3"/><path d="M9 4.5a3.5 3.5 0 0 1 6 0"/></svg></span>
            <span class="nav-label">Operarios</span>
          </a>
          }
          </div>
        </div>
        }
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
  readonly gruposAbiertos = signal<Set<GrupoNav>>(this.leerGrupos());

  constructor() {
    this.abrirGrupoDe(this.router.url);
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((e) => this.abrirGrupoDe((e as NavigationEnd).urlAfterRedirects));
  }
  readonly usuario = this.auth.usuario();
  readonly iniciales = (this.usuario?.username ?? '?').slice(0, 2).toUpperCase();
  readonly rolLabel =
    ({ ADMIN: 'Administración', GERENTE: 'Gerencia', VENTAS: 'Ventas', CLIENTE: 'Cliente', STAGE: 'Stage' } as Record<string, string>)[
      this.usuario?.role ?? ''
    ] ?? (this.usuario?.role ?? '');

  puedeVer(modulo: Modulo): boolean {
    return puedeVerModulo(this.usuario?.role ?? null, modulo);
  }

  /** Ítems que viven dentro de un módulo ya liberado pero aún no van al cliente. */
  puedeVerSec(seccion: Seccion): boolean {
    return puedeVerSeccion(this.usuario?.role ?? null, seccion);
  }

  abierto(g: GrupoNav): boolean {
    return this.gruposAbiertos().has(g);
  }

  toggleGrupo(g: GrupoNav): void {
    this.gruposAbiertos.update((set) => {
      const nuevo = new Set(set);
      if (nuevo.has(g)) nuevo.delete(g);
      else nuevo.add(g);
      return nuevo;
    });
    try { localStorage.setItem(GRUPOS_KEY, JSON.stringify([...this.gruposAbiertos()])); } catch { /* ignore */ }
  }

  private abrirGrupoDe(url: string): void {
    const g = GRUPO_POR_RUTA.find(([ruta]) => url === ruta || url.startsWith(ruta + '/') || url.startsWith(ruta + '?'))?.[1];
    if (g && !this.abierto(g)) this.gruposAbiertos.update((set) => new Set(set).add(g));
  }

  private leerGrupos(): Set<GrupoNav> {
    try {
      const guardado = localStorage.getItem(GRUPOS_KEY);
      if (guardado) return new Set(JSON.parse(guardado) as GrupoNav[]);
    } catch { /* ignore */ }
    return new Set(GRUPOS_ABIERTOS_INICIO);
  }

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
