import sqlite3

with sqlite3.connect('raw.db') as conn:
    row = conn.execute("SELECT content FROM raw_files WHERE filepath = 'libraries/region_definitions.xml'").fetchone()
    if row:
        with open('temp_regions.xml', 'w', encoding='utf-8') as f:
            f.write(row[0])
    else:
        print("Not found")
