
lines = open(r'C:\Users\colto\.gemini\antigravity\brain\565ca67f-dab0-4250-b776-c187715441d0\.system_generated\logs\transcript.jsonl', encoding='utf-8').readlines()

out = []
for line in lines:
    if 'function getEquipmentStats(' in line:
        out.append(line)

open('scratch_recover.txt', 'w', encoding='utf-8').write("\n".join(out))
