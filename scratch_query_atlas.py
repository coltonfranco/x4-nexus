import sqlite3
import pprint

conn = sqlite3.connect('static.db')
cursor = conn.cursor()
cursor.execute("SELECT ship_id, name, class_id, cargo_volume FROM ships WHERE name LIKE '%Atlas%';")
rows = cursor.fetchall()
pprint.pprint(rows)
