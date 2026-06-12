import sqlite3
import xml.etree.ElementTree as ET

conn = sqlite3.connect('raw.db')

def print_tree(el, depth=0):
    indent = "  " * depth
    print(f"{indent}{el.tag} {el.attrib}")
    for child in el:
        print_tree(child, depth+1)

def print_destinations(filepath, ref):
    print(f"\n--- {filepath} ({ref}) ---")
    row = conn.execute("SELECT content FROM raw_files WHERE filepath = ?", (filepath,)).fetchone()
    if not row: return
    root = ET.fromstring(row[0])
    conns = root.findall(f'.//connection[@ref="{ref}"]')
    for i, c in enumerate(conns[:5]):
        print(f"\nConnection {i}:")
        print_tree(c)

print_destinations('maps/xu_ep2_universe/galaxy.xml', 'destination')
print_destinations('maps/xu_ep2_universe/clusters.xml', 'sechighways')
print_destinations('maps/xu_ep2_universe/clusters.xml', 'zonehighways')
print_destinations('maps/xu_ep2_universe/sechighways.xml', 'sechighways')
print_destinations('maps/xu_ep2_universe/zonehighways.xml', 'zonehighways')
