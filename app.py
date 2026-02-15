import os
from io import BytesIO

import streamlit as st

from db_utils import DATA_PATH, connect_db, ensure_db


def _xlsx_bytes(cols, rows):
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.append(cols)
    for r in rows:
        ws.append([r.get(c, "") for c in cols])
    bio = BytesIO()
    wb.save(bio)
    return bio.getvalue()


@st.cache_resource
def load_db(csv_mtime):
    ensure_db()
    return connect_db(check_same_thread=False)


def _distinct(cur, column):
    cur.execute(f"SELECT DISTINCT {column} FROM plazas WHERE {column} IS NOT NULL ORDER BY {column}")
    return [r[0] for r in cur.fetchall()]


def main():
    st.set_page_config(page_title="PostMIR – Plazas", layout="wide")
    st.title("PostMIR – Plazas y órdenes (último año)")
    st.caption("Filtros dinámicos sobre el dataset local. Las consultas se ejecutan en SQLite persistente.")

    csv_mtime = os.path.getmtime(DATA_PATH) if os.path.exists(DATA_PATH) else 0
    conn = load_db(csv_mtime)
    cur = conn.cursor()

    specialties = _distinct(cur, "specialty")
    ccaas = _distinct(cur, "ccaa")
    provinces = _distinct(cur, "province")
    cities = _distinct(cur, "city")

    with st.sidebar:
        st.subheader("Filtros")
        f_specialty = st.multiselect("Especialidad", specialties, default=specialties)
        f_ccaa = st.multiselect("CCAA", ccaas, default=[])
        f_province = st.multiselect("Provincia", provinces, default=[])
        f_province_text = st.text_input("Buscar provincia (texto)", value="")
        f_city = st.multiselect("Ciudad", cities, default=[])
        f_city_text = st.text_input("Buscar ciudad (texto)", value="")
        f_center = st.text_input("Buscar centro (texto)", value="")
        f_year = st.selectbox("Año", options=["Todos", 2025, 2024, 2023], index=1)
        page_size = st.slider("Filas por página", min_value=50, max_value=500, value=200, step=50)

        cur.execute("SELECT MIN(total_places), MAX(total_places) FROM plazas WHERE total_places IS NOT NULL")
        min_places, max_places = cur.fetchone()
        if min_places is None:
            min_places, max_places = 0, 1
        f_places = st.slider(
            "Plazas totales",
            min_value=int(min_places),
            max_value=int(max_places),
            value=(int(min_places), int(max_places)),
        )

        cur.execute("SELECT MIN(last_year_order_max), MAX(last_year_order_max) FROM plazas")
        min_order, max_order = cur.fetchone()
        if min_order is None:
            min_order, max_order = 0, 1
        f_order = st.slider(
            "Orden (último año)",
            min_value=int(min_order),
            max_value=int(max_order),
            value=(int(min_order), int(max_order)),
        )
        preset_options = [
            "Personalizado",
            ">= 6000",
            ">= 5000",
            ">= 3000",
            ">= 1000",
            "0 - 1000",
            "1000 - 3000",
            "3000 - 5000",
        ]
        f_order_preset = st.selectbox("Rango predefinido (orden)", preset_options, index=0)

    where = []
    params = []

    if f_specialty:
        where.append("specialty IN ({})".format(",".join(["?"] * len(f_specialty))))
        params.extend(f_specialty)
    if f_ccaa:
        where.append("ccaa IN ({})".format(",".join(["?"] * len(f_ccaa))))
        params.extend(f_ccaa)
    if f_province:
        where.append("province IN ({})".format(",".join(["?"] * len(f_province))))
        params.extend(f_province)
    if f_province_text.strip():
        where.append("LOWER(province) LIKE ?")
        params.append(f"%{f_province_text.strip().lower()}%")
    if f_city:
        where.append("city IN ({})".format(",".join(["?"] * len(f_city))))
        params.extend(f_city)
    if f_city_text.strip():
        where.append("LOWER(city) LIKE ?")
        params.append(f"%{f_city_text.strip().lower()}%")
    if f_center.strip():
        where.append("LOWER(center) LIKE ?")
        params.append(f"%{f_center.strip().lower()}%")

    if f_year != "Todos":
        where.append("last_year = ?")
        params.append(int(f_year))

    if f_places:
        where.append("total_places BETWEEN ? AND ?")
        params.extend([int(f_places[0]), int(f_places[1])])

    preset_ranges = {
        "Personalizado": None,
        ">= 6000": (6000, int(max_order)),
        ">= 5000": (5000, int(max_order)),
        ">= 3000": (3000, int(max_order)),
        ">= 1000": (1000, int(max_order)),
        "0 - 1000": (0, 1000),
        "1000 - 3000": (1000, 3000),
        "3000 - 5000": (3000, 5000),
    }
    order_range = preset_ranges.get(f_order_preset)
    if order_range is None:
        order_range = f_order
    if order_range:
        where.append("last_year_order_max BETWEEN ? AND ?")
        params.extend([int(order_range[0]), int(order_range[1])])

    count_sql = "SELECT COUNT(*) FROM plazas"
    if where:
        count_sql += " WHERE " + " AND ".join(where)
    cur.execute(count_sql, params)
    total_rows = cur.fetchone()[0]

    total_pages = max(1, (total_rows + page_size - 1) // page_size)
    page = st.sidebar.number_input("Página", min_value=1, max_value=int(total_pages), value=1, step=1)
    offset = (int(page) - 1) * page_size

    sql = (
        "SELECT specialty, search_name, ccaa, province, city, center, total_places, "
        "last_year, last_year_order_max, last_year_orders "
        "FROM plazas"
    )
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY (last_year_order_max IS NULL), last_year_order_max DESC"
    sql += " LIMIT ? OFFSET ?"
    query_params = params + [int(page_size), int(offset)]

    cur.execute(sql, query_params)
    cols = [c[0] for c in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]

    st.subheader("Resultados")
    st.write(f"Coincidencias totales: {total_rows} | Página {page} de {total_pages} | Filas en página: {len(rows)}")
    if rows:
        # resumen rápido por especialidad y CCAA (top 5)
        st.caption("Top 5 especialidades (por recuento en filtros actuales)")
        cur.execute(
            f"SELECT specialty, COUNT(*) as n FROM plazas {'WHERE ' + ' AND '.join(where) if where else ''} "
            "GROUP BY specialty ORDER BY n DESC LIMIT 5",
            params,
        )
        spec_summary = cur.fetchall()
        st.write({k: v for k, v in spec_summary})

    st.dataframe(rows, use_container_width=True)

    if rows:
        csv_rows = []
        csv_rows.append(cols)
        for r in rows:
            csv_rows.append([r.get(c, "") for c in cols])
        csv_text = "\n".join(",".join(["\"" + str(v).replace("\"", "\"\"") + "\"" for v in row]) for row in csv_rows)
        xlsx_bytes = _xlsx_bytes(cols, rows)
        st.markdown("---")
        st.subheader("Descargas")
        col_a, col_b = st.columns(2)
        with col_a:
            st.download_button(
                "⬇️ Descargar CSV filtrado",
                data=csv_text,
                file_name="plazas_filtradas.csv",
                mime="text/csv",
                use_container_width=True,
                type="primary",
            )
        with col_b:
            st.download_button(
                "⬇️ Descargar Excel filtrado",
                data=xlsx_bytes,
                file_name="plazas_filtradas.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                use_container_width=True,
            )


if __name__ == "__main__":
    main()
