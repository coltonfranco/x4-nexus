import sqlite3

db = sqlite3.connect('static.db')
print("Is Zone003 in DB?", db.execute("SELECT x, z FROM zones WHERE zone_id = 'Zone003_Cluster_26_Sector002_macro'").fetchall())
print("Is Zone004 in DB?", db.execute("SELECT x, z FROM zones WHERE zone_id = 'Zone004_Cluster_26_Sector001_macro'").fetchall())
