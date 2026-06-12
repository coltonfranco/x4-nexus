import sqlite3

conn = sqlite3.connect('raw.db')
cursor = conn.cursor()

cursor.execute("SELECT filepath, content FROM raw_files WHERE filepath LIKE '%ship_par_l_trans_container_03_a_macro.xml';")
row = cursor.fetchone()
if row:
    print(f"Found {row[0]}:")
    with open('helios_macro.xml', 'w', encoding='utf-8') as f:
        f.write(row[1])
    print("Wrote to helios_macro.xml")
else:
    print("Not found in files.")
