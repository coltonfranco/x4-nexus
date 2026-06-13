# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: test_logs.spec.ts >> capture logs
- Location: test_logs.spec.ts:4:5

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('text=Conflict')

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]: X4
      - generic [ref=e7]: Companion
    - navigation [ref=e8]:
      - link "Home" [ref=e9] [cursor=pointer]:
        - /url: /
        - img [ref=e10]
        - text: Home
      - link "Empire" [ref=e13] [cursor=pointer]:
        - /url: /empire
        - img [ref=e14]
        - text: Empire
      - link "Trade" [ref=e16] [cursor=pointer]:
        - /url: /trade
        - img [ref=e17]
        - text: Trade
      - link "Equipment" [ref=e20] [cursor=pointer]:
        - /url: /equipment
        - img [ref=e21]
        - text: Equipment
      - link "Inventory" [ref=e24] [cursor=pointer]:
        - /url: /inventory
        - img [ref=e25]
        - text: Inventory
      - link "Map" [ref=e35] [cursor=pointer]:
        - /url: /map
        - img [ref=e36]
        - text: Map
      - link "Ships" [ref=e38] [cursor=pointer]:
        - /url: /ships
        - img [ref=e39]
        - text: Ships
      - link "Factions" [ref=e44] [cursor=pointer]:
        - /url: /factions
        - img [ref=e45]
        - text: Factions
      - link "Drop Tables" [ref=e47] [cursor=pointer]:
        - /url: /drops
        - img [ref=e48]
        - text: Drop Tables
      - link "Diplomacy" [ref=e52] [cursor=pointer]:
        - /url: /diplomacy
        - img [ref=e53]
        - text: Diplomacy
      - link "Player" [ref=e58] [cursor=pointer]:
        - /url: /player
        - img [ref=e59]
        - text: Player
    - generic [ref=e62]:
      - generic [ref=e63]:
        - img [ref=e64]
        - text: Save
      - combobox [ref=e68]:
        - option "Save 001 (15h 10m) ★" [selected]
        - option "Autosave 03 (14h 39m)"
        - option "Autosave 02 (13h 55m) ↻"
        - option "Autosave 01 (13h 3m) ↻"
        - option "Quicksave (6h 30m) ↻"
        - option "Void Loot (2h 43m) ↻"
        - option "Save 003 (0h 55m) ↻"
        - option "Pre Battle (28h 16m) ↻"
      - generic [ref=e69]:
        - generic [ref=e70]: 628,313 Cr
        - generic [ref=e71]: v900
    - generic [ref=e72]:
      - button "Toggle theme" [ref=e73]:
        - img [ref=e74]
      - button "Settings" [ref=e76]:
        - img [ref=e77]
  - main [ref=e80]:
    - generic [ref=e81]:
      - generic [ref=e82]:
        - heading "X4 Companion" [level=1] [ref=e83]
        - paragraph [ref=e84]: "Static catalog explorer for X4: Foundations"
      - generic [ref=e85]:
        - heading "API Status" [level=3] [ref=e87]
        - generic [ref=e89]:
          - generic [ref=e90]:
            - generic [ref=e92]: Online
            - generic [ref=e93]: v0.0.1
          - paragraph [ref=e94]: Game 900
          - paragraph [ref=e95]: Save 10322s old
      - generic [ref=e96]:
        - link "Ships Browse all ships by class and faction. Compare speed, hull, cargo, and equipment slots." [ref=e97] [cursor=pointer]:
          - /url: /ships
          - generic [ref=e99]:
            - img [ref=e101]
            - heading "Ships" [level=3] [ref=e106]
            - paragraph [ref=e107]: Browse all ships by class and faction. Compare speed, hull, cargo, and equipment slots.
        - link "Trade & Production Commodity catalog with price ranges and production chains, plus the live supply radar and ranked routes." [ref=e108] [cursor=pointer]:
          - /url: /trade
          - generic [ref=e110]:
            - img [ref=e112]
            - heading "Trade & Production" [level=3] [ref=e114]
            - paragraph [ref=e115]: Commodity catalog with price ranges and production chains, plus the live supply radar and ranked routes.
        - link "Faction Relations Visualise the diplomatic landscape — network graph and full relation matrix." [ref=e116] [cursor=pointer]:
          - /url: /factions
          - generic [ref=e118]:
            - img [ref=e120]
            - heading "Faction Relations" [level=3] [ref=e122]
            - paragraph [ref=e123]: Visualise the diplomatic landscape — network graph and full relation matrix.
```

# Test source

```ts
  1  | 
  2  | import { test, expect } from '@playwright/test';
  3  | 
  4  | test('capture logs', async ({ page }) => {
  5  |   const logs = [];
  6  |   page.on('console', msg => logs.push(msg.text()));
  7  |   
  8  |   await page.goto('http://127.0.0.1:8765/');
  9  |   await page.waitForTimeout(2000);
  10 |   
> 11 |   await page.click('text=Conflict');
     |              ^ Error: page.click: Test timeout of 30000ms exceeded.
  12 |   await page.waitForTimeout(2000);
  13 |   
  14 |   console.log('--- CAPTURED LOGS ---');
  15 |   logs.forEach(l => {
  16 |       if (l.includes('GATE 115')) {
  17 |           console.log(l);
  18 |       }
  19 |   });
  20 | });
  21 | 
```