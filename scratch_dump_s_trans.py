import sqlite3

conn = sqlite3.connect('raw.db')
cursor = conn.cursor()
cursor.execute("SELECT filepath, content FROM raw_files WHERE filepath LIKE '%ship_arg_s_trans_container_01_a_macro.xml';")
row = cursor.fetchone()
if row:
    print(f"Found {row[0]}:")
    with open('arg_s_trans.xml', 'w', encoding='utf-8') as f:
        f.write(row[1])
