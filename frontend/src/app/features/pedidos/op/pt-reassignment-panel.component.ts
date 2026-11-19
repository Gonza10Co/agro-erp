import { Component, DestroyRef, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PedidosApi } from '../../../core/api/pedidos.api';
import { PtReassignment, ReassignmentOption, ReassignmentTarget } from '../../../core/api/models/pt-reassignment.models';
import { AuthService } from '../../../core/auth/auth.service';
import { puedeReasignarPares } from '../../../core/auth/modulos';
import { ToastService } from '../../../core/notificaciones/toast.service';
import { DrawerComponent } from '../../../shared/ui/drawer/drawer.component';

type Modo = 'pass' | 'release';

/**
 * Pasar pares reservados en PT de esta OP a otro pedido, o liberarlos para otra
 * venta (JP, 2026-11-19). Las acciones son de gerencia; el historial lo ve todo
 * el que ve la OP, porque explica por qué el pedido quedó debiendo pares.
 */
@Component({
  selector: 'app-pt-reassignment-panel',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, DrawerComponent],
  template: `
    <div class="card reasig">
      <div class="reasig-head">
        <div>
          <h3>Pares cedidos y recibidos</h3>
          <p class="cell-sub">Cuando gerencia pasa pares reservados de un pedido a otro, o los libera para otra venta.</p>
        </div>
        @if (puedeOperar && viva()) {
          <div class="reasig-actions">
            <button class="btn btn-secondary btn-sm" type="button" (click)="abrir('pass')">Pasar pares a otro pedido</button>
            <button class="btn btn-ghost btn-sm" type="button" (click)="abrir('release')">Liberar para otra venta</button>
          </div>
        }
      </div>
      <div class="card-body">
        @if (historial().length === 0) {
          <p class="cell-sub">Este pedido no ha cedido ni recibido pares.</p>
        } @else {
          <ul class="hist">
            @for (h of historial(); track h.id) {
              <li class="hist-row">
                <span class="badge {{ claseDe(h) }}"><span class="dot"></span>{{ etiquetaDe(h) }}</span>
                <div class="hist-main">
                  <div class="hist-what">
                    <b class="cell-mono">{{ h.quantity }}</b> par{{ h.quantity === 1 ? '' : 'es' }} ·
                    {{ h.productoConfigurado?.nombreComercial }} · T{{ h.talla?.valor }}
                    @if (h.calidad === 'SEGUNDA') { · segunda }
                    @if (otraOp(h); as o) {
                      · <a [routerLink]="['/pedidos/op', o.id]">OP-{{ o.consecutivo }}</a>
                      @if (o.oc?.cliente?.nombre) { <span class="cell-sub">({{ o.oc?.cliente?.nombre }})</span> }
                    }
                  </div>
                  <div class="hist-why">“{{ h.reason }}”</div>
                </div>
                <div class="hist-meta cell-sub">{{ h.createdAt | date:'dd MMM HH:mm' }}<br />{{ h.user?.username }}</div>
              </li>
            }
          </ul>
        }
      </div>
    </div>

    <app-drawer [open]="modo() !== null" [title]="modo() === 'pass' ? 'Pasar pares a otro pedido' : 'Liberar para otra venta'" (closed)="cerrar()">
      @if (cargandoOpciones()) {
        <p class="cell-sub">Cargando lo reservado…</p>
      } @else if (opciones().length === 0) {
        <p class="cell-sub">Este pedido no tiene pares reservados en bodega.</p>
      } @else {
        <label class="label" for="reasig-item">Producto y talla</label>
        <div class="select-wrap">
          <select id="reasig-item" class="select" [ngModel]="itemKey()" (ngModelChange)="elegirItem($event)">
            @for (o of opciones(); track key(o)) {
              <option [value]="key(o)">{{ o.producto }} · T{{ o.talla }}{{ o.calidad === 'SEGUNDA' ? ' · segunda' : '' }} · {{ o.reservado }} reservados</option>
            }
          </select>
        </div>

        @if (modo() === 'pass') {
          <label class="label" for="reasig-dest" style="margin-top:var(--sp-4)">Pedido destino</label>
          @if (item()?.targets?.length) {
            <div class="select-wrap">
              <select id="reasig-dest" class="select" [ngModel]="destinoId()" (ngModelChange)="destinoId.set(+$event)">
                @for (t of item()!.targets; track t.opId) {
                  <option [value]="t.opId">OP-{{ t.opConsecutivo }} · {{ t.cliente }}{{ t.ocCliente ? ' · ' + t.ocCliente : '' }} · le faltan {{ t.pendiente }}</option>
                }
              </select>
            </div>
          } @else {
            <p class="hint aviso">Ningún pedido con OP pidió esta talla o ya la tiene completa. Si el pedido destino todavía
              no tiene OP, usa <b>Liberar para otra venta</b> y luego genera su OP: la OP amarra el stock libre.</p>
          }
        }

        <label class="label" for="reasig-cant" style="margin-top:var(--sp-4)">Cantidad de pares</label>
        <input id="reasig-cant" class="input" type="number" min="1" step="1" [max]="tope()"
          [ngModel]="cantidad()" (ngModelChange)="cantidad.set(+$event)" />
        <p class="hint">Máximo {{ tope() }}{{ modo() === 'pass' && destino() ? ' (lo que tiene reservado este pedido y lo que le falta al destino)' : ' (lo reservado de esa talla)' }}.</p>

        <label class="label" for="reasig-motivo" style="margin-top:var(--sp-4)">Motivo <span style="color:var(--accent)">*</span></label>
        <textarea id="reasig-motivo" class="textarea" rows="3" maxlength="500" placeholder="Por qué se toman estos pares"
          [ngModel]="motivo()" (ngModelChange)="motivo.set($event)"></textarea>

        <p class="hint aviso" style="margin-top:var(--sp-4)">
          OP-{{ opConsecutivo() }} queda debiendo {{ cantidad() || 0 }} par{{ cantidad() === 1 ? '' : 'es' }}:
          @if (item()?.calidad === 'SEGUNDA') { las segundas no se fabrican, así que el pedido no se despacha completo hasta que se resuelva. }
          @else { vuelven a quedar por fabricar y el pedido no se despacha hasta reponerlos. }
          Los pares conservan su código y siguen en la misma bodega.
        </p>

        @if (error()) { <p class="err">{{ error() }}</p> }

        <div class="drawer-foot">
          <button class="btn btn-primary btn-block" type="button" [class.is-loading]="enviando()" [disabled]="!valido() || enviando()" (click)="enviar()">
            {{ modo() === 'pass' ? 'Pasar pares' : 'Liberar pares' }}
          </button>
        </div>
      }
    </app-drawer>
  `,
  styles: [`
    .reasig{margin-top:var(--sp-5)}
    .reasig-head{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--sp-4);flex-wrap:wrap;padding:var(--sp-4) var(--sp-5);border-bottom:var(--bw) solid var(--border)}
    .reasig-head h3{font-size:var(--text-h3);font-weight:var(--fw-semibold)}
    .reasig-actions{display:flex;gap:var(--sp-2);flex-wrap:wrap}
    .hist{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
    .hist-row{display:grid;grid-template-columns:auto 1fr auto;gap:var(--sp-3);align-items:start;padding:var(--sp-3) 0;border-bottom:var(--bw) solid var(--border)}
    .hist-row:last-child{border-bottom:0}
    .hist-what{font-size:var(--text-sm)}
    .hist-what a{color:var(--primary);font-weight:var(--fw-medium)}
    .hist-why{font-size:var(--text-caption);color:var(--text-muted);margin-top:2px}
    .hist-meta{text-align:right;font-size:var(--text-caption);white-space:nowrap}
    .label{display:block;font-size:var(--text-sm);color:var(--text-muted);margin-bottom:var(--sp-2)}
    .input,.textarea{width:100%}
    .aviso{padding:var(--sp-3);border-radius:var(--r-sm);background:color-mix(in oklch,var(--warning) 10%,var(--surface));border:var(--bw) solid color-mix(in oklch,var(--warning) 35%,var(--border))}
    .err{color:var(--error);font-size:var(--text-sm);margin-top:var(--sp-3)}
    @media(max-width:640px){.hist-row{grid-template-columns:1fr}.hist-meta{text-align:left}}
  `],
})
export class PtReassignmentPanelComponent implements OnInit {
  private readonly api = inject(PedidosApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  opId = input.required<number>();
  opConsecutivo = input.required<number>();
  /** La OP puede ceder pares mientras no esté despachada ni anulada. */
  viva = input(true);
  /** Se pasó o liberó algo: el detalle de la OP se recarga. */
  changed = output<void>();

  readonly puedeOperar = puedeReasignarPares(this.auth.rol());

  historial = signal<PtReassignment[]>([]);
  modo = signal<Modo | null>(null);
  opciones = signal<ReassignmentOption[]>([]);
  cargandoOpciones = signal(false);
  itemKey = signal('');
  destinoId = signal<number | null>(null);
  cantidad = signal(1);
  motivo = signal('');
  enviando = signal(false);
  error = signal('');

  item = computed(() => this.opciones().find((o) => this.key(o) === this.itemKey()) ?? null);
  destino = computed<ReassignmentTarget | null>(() => this.item()?.targets.find((t) => t.opId === this.destinoId()) ?? null);
  tope = computed(() => {
    const it = this.item();
    if (!it) return 0;
    if (this.modo() === 'pass') return Math.min(it.reservado, this.destino()?.pendiente ?? 0);
    return it.reservado;
  });
  valido = computed(() => {
    const c = this.cantidad();
    if (!this.item() || !Number.isInteger(c) || c < 1 || c > this.tope()) return false;
    if (!this.motivo().trim()) return false;
    return this.modo() === 'release' || !!this.destino();
  });

  ngOnInit(): void {
    this.cargarHistorial();
  }

  key(o: { productoConfiguradoId: number; tallaId: number; calidad: string }): string {
    return `${o.productoConfiguradoId}|${o.tallaId}|${o.calidad}`;
  }

  cargarHistorial(): void {
    this.api.reassignments(this.opId()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (h) => this.historial.set(h),
      error: () => this.historial.set([]),
    });
  }

  abrir(modo: Modo): void {
    this.modo.set(modo);
    this.error.set('');
    this.motivo.set('');
    this.cantidad.set(1);
    this.cargandoOpciones.set(true);
    this.api.reassignmentOptions(this.opId()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (ops) => {
        this.opciones.set(ops);
        this.cargandoOpciones.set(false);
        // En "pasar" arranca en la primera talla que tenga a quién pasarle.
        const primero = (modo === 'pass' ? ops.find((o) => o.targets.length) : null) ?? ops[0];
        if (primero) this.elegirItem(this.key(primero));
      },
      error: (e) => { this.cargandoOpciones.set(false); this.error.set(this.msg(e)); },
    });
  }

  elegirItem(k: string): void {
    this.itemKey.set(k);
    const it = this.opciones().find((o) => this.key(o) === k);
    this.destinoId.set(it?.targets[0]?.opId ?? null);
    this.cantidad.set(Math.min(Math.max(this.cantidad(), 1), Math.max(this.tope(), 1)));
  }

  cerrar(): void {
    this.modo.set(null);
  }

  enviar(): void {
    const it = this.item();
    if (!it || !this.valido() || this.enviando()) return;
    const body = {
      productoConfiguradoId: it.productoConfiguradoId,
      tallaId: it.tallaId,
      calidad: it.calidad,
      quantity: this.cantidad(),
      reason: this.motivo().trim(),
    };
    const pasar = this.modo() === 'pass';
    const destino = this.destino();
    const req = pasar
      ? this.api.reassignPairs(this.opId(), { ...body, toOpId: destino!.opId })
      : this.api.releasePairs(this.opId(), body);
    this.enviando.set(true);
    this.error.set('');
    req.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.enviando.set(false);
        this.modo.set(null);
        this.toast.exito(
          pasar
            ? `${body.quantity} pares pasados a OP-${destino!.opConsecutivo}`
            : `${body.quantity} pares liberados en bodega`,
        );
        this.changed.emit();
      },
      error: (e) => { this.enviando.set(false); this.error.set(this.msg(e)); },
    });
  }

  /** La otra OP del movimiento, vista desde esta. */
  otraOp(h: PtReassignment) {
    return h.fromOpId === this.opId() ? (h.toOp ?? null) : (h.fromOp ?? null);
  }

  etiquetaDe(h: PtReassignment): string {
    if (h.fromOpId !== this.opId()) return 'Recibió';
    return h.toOpId == null ? 'Liberó' : 'Cedió';
  }

  claseDe(h: PtReassignment): string {
    if (h.fromOpId !== this.opId()) return 'badge-success';
    return h.toOpId == null ? 'badge-neutral' : 'badge-warning';
  }

  private msg(e: any): string {
    const m = e?.error?.message;
    return Array.isArray(m) ? m.join(' ') : (m ?? 'La acción falló');
  }
}
