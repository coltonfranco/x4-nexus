import sqlite3

conn = sqlite3.connect('raw.db')
cursor = conn.cursor()
cursor.execute("SELECT filepath, content FROM raw_files WHERE filepath LIKE '%storage_par_l_trans_container_03_a_macro.xml';")
row = cursor.fetchone()
if row:
    print(f"Found {row[0]}:")
    print(row[1][:1500])
else:
    print("Not found in files.")
