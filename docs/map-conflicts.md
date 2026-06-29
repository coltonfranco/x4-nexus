# Map Conflicts & Border Tensions

This document outlines the logic used by the X4 Companion Dashboard to detect, categorize, and visualize faction hostilities across the map.

## 1. Faction Alliances (Greedy Grouping)
When multiple factions are present in a sector with combat ships, the dashboard groups them into "Alliances" (or "Sides") to display exactly who is fighting who. 

This relies on a **greedy alliance algorithm**:
1. All factions in the sector are sorted from largest fighting force to smallest.
2. The algorithm iterates down the list. Each faction is placed into the *first* alliance group where it has **zero hostilities** with any existing member of that group.
3. If the faction is mutually hostile to at least one member in *every* existing group, it starts a brand new group.

**Consequences:**
* The largest armies act as "anchors" for the alliances.
* Neutral or friendly "peacemaker" factions will automatically group up with whichever of their friends has the largest army in that specific sector.
* It dynamically handles complex multi-way wars (e.g. A vs B vs C) by splitting the sector into a 3-way or 4-way battle layout automatically.

## 2. Sector Conflicts (Active Combat)
The `/api/v1/map/conflicts` endpoint evaluates every sector to see if a significant combat engagement is currently happening.

A conflict only registers if the **second largest hostile force** in the sector is at least 5 ships. If there are 50 Xenon but only 4 Argon ships, it does not register as a map conflict (to prevent map clutter from tiny raiding parties).

### Conflict Tiers
* **Battle**: Both the largest force AND the second largest force have **at least 10 fighters**.
* **Skirmish**: The second largest force has at least 5 fighters, but one (or both) sides have **fewer than 10 fighters**.
* **Invasion**: A special case where the defending force has fewer than 5 fighters, but the invading force has at least 5 fighters AND is actively hostile to the sector's local owner.

### Conflict Intensity (0.0 to 1.0)
Intensity scales differently based on the conflict type:
* **Battles**: `intensity = second_largest_force / 40.0`. Maxes out at a 40 vs 40 battle (1.0). A 40 vs 40 fight is a massive engagement inside a single sector that will severely impact the local economy.
* **Invasions**: `intensity = largest_force / 100.0`. Scales based on the severity of the invading fleet.
* **Skirmishes**: Always locked to a low intensity, as they are minor skirmishes.

### UI Badges
* **> 0.9 Intensity**: Intense blinking animation (Massive Sector Battle)
* **> 0.5 Intensity**: Fast pulse animation
* **> 0.2 Intensity**: Slow pulse animation

## 3. Border Tensions (Passive Standoffs)
The `/api/v1/map/tensions` endpoint evaluates adjacent sectors connected by gates or superhighways to detect hostile forces amassing on the borders.

A border tension is registered if **either** of these conditions are met:
1. **Mutual Standoff**: Both sides of the gate have at least 10 ships belonging to mutually hostile factions.
2. **Invasion Threat**: One side of the gate has at least 20 ships that are explicitly hostile to the **owner** of the sector on the other side of the gate.

### Tension Intensity (0.0 to 1.0)
Unlike Sector Conflicts, Border Tensions use the **total combined number of hostile fighters** stationed on both sides of the gate.
* `intensity = total_fighters / 150.0`

It maxes out at **150 total ships**. The scale is much larger than Sector Conflicts because passive standoffs are extremely common in the X4 engine (e.g., 60 Xenon loitering in Tharka's Cascade without invading). If the scale maxed out at 40 ships, half the map borders would be permanently blinking red, rendering the warning useless.

### UI Tension Lines
* **> 0.8 Intensity (120+ ships)**: Pulsing Red border, red text, red blinking dot. (Critical invasion fleet)
* **> 0.5 Intensity (75+ ships)**: Solid Red border, red text, solid red dot. (High tension standoff)
* **> 0.3 Intensity (45+ ships)**: Solid Orange border, orange text, solid orange dot. (Medium buildup)
* **< 0.3 Intensity (< 45 ships)**: Solid Yellow border, yellow text, solid yellow dot. (Low priority skirmishing / light raiding)

A "low priority" solid yellow line of 40 fighters waiting at a gate could instantly explode into a maximum intensity "Blinking Red" Sector Battle if those 40 ships actually cross the gate and engage a defending fleet of 40 ships (since Sector Battles max out at 40 vs 40).
