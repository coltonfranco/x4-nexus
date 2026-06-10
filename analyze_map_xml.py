import sqlite3
import xml.etree.ElementTree as ET
from collections import Counter

def analyze_xml(filepath):
    print(f"\n--- Analyzing {filepath} ---")
    conn = sqlite3.connect('raw.db')
    cursor = conn.cursor()
    cursor.execute("SELECT content FROM raw_files WHERE filepath = ?", (filepath,))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        print("Not found.")
        return
        
    xml_data = row[0]
    try:
        root = ET.fromstring(xml_data)
        tags = Counter([elem.tag for elem in root.iter()])
        print("Tags found:")
        for tag, count in tags.most_common():
            print(f"  {tag}: {count}")
            
        # specifically look at one <macro class="sector"> or <macro class="cluster">
        for macro in root.iter("macro"):
            print("\nExample macro attributes:", macro.attrib)
            for child in macro.iter():
                if child != macro:
                    print(f"  {child.tag}: {child.attrib}")
            break
            
    except Exception as e:
        print("Error parsing XML:", e)

def main():
    analyze_xml('maps/xu_ep2_universe/sectors.xml')
    analyze_xml('maps/xu_ep2_universe/clusters.xml')

if __name__ == '__main__':
    main()
