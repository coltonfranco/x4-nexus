# Logbook categories — complete template reference

All logbook entries the game can generate are templated from 361 text strings in
three pages of the game's text database (`t/0001-l044.xml`). This doc maps every
known template to a semantic category and proposes pattern-driven classification
rules that auto-classify new/unknown entries.

## Source

The `texts` table in `static.db` (populated from `t/0001-l044.xml` during
`rebuild-static`). Three pages contain all logbook templates:

| page_id | Count | Content |
|---------|-------|---------|
| 1015 | 197 | Main messages: trade, reputation, hacking, missions, boarding, tutorials, ventures, research, signal scanning, mode changes |
| 1016 | 105 | Location-specific: destruction, attacks, crew, construction, refueling, death causes, trade reports, looting |
| 1036 | 59 | Alert types + player response options: pirate/police encounters, abandoned ships, lockboxes, attacks |

## Dynamic classification architecture

Static template-ID mapping won't survive game updates. Instead, classify by
**matching against the resolved text** (after `$VARIABLE$` substitution). Rules
are ordered patterns — first match wins, unmatched entries fall to `__none__`.

Rules live in a single JSON file consumed by both the API filter and the
frontend renderer. No duplicated logic.

```json
{
  "categories": {
    "combat": {
      "label": "Combat",
      "icon": "Crosshair",
      "color": "red",
      "priority": [
        // Patterns checked in order.  Matched against lowercased title+text.
        "emergency alert",
        "was destroyed",
        "has been destroyed",
        "under attack",
        "hostile object",
        "forced to flee",
        "early warning system"
      ]
    },
    "trade": {
      "label": "Trade",
      "patterns": [
        "bought", "sold", "trade successful", "trade failed",
        "debit withdrawal", "payment received", "insufficient funds",
        "budget exceeded", "buying", "selling", "trade operations",
        "ready to trade", "trade subscription", "trade update"
      ]
    }
    // ... etc
  }
}
```

This way new templates that mention "destroyed" or "attack" automatically
land in `combat` without being added to a static list.

## Proposed semantic categories

| Category | Patterns / native match | Covers |
|----------|------------------------|--------|
| `combat` | `emergency alert`, `was destroyed`, `has been destroyed`, `under attack`, `hostile object`, `forced to flee`, `early warning system` | Destruction, attacks, hostile detection |
| `trade` | `bought`, `sold`, `trade successful`, `trade failed`, `debit withdrawal`, `payment received`, `insufficient funds`, `budget exceeded`, `buying`, `selling`, `all trade operations`, `ready to trade`, `trade subscription`, `finished mining`, `finished construction`, `finished resupplying`, `finished repairing` | Economy transactions |
| `reputation` | title starts with `reputation`, `relations improved`, `relations worsened` | Faction standing changes |
| `missions` | native `missions`, `mission update`, `task complete`, `tutorial aborted`, `subscription aborted`, `no mission available`, `out of time` | Mission lifecycle |
| `crew` | `hired`, `assigned`, `transferred`, `fired`, `crew`, `arrived` (when about personnel) | Personnel management |
| `boarding` | `boarding report`, `boarding pod`, `marines`, `breaching`, `casualties`, `captured`, `successfully boarded`, `failed to board` | Boarding operations |
| `police` | title starts with `police`, `scanned and forced`, `inspected by police`, `illegal cargo`, `illegal station plot` | Law enforcement |
| `alerts` | native `alerts`, `pirate harassment`, `found abandoned ship`, `found lockbox`, `found contraband`, `hostile` (in alerts context) | Pilot alerts |
| `construction` | `construction of`, `station plot`, `ship constructed`, `ship repaired`, `ship resupplied` | Building/repair |
| `looting` | `picked up`, `collected`, `lockbox`, `materials collected`, `ammo collected`, `container`, `inventory item` | Item/container pickup |
| `hacking` | `hack`, `turrets disabled`, `force fields disabled`, `drone launchers`, `discount unlocked`, `commission unlocked`, `trade partner added` | Hacking/scanning rewards |
| `research` | `research available`, `research completed`, `blueprint`, `decrypting`, `data decrypted`, `signal`, `unidentified data`, `unidentified audio` | Research + signal scanning |
| `ventures` | `returned from`, `venture` | Online ventures |
| `news` | native `news`, `breaking news`, `live from`, `timeline entry`, `war update`, `news update` | In-game news |
| `tips` | native `tips` | Gameplay tips |
| `upkeep` | native `upkeep`, `account for`, `surplus received`, `storage full` | Station maintenance |
| `rewards` | `rewarded`, `reward received`, `bounty awarded` | External rewards |
| `death` | `cause of death`, `killed by`, `lost.*crew due to attack` | Personnel deaths |
| `refueling` | `refuel`, `jump fuel`, `fuel cells` | Ship refueling |
| `mode` | `travel mode`, `scan mode`, `long range scan`, `seta mode` | Player mode toggles |
| `__none__` | Catch-all | Unmatched entries |

## Complete template reference by page

### page_id=1015 — Main logbook messages

| text_id | Template | Proposed category |
|---------|----------|-------------------|
| 1 | `$ENTITYTYPE$ $ENTITYNAME$ on $OBJECTNAME$:` | — (prefix only) |
| 2 | `Bought $AMOUNT$ $WARE$ for $PRICE$ Cr` | trade |
| 3 | `$AMOUNT$ $WARE$ were lost in this transaction` | trade |
| 4 | `Sold $AMOUNT$ $WARE$ for $PRICE$ Cr` | trade |
| 5 | `Trade successful` | trade |
| 7 | `Debit withdrawal: $MONEY$ Cr` | trade |
| 8 | `Payment received: $MONEY$ Cr` | trade |
| 9 | `Picked up content` | looting |
| 10 | `Discount unlocked` | hacking |
| 11 | `Commission unlocked` | hacking |
| 14 | `Reputation gained` | reputation |
| 15 | `Reputation lost` | reputation |
| 16 | `Lost reputation temporarily` | reputation |
| 17 | `Successfully hacked` | hacking |
| 18 | `Hacking attempt failed` | hacking |
| 19 | `Inventory used up` | looting |
| 20 | `Failed buying ware` | trade |
| 21 | `Failed buying amount` | trade |
| 22 | `Failed selling ware` | trade |
| 23 | `Failed selling amount` | trade |
| 24 | `Info: gas mining stopped` | trade |
| 25 | `Info: mineral mining stopped` | trade |
| 28 | `Insufficient funds` | trade |
| 29 | `Info: insufficient money` | trade |
| 30 | `Trade successful` | trade |
| 31 | `Task complete` | missions |
| 32 | `All trade operations completed.` | trade |
| 35 | `%s %s Requesting Orders` | crew |
| 39 | `Spent %1 Cr.` | trade |
| 40 | `Received %1 Cr.` | trade |
| 41 | `You are out of time. Mission Cancelled.` | missions |
| 42 | `Ammo collected` | looting |
| 43 | `Out of ammo` | combat |
| 44 | `Dropped container collected` | looting |
| 45 | `Illegal cargo dropped` | police |
| 46 | `Buying $AMOUNT$ $WARE$ for $PRICE$ Cr from $SELLERNAME$` | trade |
| 47 | `Selling $AMOUNT$ $WARE$ for $PRICE$ Cr to $BUYERNAME$` | trade |
| 48 | `Materials collected` | looting |
| 49 | `Storage: $PERCENTAGE$% full` | upkeep |
| 50 | `Ammo received` | looting |
| 51 | `Inventory item collected` | looting |
| 52 | `Inventory items collected` | looting |
| 53 | `Cargo storage full ($STORAGETYPE$)` | upkeep |
| 54 | `Required storage type: $STORAGETYPE$` | upkeep |
| 55 | `Cannot collect container` | looting |
| 56 | `Cannot collect materials` | looting |
| 70 | `Hack successful` | hacking |
| 71 | `Duration:` | hacking |
| 72 | `Ware containers ejected` | hacking |
| 75 | `Ware containers ejected:` | hacking |
| 76 | `Turrets disabled:` | hacking |
| 77 | `Force fields disabled:` | hacking |
| 78 | `Drone launchers disabled:` | hacking |
| 79 | `Permanent trade subscription added` | hacking |
| 80 | `Trade partner added to database` | hacking |
| 81 | `Out of info to unlock from this module` | hacking |
| 90 | `Reward received` | rewards |
| 91 | `Rewards received` | rewards |
| 100 | `Item received` | looting |
| 101 | `Item given to %s` | looting |
| 102 | `Item destroyed` | looting |
| 103 | `Unlocked blueprint %s` | research |
| 104 | `Inventory item already in possession` | looting |
| 110 | `Locks` | looting |
| 130 | `Crafting Progress` | research |
| 140-142 | `You have entered space protected by: %1.` ... | police |
| 160 | `Boarding report` | boarding |
| 161 | `No marines lost` | boarding |
| 162 | `Marines lost` | boarding |
| 163 | `$RANKNAME$: $NUM$` | boarding |
| 164 | `$NUM$ marines remaining` | boarding |
| 170 | `Travel Mode activated.` | mode |
| 171 | `Travel Mode aborted.` | mode |
| 172 | `Travel Mode charging.` | mode |
| 173 | `Scan Mode activated.` | mode |
| 174 | `Scan Mode aborted.` | mode |
| 175 | `Long Range Scan Mode activated.` | mode |
| 176 | `Long Range Scan Mode aborted.` | mode |
| 177 | `SETA Mode activated.` | mode |
| 178 | `SETA Mode aborted.` | mode |
| 179 | `Travel Mode disrupted.` | mode |
| 180 | `Unidentified data signal` | research |
| 181 | `Unidentified audio signal` | research |
| 182 | `Decrypting data stream...` | research |
| 183 | `Decryption failed` | research |
| 184 | `SUCCESS! Data decrypted.` | research |
| 185 | `Weak broadcast signal detected` | research |
| 186 | `Modulating audio signal...` | research |
| 187 | `Signal lost` | research |
| 188 | `SUCCESS! Communication established.` | research |
| 189 | `New entry added to Timeline.` | news |
| 190 | `Breaking news...` | news |
| 191 | `Live from $LOCATION$: $PERSON$` | news |
| 192 | `Timeline entry already unlocked.` | news |
| 240 | `$NUMCREW$ crew members arrived at $OBJECTNAME$` | crew |
| 241 | `$NPC$ arrived at $OBJECTNAME$` | crew |
| 242 | `$NPC$ arrived` | crew |
| 250 | `Current reputation` | reputation |
| 251 | `Reason` | — (meta text) |
| 260 | `Active tool: %s` | — |
| 261 | `Scan insufficient. Scan from Spacesuit.` | — |
| 262 | `Under attack` | combat |
| 263 | `Found an abandoned ship` | alerts |
| 264 | `Inspected by police` | police |
| 265 | `Harassed by pirates` | alerts |
| 266 | `Ready to trade` | trade |
| 268 | `Station plot for $STATION$ in sector $SECTOR$ is not paid for.` | upkeep |
| 269 | `Found a lockbox` | alerts |
| 270 | `Early warning system` | combat |
| 271 | `%s hostile objects detected.` | combat |
| 272 | `%s (%s) detected.` | combat |
| 273 | `Hostile objects detected.` | combat |
| 275 | `%s hostile ships detected.` | combat |
| 276 | `%s hostile ship detected.` | combat |
| 277 | `%s hostile stations detected.` | combat |
| 278 | `%s hostile station detected.` | combat |
| 279 | `%s hostile object detected.` | combat |
| 300 | `Mission update: $REASON$` | missions |
| 301 | `War update: $REASON$` | news |
| 302 | `Police update: $REASON$` | police |
| 303 | `Trade update: $REASON$` | trade |
| 304 | `Bounty update: $REASON$` | rewards |
| 305 | `Mentor update: $REASON$` | tips |
| 306 | `Pirate update: $REASON$` | alerts |
| 308 | `News update: $REASON$` | news |
| 309 | `Emergency alert: $REASON$` | combat |
| 400-414 | `Tutorial aborted.` (various reasons) | missions |
| 430-431 | `Subscription aborted.` | missions |
| 500 | `Warning: about to leave staging area.` | alerts |
| 600-601 | `Currently no mission available` | missions |
| 700-701 | `ships have returned from the venture` | ventures |
| 801-811 | Boarding report details (marines, pods, defenders, breaching) | boarding |
| 812 | `The marines are retreating` | boarding |
| 906-907 | (references to other text) | — |
| 910-911 | `Blueprints for wharfs/shipyards now available` | research |
| 920-922 | `Wharfs/Shipyards/Equipment docks can now be constructed.` | research |
| 1001 | `Debit withdrawal` | trade |
| 1002 | `Payment received` | trade |
| 1003 | `Awaiting orders` | crew |
| 1004 | `Order could not be completed` | crew |
| 1005 | `Report on successful trade` | trade |
| 1006 | `Budget exceeded after trade` | trade |
| 1007 | `Trade failed` | trade |
| 1008 | `All trade operations completed` | trade |
| 1009 | `Starting ware transfer` | trade |
| 1010 | `Ship destroyed` | combat |
| 1011 | `Ship returned from a venture` | ventures |
| 1012 | `Station destroyed` | combat |
| 1013 | `$OBJECT$ $LOCATION$ under attack` | combat |
| 1020 | `Caught trading with illegal wares` | police |
| 1021 | `Illegal station plot detected by police` | police |
| 1022 | `Hostile object detected` | combat |
| 1023 | `Crew arrived` | crew |
| 1100 | `Research available: $WARE$` | research |
| 1101 | `Research completed: $WARE$` | research |

### page_id=1016 — Location-specific entries

| text_id | Template | Proposed category |
|---------|----------|-------------------|
| 10 | `$SHIP$ in sector $SECTOR$ has successfully refueled.` | refueling |
| 11 | `$SHIP$ ... could not refuel because the Jump Drive was damaged.` | refueling |
| 12 | `$SHIP$ ... could not refuel because there was no free storage space.` | refueling |
| 13 | `$SHIP$ ... could not buy jump fuel.` | refueling |
| 14 | `$SHIP$ ... has insufficient fuel to jump to the destination.` | refueling |
| 15 | `Transferred $MONEY$ Cr to $ENTITY$ to buy $AMOUNT$ Fuel Cells.` | refueling |
| 20 | `$SHIP$ in $SECTOR$ was scanned and forced to drop all illegal cargo.` | police |
| 30 | `$KILLED$ $LOCATION$ was destroyed.` | combat |
| 31 | `$KILLED$ $LOCATION$ was destroyed by $KILLER$.` | combat |
| 32 | `$SHIP$ was forced to flee after being attacked in $ORIGIN$.` | combat |
| 33 | `$SHIP$ was forced to flee after being attacked by $ATTACKER$ in $ORIGIN$.` | combat |
| 34 | `$KILLED$ was destroyed.` | combat |
| 35 | `$KILLED$ has been destroyed.` | combat |
| 37 | `$ATTACKED$ is under attack.` | combat |
| 40 | `Received surplus of $MONEY$ Credits from $TRADER$.` | trade |
| 41 | `The account for $STATION$ in $ZONE$ has dropped to $MONEY$ Credits.` | upkeep |
| 42 | `$STATION$ in $ZONE$ has had $AMOUNT$ transfered to its account.` | trade |
| 43 | `The account for $STATION$ in $SECTOR$ has dropped to $MONEY$ Credits.` | upkeep |
| 44 | `$STATION$ in $SECTOR$ has had $AMOUNT$ transferred to its account.` | trade |
| 45 | `Received surplus from $STATION$ in $SECTOR$.` | trade |
| 50 | `Construction of $STATION$ in sector $SECTOR$ completed.` | construction |
| 51 | `Construction of $SHIP$ in sector $SECTOR$ completed.` | construction |
| 60-63 | `Arrived at destination but cannot buy/sell $WARE$.` | trade |
| 70 | `Hired $ENTITYTYPE$ $ENTITYNAME$ on $STATION$ in $ZONE$.` | crew |
| 71 | `Assigned $ENTITYTYPE$ $ENTITYNAME$ to $OBJECT$ in $ZONE$.` | crew |
| 72 | `Assigned $ENTITYTYPE$ $ENTITYNAME$ to $OBJECT$.` | crew |
| 73 | `Transferred $ENTITYTYPE$ $ENTITYNAME$ to $PLAYERSHIP$.` | crew |
| 74 | `Fired $ENTITYTYPE$ $ENTITYNAME$.` | crew |
| 75 | `Hired $ENTITYTYPE$ $ENTITYNAME$ on $STATION$ in $SECTOR$.` | crew |
| 76 | `Assigned $ENTITYTYPE$ $ENTITYNAME$ to $OBJECT$ in $SECTOR$.` | crew |
| 79 | `Forced pilot to leave ship $SHIP$ in sector $SECTOR$.` | combat |
| 80 | `Captured $SHIP$ in sector $SECTOR$.` | boarding |
| 81 | `Claimed $SHIP$ in sector $SECTOR$.` | boarding |
| 82 | `Successfully boarded $SHIP$ in sector $SECTOR$.` | boarding |
| 83 | `Failed to board $SHIP$ in sector $SECTOR$.` | boarding |
| 84-86 | `There were $NUM$ casualties.` / `1 casualty` / `no casualties` | boarding |
| 87-88 | `marines were promoted` / `1 marine was promoted` | boarding |
| 90-91 | `%1 %2 sold/bought %3 %4 to/from %5 %6 in %7 for %8 Cr.` | trade |
| 92 | `%1 (%2) docked at %3 (%4) and is ready to trade.` | trade |
| 93 | `%1 (%2) finished mining in sector %3.` | trade |
| 94 | `%1 offered a reward for protecting %2 (%3).` | rewards |
| 95 | `%1 (%2) ran out of ammunition while in combat.` | combat |
| 96 | `%1 (%2) finished construction at station: %3 (%4). They have paid the station %5 Cr.` | construction |
| 97 | `%1 (%2) finished resupplying at station: %3 (%4). They have paid the station %5 Cr.` | construction |
| 98 | `%1 (%2) finished repairing at station: %3 (%4). They have paid the station %5 Cr.` | construction |
| 100 | `Rewarded for station defence` | rewards |
| 101 | `Trade subscription at %s (%s) in sector %s awarded.` | trade |
| 102 | `Bounty awarded: %s` | rewards |
| 103-104 | `Relations improved.` / `Relations improved to %s.` | reputation |
| 105-106 | `Relations worsened.` / `Relations worsened to %s.` | reputation |
| 120-121 | `Illegal station plot` / `Station plot ... not paid for and was detected.` | police |
| 130-133 | `$ENTITYNAME$ handed you the following item(s)` | looting |
| 150 | `Ship constructed` | construction |
| 151 | `Ship resupplied` | construction |
| 152 | `Ship repaired` | construction |
| 1000-1001 | `$SHIP$ ($IDCODE$) lost $NUMBER$ crew due to attack` | death |
| 2001-2006 | `Cause of death:` / `Killed by $KILLER$` / `Killed by $WEAPON$` | death |
| 2011-2025 | Death causes: Asphyxiation, Self-destruction, Environmental Hazard, Unknown, Radiation, Immolation, Electrocution, Freezing, Explosion, Blunt Trauma, Exsanguination, Rapid Decompression, Collision, Recycled, Vanished Without a Trace | death |

### page_id=1036 — Alert types + player responses

| text_id | Template | Proposed category |
|---------|----------|-------------------|
| 101-103 | `Pirate Harassment` | alerts |
| 111-113 | `Police Interdiction` | police |
| 121-123 | `Found Abandoned Ship` | alerts |
| 131-133 | `Found Lockbox` | alerts |
| 141-143 | `Under Attack` | combat |
| 151-153 | `Found Contraband` | alerts |
| 161-163, 201-202 | `Attack` (response option) | combat |
| 211-212, 221-222, 231-232 | `Comply`, `Escape`, `Wait` (response options) | — |
| 241-242, 251-252, 261-262, 271-272 | `Claim`, `Mark`, `Protect`, `Ignore` abandoned ship | — |
| 281-282, 291-292, 301-302 | `Collect`, `Ignore`, `Protect` lockbox | — |
| 311-312, 321-322, 331-332 | `Retaliate`, `Escape`, `Ignore` attack | — |
| 341-342, 351-352, 361-362 | `Destroy dropped crates`, `Collect dropped crates`, `Ignore dropped crates` | — |
| 371-372 | `Use judgement` | — |
| 381-382 | `Escape and deploy laser towers` | — |

*Note: text_ids 201-382 in page 1036 are response options for the alert system, not
logbook entries themselves. They should be excluded from classification rules.*

---

## Pattern matching priority

Since entries can match multiple patterns, apply rules in this order (first match
wins, most specific first):

1. Native `category` field matches: `alerts`, `missions`, `news`, `tips`, `upkeep`
2. Title-prefix matches: `Reputation%`, `Police%`, `Assigned%`, `Rewarded%`
3. Content-based matches (checked against lowercased `title`):
   - Combat: `emergency alert`, `destroyed`, `under attack`, `hostile`, `forced to flee`, `early warning`
   - Boarding: `boarding`, `marines`, `breaching`, `captured`
   - Death: `cause of death`, `killed by`, `lost.*crew`
   - Construction: `construction of`, `ship constructed`, `ship repaired`, `ship resupplied`
   - Research: `research`, `blueprint`, `decrypt`, `signal`, `unidentified data`
   - Hacking: `hack`, `turrets disabled`, `force fields disabled`, `discount unlocked`, `commission unlocked`
   - Refueling: `refuel`, `jump fuel`, `fuel cells`
   - Mode: `travel mode`, `scan mode`, `seta mode`, `long range scan`
   - Trade: `bought`, `sold`, `trade`, `debit`, `payment`, `insufficient funds`, `budget exceeded`, `mining`, `docked.*ready to trade`
   - Looting: `picked up`, `collected`, `lockbox`, `materials`, `ammo`, `container`, `inventory item`
   - Crew: `hired`, `assigned`, `transferred`, `fired`, `crew`, `arrived`
   - Ventures: `venture`, `returned from`
   - Rewards: `reward`, `bounty`
   - Reputation: `reputation`, `relations improved`, `relations worsened`
   - Police: `police`, `illegal`, `scanned.*cargo`
   - Upkeep: `account.*dropped`, `storage full`, `surplus`
   - Alerts: `pirate`, `harassment`, `abandoned ship`, `contraband`
4. Fallback: `__none__`
