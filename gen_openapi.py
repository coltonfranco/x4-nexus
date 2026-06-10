import urllib.request
import json
import yaml
with urllib.request.urlopen('http://127.0.0.1:8765/api/openapi.json') as r:
  data = json.loads(r.read())
with open('docs/openapi.yaml', 'w') as f:
  yaml.dump(data, f, sort_keys=False)
