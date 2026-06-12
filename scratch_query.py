import os
import sqlite3
import sys

db_paths = [
    'C:/Users/colto/.gemini/antigravity/data/static.db',
    'C:/Users/colto/git/x4-companion/packages/x4-api/data/static.db',
    'C:/Users/colto/git/x4-companion/static.db',
    'data/static.db',
    'packages/x4-api/data/static.db'
]

db_path = None
for p in db_paths:
    if os.path.exists(p):
        db_path = p
        break

if db_path is None:
    print("Database not found!")
    sys.exit(1)

conn = sqlite3.connect(db_path)
print("DB found at:", db_path)
for row in conn.execute("SELECT ware_id, name, icon_path FROM wares WHERE group_id = 'engines' LIMIT 5;"):
    print(row)
