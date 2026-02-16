import tempfile
import unittest

from db_utils import validate_csv


HEADERS = [
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
]


def make_csv(rows):
    lines = [",".join(HEADERS)]
    for r in rows:
        lines.append(
            ",".join(
                [
                    str(r.get(col, ""))
                    for col in HEADERS
                ]
            )
        )
    return "\n".join(lines) + "\n"


class CsvValidationTest(unittest.TestCase):
    def test_valid_csv_passes(self):
        data = make_csv(
            [
                {
                    "specialty": "CARDIO",
                    "search_name": "CARDIO",
                    "ccaa": "MADRID",
                    "province": "MADRID",
                    "city": "MADRID",
                    "center": "H. X",
                    "total_places": 10,
                    "last_year": 2025,
                    "last_year_order_max": 1234,
                    "last_year_orders": "[1,2,3]",
                }
            ]
        )
        with tempfile.NamedTemporaryFile("w", delete=False, suffix=".csv") as f:
            f.write(data)
            path = f.name
        self.assertTrue(validate_csv(path))

    def test_missing_column_fails(self):
        bad_headers = HEADERS[:-1]  # drop last_year_orders
        data = ",".join(bad_headers) + "\n" + ",".join(["x"] * len(bad_headers)) + "\n"
        with tempfile.NamedTemporaryFile("w", delete=False, suffix=".csv") as f:
            f.write(data)
            path = f.name
        with self.assertRaises(ValueError):
            validate_csv(path)

    def test_bad_int_fails(self):
        data = make_csv(
            [
                {
                    "specialty": "CARDIO",
                    "search_name": "CARDIO",
                    "ccaa": "MADRID",
                    "province": "MADRID",
                    "city": "MADRID",
                    "center": "H. X",
                    "total_places": "NOT_INT",
                    "last_year": 2025,
                    "last_year_order_max": 1234,
                    "last_year_orders": "[1,2,3]",
                }
            ]
        )
        with tempfile.NamedTemporaryFile("w", delete=False, suffix=".csv") as f:
            f.write(data)
            path = f.name
        with self.assertRaises(ValueError):
            validate_csv(path)


if __name__ == "__main__":
    unittest.main()
