import json
import sqlite3


def main():
    try:
        conn = sqlite3.connect('raw.db')
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Check tables in raw.db
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = [r[0] for r in cursor.fetchall()]
        print("Tables in raw.db:", tables)
        
        if 'raw_files' in tables:
            cursor.execute("SELECT filepath FROM raw_files WHERE filepath LIKE 'maps/xu_ep2_universe%';")
            files = [r[0] for r in cursor.fetchall()]
            print("Matching files:", json.dumps(files, indent=2))
        else:
            print("raw_files table not found.")
            
    except Exception as e:
        print("Error:", e)

if __name__ == '__main__':
    main()
