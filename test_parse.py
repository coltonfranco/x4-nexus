import gzip
from lxml import etree
save_path = r'C:\Users\colto\sss\Documents\Egosoft\X4\59308344\save\save_001.xml.gz'
has_modules = 0
no_modules = 0
with gzip.open(save_path, 'rb') as f:
    context = etree.iterparse(f, events=('start', 'end'))
    for event, elem in context:
        if event == 'end' and elem.tag == 'component' and elem.get('class') == 'station':
            connections = elem.find('connections')
            has_mod = False
            if connections is not None:
                for conn in connections.findall('connection'):
                    if conn.get('connection') == 'modules':
                        has_mod = True
                        break
            if has_mod:
                has_modules += 1
            else:
                no_modules += 1
                if elem.get('id') == '[0x5f4f3]':
                    print("Found 0x5f4f3 with NO modules")
            elem.clear()
            while elem.getprevious() is not None:
                del elem.getparent()[0]
print(f"Stations with modules: {has_modules}")
print(f"Stations without modules: {no_modules}")
