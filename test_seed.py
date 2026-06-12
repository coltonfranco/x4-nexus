import sqlite3
try:
    conn = sqlite3.connect('static.db')
    conn.row_factory = sqlite3.Row
    print('Sample equip modules:')
    for row in conn.execute('SELECT module_id, kind FROM modules WHERE module_id LIKE "%equip%" LIMIT 10').fetchall():
        print(dict(row))
except Exception as e:
    print(e)
