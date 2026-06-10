import sqlite3


def main():
    conn = sqlite3.connect('raw.db')
    row = conn.execute("SELECT content FROM raw_files WHERE filepath='libraries/factions.xml'").fetchone()
    if row:
        with open('temp_factions.xml', 'w', encoding='utf-8') as f:
            f.write(row[0])
        print("Success")
    else:
        print("Not found")

if __name__ == '__main__':
    main()
