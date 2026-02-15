import csv
import os
import sqlite3
import sys


BASE_DIR = os.path.dirname(__file__)
DATA_PATH = os.path.join(BASE_DIR, "plazas_orden_ultimo_ano.csv")
DB_PATH = os.path.join(BASE_DIR, "plazas.db")

REQUIRED_COLUMNS = {
    "specialty",
    "search_name",
    "ccaa",
    "province",
    "city",
    "center",
    "total_places",
    "last_year",
    "last_year_order_max",
    "last_year_orders",
}


def _to_int(value):
    try:
        return int(value)
    except Exception:
        return None


def _validate_csv_headers(fieldnames):
    if not fieldnames:
        raise ValueError("CSV sin encabezados")
    missing = REQUIRED_COLUMNS - set(fieldnames)
    if missing:
        raise ValueError(f"CSV incompleto: faltan columnas {sorted(missing)}")


def _validate_row_types(row, line_no, errors):
    def _expect_int(val, col):
        if val in (None, "", "NULL"):
            return None
        try:
            return int(val)
        except Exception:
            errors.append(f"Linea {line_no}: columna {col} no es int ('{val}')")
            return None

    row["total_places"] = _expect_int(row.get("total_places"), "total_places")
    row["last_year"] = _expect_int(row.get("last_year"), "last_year")
    row["last_year_order_max"] = _expect_int(row.get("last_year_order_max"), "last_year_order_max")


def validate_csv(path):
    errors = []
    valid_rows = 0
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        _validate_csv_headers(reader.fieldnames)
        for line_no, r in enumerate(reader, start=2):  # header is line 1
            _validate_row_types(r, line_no, errors)
            valid_rows += 1

    if errors:
        for msg in errors[:20]:
            print(msg, file=sys.stderr)
        if len(errors) > 20:
            print(f"... {len(errors) - 20} errores mas", file=sys.stderr)
        # fail-fast on schema/type issues
        raise ValueError(f"CSV invalido: {len(errors)} filas con tipos incorrectos")

    if valid_rows == 0:
        raise ValueError("CSV sin filas validas")

    return True


def ensure_db():
    if not os.path.exists(DATA_PATH):
        raise FileNotFoundError(f"No existe el dataset: {DATA_PATH}")

    validate_csv(DATA_PATH)

    csv_mtime = os.path.getmtime(DATA_PATH)
    if os.path.exists(DB_PATH):
        db_mtime = os.path.getmtime(DB_PATH)
        if db_mtime >= csv_mtime:
            return DB_PATH

    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE plazas (
            specialty TEXT,
            search_name TEXT,
            ccaa TEXT,
            province TEXT,
            city TEXT,
            center TEXT,
            total_places INTEGER,
            last_year INTEGER,
            last_year_order_max INTEGER,
            last_year_orders TEXT
        )
        """
    )

    rows = []
    with open(DATA_PATH, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(
                (
                    r.get("specialty") or None,
                    r.get("search_name") or None,
                    r.get("ccaa") or None,
                    r.get("province") or None,
                    r.get("city") or None,
                    r.get("center") or None,
                    _to_int(r.get("total_places")),
                    _to_int(r.get("last_year")),
                    _to_int(r.get("last_year_order_max")),
                    r.get("last_year_orders") or None,
                )
            )

    cur.executemany(
        """
        INSERT INTO plazas (
            specialty, search_name, ccaa, province, city, center,
            total_places, last_year, last_year_order_max, last_year_orders
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )

    cur.execute("CREATE INDEX idx_plazas_specialty ON plazas(specialty)")
    cur.execute("CREATE INDEX idx_plazas_ccaa ON plazas(ccaa)")
    cur.execute("CREATE INDEX idx_plazas_province ON plazas(province)")
    cur.execute("CREATE INDEX idx_plazas_city ON plazas(city)")
    cur.execute("CREATE INDEX idx_plazas_order ON plazas(last_year_order_max)")
    conn.commit()
    conn.close()
    return DB_PATH


def connect_db(check_same_thread=True):
    ensure_db()
    return sqlite3.connect(DB_PATH, check_same_thread=check_same_thread)
