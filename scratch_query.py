import sqlite3
import dataclasses
from x4_extract.static import ships
from x4_extract.i18n import Localizer

conn = sqlite3.connect("raw.db")
localizer = Localizer(conn, "044")

s1 = localizer.resolve("{20111,3101}")
s2 = localizer.resolve("{20111,3201}")
print("3101 resolves to:", repr(s1))
print("3201 resolves to:", repr(s2))
