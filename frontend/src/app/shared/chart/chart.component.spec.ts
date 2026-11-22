import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ChartData } from 'chart.js';
import { ChartComponent, buildConfig, deepMerge } from './chart.component';
import { ThemeService } from '../../core/theme/theme.service';
import { toRgba } from './chart-theme';

@Component({
  standalone: true,
  imports: [ChartComponent],
  template: `@if (show()) { <app-chart [type]="type()" [data]="data()" height="200px" /> }`,
})
class HostComponent {
  readonly show = signal(true);
  readonly type = signal<'line' | 'bar' | 'doughnut'>('line');
  readonly data = signal<ChartData>({ labels: ['ene', 'feb'], datasets: [{ data: [1, 2] }] });
}

const palette = { series: ['rgba(1, 2, 3, 1)', 'rgba(4, 5, 6, 1)'], text: 'rgba(0, 0, 0, 1)', muted: 'rgba(0, 0, 0, 0.5)', grid: 'rgba(0, 0, 0, 0.1)', surface: 'rgba(255, 255, 255, 1)', dark: false };

describe('ChartComponent', () => {
  it('crea el gráfico, lo recrea al cambiar datos y tema, y lo destruye al salir', () => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    const f = TestBed.createComponent(HostComponent);
    f.detectChanges();
    const chart = () => f.debugElement.children[0]?.componentInstance as ChartComponent | undefined;
    const first = chart()!.instance!;
    expect(first).toBeTruthy();
    expect((first.config as any).type).toBe('line');

    f.componentInstance.type.set('bar');
    f.detectChanges();
    const second = chart()!.instance!;
    expect(second).not.toBe(first);
    expect((second.config as any).type).toBe('bar');

    TestBed.inject(ThemeService).toggle();
    f.detectChanges();
    expect(chart()!.instance).not.toBe(second);
    TestBed.inject(ThemeService).toggle();

    const last = chart()!.instance!;
    const destroy = spyOn(last, 'destroy').and.callThrough();
    f.componentInstance.show.set(false);
    f.detectChanges();
    expect(destroy).toHaveBeenCalled();
  });

  it('buildConfig aplica el estilo de la casa por tipo', () => {
    const line = buildConfig('line', { labels: ['a'], datasets: [{ data: [1] }] }, {}, palette);
    const ds = line.data.datasets[0] as any;
    expect(ds.tension).toBe(0.4);
    expect(ds.pointRadius).toBe(0);
    expect(ds.fill).toBeTrue();
    expect(typeof ds.backgroundColor).toBe('function');

    const bar = buildConfig('bar', { labels: ['a'], datasets: [{ data: [1] }, { data: [2] }] }, {}, palette);
    expect((bar.data.datasets[0] as any).borderRadius).toBe(4);
    expect((bar.data.datasets[1] as any).backgroundColor).toBe('rgba(4, 5, 6, 1)');

    const donut = buildConfig('doughnut', { labels: ['a', 'b'], datasets: [{ data: [1, 2] }] }, {}, palette);
    expect((donut.options as any).cutout).toBe('75%');
    expect((donut.data.datasets[0] as any).backgroundColor).toEqual(palette.series);
  });

  it('las opciones del usuario ganan sobre la base', () => {
    expect(deepMerge({ a: { b: 1, c: 2 } }, { a: { c: 3 } })).toEqual({ a: { b: 1, c: 3 } });
  });

  it('toRgba convierte oklch a rgba', () => {
    expect(toRgba('oklch(1 0 0)')).toBe('rgba(255, 255, 255, 1)');
  });
});
