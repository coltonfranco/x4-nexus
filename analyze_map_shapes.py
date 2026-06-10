import sqlite3
import xml.etree.ElementTree as ET

def find_shapes(filepath):
    print(f"\n--- Checking shapes and rotations in {filepath} ---")
    conn = sqlite3.connect('raw.db')
    cursor = conn.cursor()
    cursor.execute("SELECT content FROM raw_files WHERE filepath = ?", (filepath,))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        return
        
    root = ET.fromstring(row[0])
    for offset in root.iter("offset"):
        quaternion = offset.find("quaternion")
        if quaternion is not None:
            print("Found quaternion:", quaternion.attrib)
            break
            
    # Check for sizes/boundaries
    for boundary in root.iter("boundaries"):
        print("Found boundary:", ET.tostring(boundary, encoding='unicode')[:200])
        break
        
def main():
    find_shapes('maps/xu_ep2_universe/clusters.xml')
    find_shapes('maps/xu_ep2_universe/sectors.xml')

if __name__ == '__main__':
    main()
