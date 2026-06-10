import sqlite3
conn = sqlite3.connect('raw.db')
conn.execute("ATTACH DATABASE 'static.db' AS static")
roles = [r[0] for r in conn.execute('SELECT DISTINCT role FROM static.ships').fetchall()]
print(roles)
