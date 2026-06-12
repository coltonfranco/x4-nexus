import sqlite3

conn = sqlite3.connect('catalog.db')
cursor = conn.cursor()
cursor.execute("SELECT path, save_name, in_game_time_sec, real_time_iso, mtime FROM save_catalog")
rows = cursor.fetchall()
for row in rows:
    print(row)
