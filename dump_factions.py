import gzip
from lxml import etree
save_path = r'C:\Users\colto\sss\Documents\Egosoft\X4\59308344\save\save_001.xml.gz'
with gzip.open(save_path, 'rb') as f:
    context = etree.iterparse(f, events=('end',))
    count = 0
    for event, elem in context:
        if elem.tag == 'faction':
            print("FACTION:", elem.get('id'), "knownto:", elem.get('knownto'))
            count += 1
            if count >= 10:
                break
        elem.clear()
        while elem.getprevious() is not None:
            del elem.getparent()[0]
