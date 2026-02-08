from db_utils import DB_PATH, ensure_db


def main():
    ensure_db()
    print(DB_PATH)


if __name__ == "__main__":
    main()
