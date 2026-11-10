-- Días de crédito de 10 y 15 días (pedido de Valen, 10-nov-2026).
ALTER TYPE "TipoCredito" ADD VALUE IF NOT EXISTS 'D10' BEFORE 'D30';
ALTER TYPE "TipoCredito" ADD VALUE IF NOT EXISTS 'D15' BEFORE 'D30';
