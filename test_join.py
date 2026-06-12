import sqlite3
from pathlib import Path

db_path = Path("packages/x4-api/data/static.db").resolve().as_posix()
c = sqlite3.connect(":memory:")
c.execute(f"ATTACH DATABASE '{db_path}' AS s")

row = c.execute("SELECT s.ship_id, REPLACE(s.ship_id, '_macro', ''), w.ware_id, w.price_avg FROM s.ships s LEFT JOIN s.wares w ON w.ware_id = REPLACE(s.ship_id, '_macro', '') WHERE s.ship_id = 'ship_arg_l_destroyer_01_a_macro'").fetchone()
print(row)
