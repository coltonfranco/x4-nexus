import json

with open(r'C:\Users\colto\.gemini\antigravity\brain\565ca67f-dab0-4250-b776-c187715441d0\.system_generated\logs\transcript.jsonl', encoding='utf-8') as f:
    for line in f:
        if 'function getEquipmentStats(' in line:
            try:
                data = json.loads(line)
                if 'tool_calls' in data:
                    for call in data['tool_calls']:
                        if 'args' in call:
                            if 'ReplacementContent' in call['args']:
                                if 'function getEquipmentStats' in call['args']['ReplacementContent']:
                                    open('scratch_stats_func.txt', 'w', encoding='utf-8').write(call['args']['ReplacementContent'])
                            if 'TargetContent' in call['args']:
                                if 'function getEquipmentStats' in call['args']['TargetContent']:
                                    open('scratch_stats_func_target.txt', 'w', encoding='utf-8').write(call['args']['TargetContent'])
            except Exception:
                pass
