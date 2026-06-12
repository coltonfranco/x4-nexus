import sqlite3

conn = sqlite3.connect('raw.db')
cursor = conn.cursor()
cursor.execute("SELECT filepath, content FROM raw_files WHERE filepath LIKE '%ship_arg_s_fighter_01_a_macro.xml';")
row = cursor.fetchone()
if row:
    print(f"Found {row[0]}:")
    print(row[1][:1500])

cursor.execute("SELECT filepath, content FROM raw_files WHERE filepath LIKE '%ship_arg_s_trans_container_01_a_macro.xml';")
row2 = cursor.fetchone()
if row2:
    print(f"Found {row2[0]}:")
    print(row2[1][:1500])
