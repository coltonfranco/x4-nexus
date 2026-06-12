import pprint
import sqlite3

conn = sqlite3.connect('static.db')
cursor = conn.cursor()
cursor.execute("SELECT ship_id, name, cargo_volume, file_path FROM ships WHERE name LIKE '%helios%';")
rows = cursor.fetchall()
pprint.pprint(rows)

cursor.execute("SELECT ship_id, name, cargo_volume FROM ships WHERE class_id = 'xl' LIMIT 5;")
rows2 = cursor.fetchall()
pprint.pprint(rows2)
