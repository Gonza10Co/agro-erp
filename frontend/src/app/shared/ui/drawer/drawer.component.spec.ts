import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DrawerComponent } from './drawer.component';

@Component({
  standalone: true,
  imports: [DrawerComponent],
  template: `<app-drawer [open]="abierto" title="Prueba" (closed)="onClose()"><p class="contenido">hola</p></app-drawer>`,
})
class HostComponent { abierto = false; cerrado = false; onClose() { this.cerrado = true; } }

describe('DrawerComponent', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    return TestBed.createComponent(HostComponent);
  }

  it('no renderiza el panel cuando open=false', () => {
    const fixture = setup();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.drawer')).toBeNull();
    expect(fixture.nativeElement.querySelector('.scrim')).toBeNull();
  });

  it('renderiza panel + scrim + contenido proyectado cuando open=true', () => {
    const fixture = setup();
    fixture.componentInstance.abierto = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.drawer')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.scrim')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.contenido')?.textContent).toBe('hola');
  });

  it('emite closed al clickear el scrim', () => {
    const fixture = setup();
    fixture.componentInstance.abierto = true;
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.scrim').click();
    expect(fixture.componentInstance.cerrado).toBe(true);
  });
});
