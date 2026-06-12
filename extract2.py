
lines = open(r'C:\Users\colto\.gemini\antigravity\brain\565ca67f-dab0-4250-b776-c187715441d0\.system_generated\logs\transcript.jsonl', encoding='utf-8').readlines()
matches = [l for l in lines if 'function getEquipmentStats(item: EquipmentItem)' in l]

for m in matches:
    # Just look for the function body in the string using simple substring matching
    idx = m.find('function getEquipmentStats(item: EquipmentItem)')
    if idx != -1:
        end_idx = m.find('EquipmentCard', idx)
        snippet = m[idx:end_idx] if end_idx != -1 else m[idx:idx+2000]
        # Clean up JSON escaping
        snippet = snippet.replace('\\n', '\n').replace('\\"', '"').replace('\\\\', '\\')
        with open('found.txt', 'a', encoding='utf-8') as out:
            out.write(snippet)
            out.write("\n\n---NEXT---\n\n")
