/**
 * Paleta de los gráficos sacada de los tokens del tema "Acero" (tokens.css). Los
 * tokens vienen en oklch(); Chart.js calcula los colores de hover con su propio
 * parser, que no entiende oklch, así que cada token se pinta en un canvas de 1×1 y
 * se lee de vuelta como rgba.
 */
export interface ChartPalette {
  /** Colores de las series, en orden. */
  series: string[];
  text: string;
  muted: string;
  grid: string;
  surface: string;
  dark: boolean;
}

const SERIES_TOKENS = ['--primary', '--accent', '--info', '--success', '--warning', '--blue-300', '--orange-300', '--neu-500', '--error'];

let probe: CanvasRenderingContext2D | null = null;

/** Cualquier color CSS (oklch, hex, var resuelta) → 'rgba(r, g, b, a)'. */
export function toRgba(css: string, alpha?: number): string {
  probe ??= Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
  if (!probe || !css) return css;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = '#000';
  probe.fillStyle = css.trim();
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
  const out = alpha ?? Math.round((a / 255) * 100) / 100;
  return `rgba(${r}, ${g}, ${b}, ${out})`;
}

function token(style: CSSStyleDeclaration, name: string): string {
  return style.getPropertyValue(name).trim();
}

export function readPalette(el: Element = document.documentElement): ChartPalette {
  const s = getComputedStyle(el);
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    series: SERIES_TOKENS.map((t) => toRgba(token(s, t) || '#888')),
    text: toRgba(token(s, '--text-muted') || '#666'),
    muted: toRgba(token(s, '--text-subtle') || '#999'),
    grid: toRgba(token(s, '--border') || '#ddd', dark ? 0.6 : 0.8),
    surface: toRgba(token(s, '--surface') || '#fff'),
    dark,
  };
}

/** Misma rgba con otra opacidad. */
export function withAlpha(rgba: string, alpha: number): string {
  return rgba.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, `rgba($1,$2,$3, ${alpha})`);
}
