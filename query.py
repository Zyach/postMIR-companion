import argparse

from db_utils import connect_db


def top3_by_specialty(conn, year, specialties):
    cur = conn.cursor()
    output = {}
    for spec in specialties:
        cur.execute(
            """
            SELECT specialty, center, city, province, ccaa, last_year_order_max
            FROM plazas
            WHERE specialty = ? AND last_year = ? AND last_year_order_max IS NOT NULL
            ORDER BY last_year_order_max DESC
            LIMIT 3
            """,
            (spec, year),
        )
        output[spec] = cur.fetchall()
    return output


def main():
    parser = argparse.ArgumentParser(description="Consultas rápidas del dataset PostMIR")
    parser.add_argument("--year", type=int, default=2025)
    parser.add_argument("--specialty", action="append", required=True)
    args = parser.parse_args()

    conn = connect_db()
    results = top3_by_specialty(conn, args.year, args.specialty)
    for spec, rows in results.items():
        print(spec)
        if not rows:
            print("  (sin datos)")
            continue
        for r in rows:
            _, center, city, province, ccaa, order_max = r
            print(f"  {order_max} | {center} | {city} | {province} | {ccaa}")


if __name__ == "__main__":
    main()
