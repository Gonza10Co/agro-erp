"""
Consolida la cartera de clientes y sus sedes desde las plantillas que llena el área
comercial del cliente (una por marca) y escribe los CSV que comen los seeds.

Fuente (Agro/docs/, fuera del repo — no se versiona):
    PLANTILLA-SEDES-CLIENTES-AGRO.xlsx       llenada el 2026-07-29
    PLANTILLA-SEDES-CLIENTES-BASARILI.xlsx   llenada el 2026-07-30

Un mismo NIT puede aparecer en las dos marcas: es UN cliente que le compra a ambas, no dos.
Se fusiona por NIT y sus sedes se deduplican por dirección normalizada.

Uso:
    python tools/consolidar-cartera.py [carpeta-de-plantillas]

Escribe (en backend/prisma/data/, fuera de control de versiones):
    clientes.csv        nit,nombre,ciudad
    sedes-clientes.csv  nit,cliente,sede,ciudad,direccion,telefono,principal

Y deja un reporte por consola de todo lo que se corrigió o descartó.

Reglas de limpieza (el área comercial llena a mano; el archivo llega sucio):
  · El NIT se normaliza a solo dígitos ("3 9 8 0 6 3 0 7" → "39806307"); sin NIT se descarta.
  · El nombre del cliente se rellena por NIT: en los clientes multi-sede la comercial lo
    escribe solo en la primera fila.
  · Se descartan las filas que no son clientes (transportadora, proveedor).
  · Sedes duplicadas del mismo cliente (misma dirección escrita distinto) se fusionan.
  · El nombre de sede debe ser único por cliente (lo exige `parsearFilasSedes`): a los
    repetidos se les agrega sufijo numérico.
  · Exactamente una sede principal por cliente: si la comercial no marcó ninguna (o marcó
    varias), manda la primera.
  · Cuando una sede ya existe en la BD con otro nombre, gana el nombre viejo: `seed:sedes`
    busca por (cliente, nombre de sede) y renombrar crearía un duplicado en vez de
    actualizar. Por eso las sedes que vienen de AGRO conservan su "Principal".

Requiere: pip install openpyxl
"""
import csv
import re
import sys
import unicodedata
from pathlib import Path

import openpyxl

RAIZ = Path(__file__).resolve().parent.parent
DATA = RAIZ / "backend" / "prisma" / "data"
DOCS = RAIZ.parent / "docs"

# El orden importa: la primera marca es la que ya está cargada en la BD, y sus nombres de
# sede son los que manda conservar la regla de arriba.
PLANTILLAS = [
    ("AGRO", "PLANTILLA-SEDES-CLIENTES-AGRO.xlsx"),
    ("BASARILI", "PLANTILLA-SEDES-CLIENTES-BASARILI.xlsx"),
]

# Filas que la comercial usa como apunte interno pero no son clientes de verdad.
NO_SON_CLIENTES = {
    "18102023": "INTERRAPIDISIMO (transportadora, no compra botas)",
    "93394908": "GABRIEL PUNTERAS (es proveedor de punteras, no cliente)",
    # Los tres registros de ejemplo que trae la plantilla en blanco y que la comercial no
    # borró antes de devolverla. Se colaron en la carga del 2026-07-29.
    "900123456": "FERRETERIA EL TORNILLO SAS (fila de ejemplo de la plantilla)",
    "800987654": "DISTRIBUCIONES DEL SUR LTDA (fila de ejemplo de la plantilla)",
}

# NITs que llegaron cruzados en la plantilla de BASARILI: el mismo NIT aparece con dos
# razones sociales, y una de ellas ya pertenece a otro NIT según la plantilla de AGRO.
#   901694036 = DOTAINDUSTRIALES WORK (ok) pero también rotula a MAKRODOTACIONES
#   901388889 = MAKRODOTACIONES según AGRO, pero BASARILI lo rotula DOTACIONES H SAS,
#               con la dirección que en BASARILI tiene LOTUS VT (Cra 63 #21-15 sur)
# Mezclarlos rompería la facturación, así que la fila mal rotulada no se carga y espera
# confirmación de Juan Pablo (nit → nombre de la fila que se deja fuera).
CUARENTENA = {
    "901694036": "MAKRODOTACIONES S.A.S.",
    "901388889": "DOTACIONES H SAS",
}

# Por defecto gana la razón social más larga (BASARILI trae el nombre completo donde AGRO
# tenía el de pila). Estas son las excepciones donde el nombre largo es peor.
NOMBRE_FIJO = {
    "901411297": "BOSINCOL SAS",   # 'BOSINCOL RUBY ANDRADE' es el nombre de la contacto
    "901701391": "ONE SAFETY SAS",  # 'ONE SAFETY ROBINSON PARRA', igual
}

# La comercial partió un cliente en dos filas: en una escribió el nombre y en la otra el
# NIT. Son las dos sedes de INVERSIONES SURTIORIENTE (misma dirección y teléfono).
NIT_FALTANTE = {"INVERSIONES SURTIORIENTE SAS": "901103498"}

ABREVIATURAS = [
    (r"\bCARRERA\b|\bKRA\b|\bKR\b|\bCRA\b|\bCR\b", "CR"),
    (r"\bCALLE\b|\bCLL\b|\bCL\b", "CL"),
    (r"\bTRANSVERSAL\b|\bTRANSV\b|\bTRAV\b|\bTV\b", "TV"),
    (r"\bDIAGONAL\b|\bDIAG\b|\bDG\b", "DG"),
    (r"\bAVENIDA\b|\bAV\b", "AV"),
    (r"\bBARRIO\b|\bBRR\b|\bBR\b", "BR"),
    (r"\bBODEGA\b|\bBOD\b|\bBD\b", "BD"),
    (r"\bLOCAL\b|\bLC\b", "LC"),
    (r"\bMANZANA\b|\bMZ\b", "MZ"),
    (r"\bNUMERO\b|\bNRO\b|\bNO\b|\bN\b", ""),
]


def sin_tildes(t: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", t) if unicodedata.category(c) != "Mn")


def clave_direccion(d: str) -> str:
    """Dos escrituras de la misma dirección tienen que colapsar en la misma clave.
    'Tv 93 #53- 32 parque empresarial el dorado' y 'TRANSVERSAL 93  53 32' son el mismo
    predio: comparar texto no sirve. Lo que identifica la dirección es el tipo de vía más
    la secuencia de números; se toman los cuatro primeros para que 'LC 147' y 'LC 150' del
    mismo centro comercial sigan siendo dos sedes distintas."""
    t = sin_tildes(d).upper()
    t = re.sub(r"[^A-Z0-9]+", " ", t)
    for patron, reemplazo in ABREVIATURAS:
        t = re.sub(patron, reemplazo, t)
    via = next((v for v in t.split() if v in ("CR", "CL", "TV", "DG", "AV")), "")
    numeros = re.findall(r"\d+", t)[:4]
    if not via and not numeros:
        return " ".join(t.split())  # no parece una dirección: se compara literal
    return f"{via} {' '.join(numeros)}"


def normalizar_nit(n: str) -> str:
    """El NIT es la llave del cliente. Llega con espacios de más, y a veces con el dígito
    de verificación pegado ('900123456-1'), que NO es parte del NIT."""
    t = (n or "").strip()
    if re.fullmatch(r"[\d.\s]{6,}-\s*\d", t):
        t = t.rsplit("-", 1)[0]
    return re.sub(r"[^0-9]", "", t)


def leer(path: Path) -> list[dict]:
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb["SEDES"]
    filas = [f for f in ws.iter_rows(values_only=True) if any(c not in (None, "") for c in f)]
    heads = [str(h).strip().lower() for h in filas[0]]
    out = []
    for f in filas[1:]:
        d = {heads[i]: (str(f[i]).strip() if f[i] is not None else "") for i in range(len(heads))}
        out.append(d)
    return out


def main() -> None:
    docs = Path(sys.argv[1]) if len(sys.argv) > 1 else DOCS
    reporte: list[str] = []

    # nit -> {nombre, ciudad, sedes: [ {nombre, ciudad, direccion, telefono, principal, marca} ]}
    clientes: dict[str, dict] = {}

    for marca, archivo in PLANTILLAS:
        ruta = docs / archivo
        if not ruta.exists():
            print(f"No está {ruta}", file=sys.stderr)
            sys.exit(1)
        filas = leer(ruta)
        print(f"{marca}: {len(filas)} filas leídas de {archivo}")

        # El nombre del cliente viene solo en la primera fila de cada multi-sede.
        nombres_del_archivo: dict[str, str] = {}
        for f in filas:
            nombre_fila = (f.get("cliente") or "").strip()
            nit = normalizar_nit(str(f.get("nit", ""))) or NIT_FALTANTE.get(nombre_fila, "")
            if nit and nombre_fila:
                nombres_del_archivo.setdefault(nit, nombre_fila)

        for i, f in enumerate(filas, start=2):
            crudo = str(f.get("nit", "")).strip()
            nombre = f.get("cliente", "").strip()
            nit = normalizar_nit(crudo) or NIT_FALTANTE.get(nombre, "")
            nombre = nombre or nombres_del_archivo.get(nit, "")

            if not nit:
                reporte.append(f"{marca} fila {i}: descartada, sin NIT ({nombre or 'sin nombre'})")
                continue
            if nit in NO_SON_CLIENTES:
                reporte.append(f"{marca} fila {i}: descartada — {NO_SON_CLIENTES[nit]}")
                continue
            if CUARENTENA.get(nit) == nombre:
                reporte.append(
                    f"⚠️  {marca} fila {i}: EN CUARENTENA, no se carga — '{nombre}' viene con el "
                    f"NIT {nit}, que en AGRO es de otra empresa ({f.get('direccion', '')})"
                )
                continue
            if crudo != nit:
                reporte.append(f"{marca} fila {i}: NIT '{crudo}' → '{nit}' ({nombre})")
            if not nombre:
                reporte.append(f"{marca} fila {i}: descartada, NIT {nit} sin nombre de cliente")
                continue

            c = clientes.setdefault(nit, {"nombre": nombre, "ciudad": "", "sedes": [], "alias": set()})
            if nombre:
                c["alias"].add(nombre)

            if not f.get("direccion"):
                # El cliente sí entra (se le puede facturar); la sede la completa después
                # el área comercial desde el ABM.
                reporte.append(f"{marca} fila {i}: {nombre} entra sin sede — no trae dirección")
                if not c["ciudad"]:
                    c["ciudad"] = (f.get("ciudad") or "").strip()
                continue

            sede = {
                "nombre": (f.get("sede") or "Principal").strip(),
                "ciudad": (f.get("ciudad") or "").strip(),
                "direccion": f["direccion"].strip(),
                "telefono": (f.get("telefono") or "").strip(),
                "principal": (f.get("principal") or "").strip().upper() in ("SI", "SÍ", "X", "1"),
                "marca": marca,
            }

            gemela = next(
                (s for s in c["sedes"] if clave_direccion(s["direccion"]) == clave_direccion(sede["direccion"])),
                None,
            )
            if gemela:
                # Misma dirección: es la misma sede. Se conserva el nombre viejo (llave
                # contra la BD) y solo se rellenan los datos que estaban vacíos.
                if sede["nombre"].lower() != gemela["nombre"].lower():
                    reporte.append(
                        f"NIT {nit} ({c['nombre']}): sede '{sede['nombre']}' de {marca} es la misma "
                        f"que '{gemela['nombre']}' — se fusionan ({sede['direccion']})"
                    )
                for campo in ("ciudad", "telefono"):
                    if not gemela[campo] and sede[campo]:
                        gemela[campo] = sede[campo]
                gemela["principal"] = gemela["principal"] or sede["principal"]
                continue

            c["sedes"].append(sede)

    # --- reglas por cliente: razón social, nombre de sede único y una sola principal ---
    for nit, c in clientes.items():
        # Entre las variantes del mismo NIT gana la más larga: es la razón social completa
        # ('ALPACA BOGOTA' → 'ALPACA BOGOTA S.A.S.'), salvo excepción explícita.
        elegido = NOMBRE_FIJO.get(nit) or max(c["alias"], key=len)
        if elegido != c["nombre"] or len(c["alias"]) > 1:
            otras = sorted(a for a in c["alias"] if a != elegido)
            if otras:
                reporte.append(f"NIT {nit}: se llama '{elegido}' (también venía como {', '.join(repr(o) for o in otras)})")
        c["nombre"] = elegido

        if not c["sedes"]:
            reporte.append(f"NIT {nit} ({c['nombre']}): queda como cliente SIN sedes")
            continue

        vistos: dict[str, int] = {}
        for s in c["sedes"]:
            k = s["nombre"].lower()
            if k in vistos:
                vistos[k] += 1
                nuevo = f"{s['nombre']} {vistos[k]}"
                reporte.append(
                    f"NIT {nit} ({c['nombre']}): dos sedes se llamaban '{s['nombre']}' con "
                    f"direcciones distintas → la segunda queda como '{nuevo}'"
                )
                s["nombre"] = nuevo
            else:
                vistos[k] = 1

        principales = [s for s in c["sedes"] if s["principal"]]
        if len(principales) != 1:
            motivo = "ninguna" if not principales else f"{len(principales)}"
            for s in c["sedes"]:
                s["principal"] = False
            c["sedes"][0]["principal"] = True
            reporte.append(
                f"NIT {nit} ({c['nombre']}): {motivo} sede(s) marcadas como principal → "
                f"queda '{c['sedes'][0]['nombre']}'"
            )

        principal = next(s for s in c["sedes"] if s["principal"])
        c["ciudad"] = principal["ciudad"]

    # --- escritura ---
    DATA.mkdir(parents=True, exist_ok=True)
    orden = sorted(clientes.items(), key=lambda kv: kv[1]["nombre"])

    with open(DATA / "clientes.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["nit", "nombre", "ciudad"])
        for nit, c in orden:
            w.writerow([nit, c["nombre"], c["ciudad"]])

    total_sedes = 0
    with open(DATA / "sedes-clientes.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["nit", "cliente", "sede", "ciudad", "direccion", "telefono", "principal"])
        for nit, c in orden:
            for s in c["sedes"]:
                w.writerow([
                    nit, c["nombre"], s["nombre"], s["ciudad"] or c["ciudad"],
                    s["direccion"], s["telefono"], "SI" if s["principal"] else "NO",
                ])
                total_sedes += 1

    print()
    for r in reporte:
        print(f"  · {r}")
    multi = sum(1 for _, c in clientes.items() if len(c["sedes"]) > 1)
    print(f"\nclientes.csv: {len(clientes)} clientes")
    print(f"sedes-clientes.csv: {total_sedes} sedes ({multi} clientes con más de una)")


if __name__ == "__main__":
    main()
