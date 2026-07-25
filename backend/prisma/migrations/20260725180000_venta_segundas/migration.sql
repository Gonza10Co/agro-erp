-- Venta de segundas: el grado viaja por toda la cadena comercial
-- OC → amarre → despacho → factura. Todas aditivas con default PRIMERA,
-- así que los pedidos, remitos y facturas que ya existen no cambian.

-- El pedido: una segunda va en su propia línea, con su propio precio pactado.
ALTER TABLE "OrdenCompraLinea" ADD COLUMN "calidad" "CalidadPT" NOT NULL DEFAULT 'PRIMERA';

-- La OP hereda el grado del pedido: de ahí sale de qué saldo descarga el despacho.
ALTER TABLE "OrdenProduccionLinea" ADD COLUMN "calidad" "CalidadPT" NOT NULL DEFAULT 'PRIMERA';

-- El remito: sin la calidad, una primera y una segunda del mismo
-- producto+talla+bodega colapsarían en un solo renglón.
ALTER TABLE "DespachoLinea" ADD COLUMN "calidad" "CalidadPT" NOT NULL DEFAULT 'PRIMERA';

-- La factura: sin la calidad, la segunda saldría al precio de la primera.
ALTER TABLE "FacturaLinea" ADD COLUMN "calidad" "CalidadPT" NOT NULL DEFAULT 'PRIMERA';
