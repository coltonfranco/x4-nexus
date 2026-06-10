from lxml import etree
from x4_api.config import settings
from x4_api.extract import catdat

cat_paths = catdat.discover_cats(settings.install_path)
idx = catdat.build_index(cat_paths)

macro_bytes = catdat.read_entry(idx['index/macros.xml'])
mroot = etree.fromstring(macro_bytes)

for entry in mroot.xpath('//entry[starts-with(@name, "ship_")]')[:2]:
    path = entry.get("value").replace("\\", "/") + ".xml"
    if path in idx:
        ship_bytes = catdat.read_entry(idx[path])
        print(ship_bytes.decode('utf-8')[:1500])
