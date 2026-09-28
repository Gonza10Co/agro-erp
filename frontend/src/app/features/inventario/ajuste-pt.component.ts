import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { InventarioApi } from '../../core/api/inventario.api';
import { AuthService } from '../../core/auth/auth.service';
import {
  FilaAjustePt,
  FilaAjustePtRevisada,
  ROLES_AJUSTE_PT,
  ResumenAjustePt,
} from '../../core/api/models/inventario.models';
import { generarCsvPlantilla, leerCsvAjuste } from './ajuste-pt-csv';

/**
 * Carga y ajuste del inventario de producto terminado por conteo físico:
 * descargar la plantilla con el saldo actual, llenar el conteo en Excel,
 * importarla, revisar qué sube y qué baja, y aplicar el ajuste.
 */
@Component({
  selector: 'app-ajuste-pt',
  standalone: true,
  imports: [FormsModule, DecimalPipe, RouterLink],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="ph-title">Carga y ajuste de inventario de botas</div>
        <div class="ph-actions">
          <a class="btn btn-secondary" routerLink="/inventario">Volver al inventario</a>
        </div>
      </div>

      <div class="card"><div class="card-body">
        <h4>1. Descarga la plantilla</h4>
        <p class="cell-sub">
          Trae una fila por producto, talla y bodega con lo que hay hoy en el sistema.
          Escribe lo que contaste en la columna <b>conteo_fisico</b>. Las filas que dejes
          vacías no se tocan. Si encuentras segundas de un producto que no aparece como
          SEGUNDA, copia su fila y cambia la calidad.
        </p>
        <button class="btn btn-primary" (click)="descargar()" [disabled]="descargando()">
          {{ descargando() ? 'Preparando…' : 'Descargar plantilla' }}
        </button>
      </div></div>

      <div class="card"><div class="card-body">
        <h4>2. Importa el conteo</h4>
        <p class="cell-sub">Guarda el archivo como CSV y súbelo. Nada cambia hasta que apliques el ajuste.</p>
        <label class="btn btn-secondary">Elegir archivo CSV<input type="file" accept=".csv,text/csv" hidden (change)="importar($event)" /></label>
        @if (archivo()) { <span class="cell-sub archivo">{{ archivo() }}</span> }
        @if (erroresLectura().length) {
          <ul class="form-error">
            @for (e of erroresLectura(); track e) { <li>{{ e }}</li> }
          </ul>
        }
        @if (error()) { <p class="form-error">{{ error() }}</p> }
      </div></div>

      @if (hecho(); as h) {
        <div class="card ok-card"><div class="card-body">
          <h4>Ajuste {{ h.referencia }} aplicado</h4>
          <p>
            {{ h.resumen.suben }} saldos subieron (+{{ h.resumen.paresEntran | number }} pares) y
            {{ h.resumen.bajan }} bajaron (−{{ h.resumen.paresSalen | number }} pares).
            Queda en el kardex a tu nombre.
          </p>
          <a class="btn btn-secondary" routerLink="/inventario">Ver el inventario</a>
        </div></div>
      }

      @if (resumen(); as r) {
        <div class="card"><div class="card-body">
          <h4>3. Revisa y aplica</h4>
          <div class="chips">
            <span class="chip">{{ r.filas | number }} filas con conteo</span>
            @if (omitidas()) { <span class="chip">{{ omitidas() | number }} vacías (no se tocan)</span> }
            <span class="chip in">{{ r.suben }} suben · +{{ r.paresEntran | number }} pares</span>
            <span class="chip out">{{ r.bajan }} bajan · −{{ r.paresSalen | number }} pares</span>
            <span class="chip">{{ r.sinCambio }} iguales</span>
            @if (r.errores) { <span class="chip err">{{ r.errores }} con error</span> }
          </div>

          <label class="check">
            <input type="checkbox" [ngModel]="soloCambios()" (ngModelChange)="soloCambios.set($event)" />
            <span class="box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5L20 7"/></svg></span>
            Mostrar solo cambios y errores
          </label>

          <div class="tabla-wrap">
            <table class="tabla">
              <thead><tr>
                <th>Fila</th><th>Producto</th><th>Talla</th><th>Calidad</th><th>Bodega</th>
                <th class="num">En sistema</th><th class="num">Conteo</th><th class="num">Diferencia</th>
              </tr></thead>
              <tbody>
                @for (f of visibles(); track f.fila) {
                  <tr [class.fila-error]="f.error">
                    <td class="cell-mono">{{ f.fila }}</td>
                    <td>{{ f.producto ?? '—' }}<div class="cell-sub cell-mono">{{ f.codigo }}</div></td>
                    <td>{{ f.talla }}</td>
                    <td>{{ f.calidad }}</td>
                    <td>{{ f.bodega }}</td>
                    @if (f.error) {
                      <td colspan="3" class="form-error">{{ f.error }}</td>
                    } @else {
                      <td class="num">{{ f.actual | number }}</td>
                      <td class="num">{{ f.conteo | number }}</td>
                      <td class="num" [class.in]="f.diferencia > 0" [class.out]="f.diferencia < 0">
                        {{ f.diferencia > 0 ? '+' : '' }}{{ f.diferencia | number }}
                      </td>
                    }
                  </tr>
                } @empty {
                  <tr><td colspan="8" class="cell-sub">El conteo coincide con el sistema: no hay nada que ajustar.</td></tr>
                }
              </tbody>
            </table>
          </div>

          <div class="aplicar">
            <input class="input" placeholder="Observaciones (ej. conteo inicial bodega Ibagué)"
                   [ngModel]="observaciones()" (ngModelChange)="observaciones.set($event)" maxlength="500" />
            @if (!puedeAplicar) {
              <p class="cell-sub">Solo gerencia o administración pueden aplicar el ajuste.</p>
            } @else if (r.errores) {
              <p class="form-error">Corrige las {{ r.errores }} filas con error en el archivo y vuelve a importarlo.</p>
            } @else if (!r.suben && !r.bajan) {
              <p class="cell-sub">No hay cambios para aplicar.</p>
            } @else if (!confirmando()) {
              <button class="btn btn-primary" (click)="confirmando.set(true)">Aplicar ajuste</button>
            } @else {
              <span>¿Aplicar {{ r.suben + r.bajan }} cambios de saldo?</span>
              <button class="btn btn-primary" (click)="aplicar()" [disabled]="aplicando()">
                {{ aplicando() ? 'Aplicando…' : 'Sí, aplicar' }}
              </button>
              <button class="btn btn-secondary" (click)="confirmando.set(false)" [disabled]="aplicando()">Cancelar</button>
            }
          </div>
        </div></div>
      }
    </div>
  `,
  styles: [`
    .card{margin-top:var(--sp-4)}
    .card:first-of-type{margin-top:0}
    h4{margin:0 0 var(--sp-2)}
    .cell-sub{margin:0 0 var(--sp-3)}
    .archivo{margin-left:var(--sp-3)}
    .ok-card .card-body{border-left:3px solid var(--success)}
    .chips{display:flex;flex-wrap:wrap;gap:var(--sp-2);margin-bottom:var(--sp-3)}
    .chip{font-size:var(--text-sm);padding:2px var(--sp-2);border-radius:var(--r-sm);border:var(--bw) solid var(--border)}
    .in{color:var(--success)}
    .out{color:var(--error)}
    .chip.in,.chip.out,.chip.err{border-color:currentColor}
    .chip.err{color:var(--error)}
    .check{margin-bottom:var(--sp-3)}
    .tabla-wrap{max-height:60vh;overflow:auto}
    .tabla{width:100%;border-collapse:collapse}
    .tabla th,.tabla td{text-align:left;padding:var(--sp-2);border-bottom:var(--bw) solid var(--border)}
    .tabla th{position:sticky;top:0;background:var(--surface)}
    .num{text-align:right}
    .fila-error{background:color-mix(in srgb, var(--error) 6%, transparent)}
    .form-error{color:var(--error);font-size:var(--text-sm)}
    .aplicar{display:flex;flex-wrap:wrap;align-items:center;gap:var(--sp-3);margin-top:var(--sp-4)}
    .aplicar .input{flex:1;min-width:240px;padding:var(--sp-2) var(--sp-3);border:var(--bw) solid var(--border);border-radius:var(--r-sm);background:var(--surface);color:var(--text)}
    .aplicar p{margin:0}
  `],
})
export class AjustePtComponent {
  private readonly api = inject(InventarioApi);
  private readonly auth = inject(AuthService);

  readonly puedeAplicar = ROLES_AJUSTE_PT.includes(this.auth.rol() ?? '');

  readonly descargando = signal(false);
  readonly archivo = signal<string | null>(null);
  readonly erroresLectura = signal<string[]>([]);
  readonly error = signal<string | null>(null);
  readonly omitidas = signal(0);
  readonly enviadas = signal<FilaAjustePt[]>([]);
  readonly revisadas = signal<FilaAjustePtRevisada[]>([]);
  readonly resumen = signal<ResumenAjustePt | null>(null);
  readonly soloCambios = signal(true);
  readonly observaciones = signal('');
  readonly confirmando = signal(false);
  readonly aplicando = signal(false);
  readonly hecho = signal<{ referencia: string; resumen: ResumenAjustePt } | null>(null);

  readonly visibles = computed(() =>
    this.soloCambios()
      ? this.revisadas().filter((f) => f.error || f.diferencia !== 0)
      : this.revisadas(),
  );

  descargar() {
    this.descargando.set(true);
    this.error.set(null);
    this.api.plantillaAjustePt().subscribe({
      next: (filas) => {
        const blob = new Blob([generarCsvPlantilla(filas)], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `inventario-botas-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        this.descargando.set(false);
      },
      error: (e) => {
        this.error.set(this.mensaje(e));
        this.descargando.set(false);
      },
    });
  }

  async importar(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // permite volver a subir el mismo archivo corregido
    if (!file) return;
    this.limpiar();
    this.archivo.set(file.name);

    const lectura = leerCsvAjuste(await file.text());
    this.erroresLectura.set(lectura.errores);
    this.omitidas.set(lectura.omitidas);
    if (lectura.errores.length) return;
    if (!lectura.filas.length) {
      this.error.set('Ninguna fila trae conteo_fisico: no hay nada que revisar.');
      return;
    }
    this.enviadas.set(lectura.filas);
    this.api.previsualizarAjustePt(lectura.filas).subscribe({
      next: (r) => {
        this.revisadas.set(r.filas);
        this.resumen.set(r.resumen);
      },
      error: (e) => this.error.set(this.mensaje(e)),
    });
  }

  aplicar() {
    this.aplicando.set(true);
    this.error.set(null);
    this.api.aplicarAjustePt(this.enviadas(), this.observaciones().trim() || undefined).subscribe({
      next: (r) => {
        this.limpiar();
        this.hecho.set(r);
      },
      error: (e) => {
        this.error.set(this.mensaje(e));
        this.aplicando.set(false);
        this.confirmando.set(false);
      },
    });
  }

  private limpiar() {
    this.archivo.set(null);
    this.erroresLectura.set([]);
    this.error.set(null);
    this.omitidas.set(0);
    this.enviadas.set([]);
    this.revisadas.set([]);
    this.resumen.set(null);
    this.confirmando.set(false);
    this.aplicando.set(false);
    this.hecho.set(null);
  }

  private mensaje(e: any): string {
    const m = e?.error?.message;
    return Array.isArray(m) ? m.join('; ') : m ?? 'No se pudo completar la operación';
  }
}
