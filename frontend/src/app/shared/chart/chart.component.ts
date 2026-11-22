import { Component, ElementRef, OnDestroy, effect, inject, input, untracked, viewChild } from '@angular/core';
import { Chart, ChartConfiguration, ChartData, ChartOptions, ChartType, registerables } from 'chart.js';
import { ThemeService } from '../../core/theme/theme.service';
import { ChartPalette, readPalette, withAlpha } from './chart-theme';

Chart.register(...registerables);

/**
 * Gráfico reutilizable sobre Chart.js con el estilo de la casa (tomado del tablero de
 * Olpar y pasado a los tokens "Acero"): área con degradado, curva suave y sin puntos;
 * dona con hueco de 75 %; barras con esquinas de 4 px; ejes discretos y fuente Inter.
 *
 * Cada vez que cambian `type`, `data`, `options` o el tema claro/oscuro, el gráfico se
 * destruye y se vuelve a crear (los datos de un reporte cambian pocas veces y así no
 * hay estado viejo de Chart.js). Las series que no traen color toman la paleta en orden.
 */
@Component({
  selector: 'app-chart',
  standalone: true,
  template: `<div class="chart-box" [style.height]="height()"><canvas #canvas [attr.aria-label]="ariaLabel()" role="img"></canvas></div>`,
  styles: [`:host { display: block; } .chart-box { position: relative; width: 100%; }`],
})
export class ChartComponent implements OnDestroy {
  readonly type = input.required<ChartType>();
  readonly data = input.required<ChartData>();
  readonly options = input<ChartOptions>({});
  readonly height = input('260px');
  readonly ariaLabel = input('Gráfico');

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly theme = inject(ThemeService);
  private chart: Chart | null = null;

  constructor() {
    effect(() => {
      const type = this.type();
      const data = this.data();
      const options = this.options();
      this.theme.theme(); // recrear al cambiar de tema
      const canvas = this.canvas().nativeElement;
      untracked(() => this.render(canvas, type, data, options));
    });
  }

  /** El Chart vivo (para pruebas o para quien necesite exportar la imagen). */
  get instance(): Chart | null {
    return this.chart;
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
    this.chart = null;
  }

  private render(canvas: HTMLCanvasElement, type: ChartType, data: ChartData, options: ChartOptions): void {
    this.chart?.destroy();
    const palette = readPalette(canvas);
    const config = buildConfig(type, data, options, palette);
    this.chart = new Chart(canvas, config as ChartConfiguration);
  }
}

type AnyRecord = Record<string, any>;

function isObject(v: unknown): v is AnyRecord {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Mezcla profunda simple: lo del usuario gana sobre la base. */
export function deepMerge<T extends AnyRecord>(base: T, over: AnyRecord): T {
  const out: AnyRecord = { ...base };
  for (const [k, v] of Object.entries(over ?? {})) {
    out[k] = isObject(v) && isObject(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

/** Arma la configuración final con el estilo de la casa. Exportada para las pruebas. */
export function buildConfig(type: ChartType, data: ChartData, options: ChartOptions, p: ChartPalette) {
  const round = type === 'doughnut' || type === 'pie' || type === 'polarArea';
  const font = { family: "'Inter', system-ui, -apple-system, sans-serif", size: 11 };

  const datasets = data.datasets.map((ds: AnyRecord, i) => {
    const color = p.series[i % p.series.length];
    const d: AnyRecord = { ...ds };
    const dsType = d['type'] ?? type;
    if (round) {
      d['backgroundColor'] ??= data.labels?.map((_, j) => p.series[j % p.series.length]) ?? p.series;
      d['borderWidth'] ??= 0;
      d['hoverOffset'] ??= 4;
    } else if (dsType === 'line') {
      d['borderColor'] ??= color;
      d['borderWidth'] ??= 2.5;
      d['tension'] ??= 0.4;
      d['pointRadius'] ??= 0;
      d['pointHoverRadius'] ??= 5;
      d['pointBackgroundColor'] ??= d['borderColor'];
      if (d['fill'] !== false && d['backgroundColor'] === undefined) {
        d['fill'] = d['fill'] ?? true;
        const base = typeof d['borderColor'] === 'string' ? d['borderColor'] : color;
        d['backgroundColor'] = (ctx: AnyRecord) => {
          const area = ctx['chart']?.chartArea;
          const c2d: CanvasRenderingContext2D | undefined = ctx['chart']?.ctx;
          if (!area || !c2d) return withAlpha(base, 0.15);
          const g = c2d.createLinearGradient(0, area.top, 0, area.bottom);
          g.addColorStop(0, withAlpha(base, p.dark ? 0.35 : 0.25));
          g.addColorStop(1, withAlpha(base, 0));
          return g;
        };
      }
    } else if (dsType === 'bar') {
      d['backgroundColor'] ??= color;
      d['hoverBackgroundColor'] ??= withAlpha(typeof d['backgroundColor'] === 'string' ? d['backgroundColor'] : color, 0.8);
      d['borderRadius'] ??= 4;
      d['borderSkipped'] ??= false;
      d['maxBarThickness'] ??= 36;
    }
    return d;
  });

  const axis = {
    border: { display: false },
    grid: { color: p.grid, drawTicks: false },
    ticks: { color: p.muted, font, padding: 6 },
  };
  const base: AnyRecord = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    interaction: round ? { mode: 'nearest', intersect: true } : { mode: 'index', intersect: false },
    plugins: {
      legend: { display: round || datasets.length > 1, position: 'bottom', labels: { color: p.text, font, boxWidth: 10, boxHeight: 10, usePointStyle: true, padding: 14 } },
      tooltip: {
        backgroundColor: p.dark ? 'rgba(20, 24, 30, 0.95)' : 'rgba(30, 36, 46, 0.92)',
        titleFont: { ...font, weight: '600' },
        bodyFont: font,
        padding: 10,
        cornerRadius: 6,
        boxPadding: 4,
      },
    },
  };
  if (round) {
    base['cutout'] = type === 'doughnut' ? '75%' : undefined;
  } else {
    base['scales'] = {
      x: { ...axis, grid: { display: false } },
      y: { ...axis, beginAtZero: true, ticks: { ...axis.ticks, maxTicksLimit: 5 } },
    };
  }
  return { type, data: { ...data, datasets }, options: deepMerge(base, options as AnyRecord) };
}
