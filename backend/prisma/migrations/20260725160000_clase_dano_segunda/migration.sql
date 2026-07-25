-- AlterEnum
-- Va SOLA en su migración a propósito: PostgreSQL no permite usar un valor de enum
-- recién agregado dentro de la misma transacción que lo agrega. La siguiente
-- migración (segundas_calidad_pt) ya lo puede referenciar sin problema.
ALTER TYPE "ClaseDano" ADD VALUE 'SEGUNDA';
