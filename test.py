import sqlite3

db = 'c:/Users/colto/git/x4-companion/static.db'
c = sqlite3.connect(db)
for row in c.execute('SELECT d.ware_id, w.name FROM drop_list_wares d LEFT JOIN wares w ON d.ware_id = w.ware_id OR d.ware_id = w.ware_id || "_macro" WHERE d.ware_id = "missile_dumbfire_light_mk1_macro" LIMIT 5'): print(row)
