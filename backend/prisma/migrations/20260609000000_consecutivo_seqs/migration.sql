-- Secuencias atómicas para numeración consecutiva (elimina la carrera del patrón MAX+1).
CREATE SEQUENCE IF NOT EXISTS "oc_consecutivo_seq";
SELECT setval('oc_consecutivo_seq', COALESCE((SELECT MAX("consecutivo") FROM "OrdenCompra"), 0) + 1, false);

CREATE SEQUENCE IF NOT EXISTS "op_consecutivo_seq";
SELECT setval('op_consecutivo_seq', COALESCE((SELECT MAX("consecutivo") FROM "OrdenProduccion"), 0) + 1, false);

CREATE SEQUENCE IF NOT EXISTS "of_consecutivo_seq";
SELECT setval('of_consecutivo_seq', COALESCE((SELECT MAX("consecutivo") FROM "OrdenFabricacion"), 0) + 1, false);

CREATE SEQUENCE IF NOT EXISTS "despacho_consecutivo_seq";
SELECT setval('despacho_consecutivo_seq', COALESCE((SELECT MAX("consecutivo") FROM "Despacho"), 0) + 1, false);

CREATE SEQUENCE IF NOT EXISTS "req_consecutivo_seq";
SELECT setval('req_consecutivo_seq', COALESCE((SELECT MAX("consecutivo") FROM "RequerimientoCompra"), 0) + 1, false);
