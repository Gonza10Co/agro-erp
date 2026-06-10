import {
  diasCredito,
  saldoFactura,
  estadoCartera,
  resumenCartera,
} from './cartera-core';

const HOY = new Date('2026-06-10T12:00:00Z');
const ANTES = new Date('2026-05-01T12:00:00Z'); // vencida
const DESPUES = new Date('2026-07-01T12:00:00Z'); // futura

describe('cartera-core', () => {
  describe('diasCredito', () => {
    it('mapea el tipo de crédito a días', () => {
      expect(diasCredito('CONTADO')).toBe(0);
      expect(diasCredito('D30')).toBe(30);
      expect(diasCredito('D60')).toBe(60);
      expect(diasCredito('D90')).toBe(90);
    });
  });

  describe('saldoFactura', () => {
    it('resta los pagos al total', () => {
      expect(saldoFactura(1000000, [{ monto: 300000 }, { monto: 200000 }])).toBe(500000);
    });
    it('saldo 0 cuando está saldada', () => {
      expect(saldoFactura(1000000, [{ monto: 1000000 }])).toBe(0);
    });
    it('sin pagos el saldo es el total', () => {
      expect(saldoFactura(850000, [])).toBe(850000);
    });
  });

  describe('estadoCartera', () => {
    it('BLOQUEADO manual tiene prioridad', () => {
      expect(estadoCartera([{ fechaVencimiento: ANTES, saldo: 100 }], HOY, true)).toBe('BLOQUEADO');
    });
    it('VENCIDO si hay saldo > 0 y vencimiento pasado', () => {
      expect(estadoCartera([{ fechaVencimiento: ANTES, saldo: 100 }], HOY, false)).toBe('VENCIDO');
    });
    it('AL_DIA si la vencida ya está saldada', () => {
      expect(estadoCartera([{ fechaVencimiento: ANTES, saldo: 0 }], HOY, false)).toBe('AL_DIA');
    });
    it('AL_DIA si tiene saldo pero aún no vence', () => {
      expect(estadoCartera([{ fechaVencimiento: DESPUES, saldo: 500 }], HOY, false)).toBe('AL_DIA');
    });
    it('AL_DIA sin facturas', () => {
      expect(estadoCartera([], HOY, false)).toBe('AL_DIA');
    });
    it('ignora facturas sin fechaVencimiento', () => {
      expect(estadoCartera([{ fechaVencimiento: null, saldo: 500 }], HOY, false)).toBe('AL_DIA');
    });
  });

  describe('resumenCartera', () => {
    it('agrega facturado, pagado, saldo y saldo vencido', () => {
      const r = resumenCartera(
        [
          { total: 1000000, pagado: 400000, saldo: 600000, fechaVencimiento: ANTES }, // vencida
          { total: 500000, pagado: 0, saldo: 500000, fechaVencimiento: DESPUES }, // al día
        ],
        HOY,
      );
      expect(r).toEqual({ facturado: 1500000, pagado: 400000, saldo: 1100000, saldoVencido: 600000 });
    });
  });
});
