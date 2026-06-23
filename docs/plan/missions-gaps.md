# Missions Page Overhaul — Gaps & Next Steps

## Implemented

- **Master–detail layout**: Left panel (438px, scrollable) + right panel (flex-1, detail view)
- **Sub-tabs**: Mission Board | Run Planner with run count badge
- **Bucket tabs**: Active / Offers / Guild & War segment control in left panel
- **Redesigned cards**: Edge strip, type-color dot, reward + jumps, badge row (type/difficulty/story/faction/vs)
- **Group cards**: Visual differentiation for choice forks (purple) vs all-required sequences (blue)
- **Mission detail**: Bucket label, title, badges, DO THIS NEXT callout (active), reward + briefing cards, objectives checklist with status dots (done/current/next), embedded route map placeholder, Show on Map button
- **Choice group detail**: Radio-button path cards with consequence display on selection, route map
- **All-required group detail**: Progress bar, sub-stage checklist with status, combined tour map
- **Run Planner**: Total reward/jumps/stops stat cards, flight order list with leg jumps, embedded map
- **Fullscreen map**: Wired to existing `MissionMapModal` (needs route data enhancement — see below)

## Files created

```
packages/x4-dashboard/src/routes/missions/
├── index.tsx                  — page shell, state, data fetching, master/detail routing
├── types.ts                   — shared types, constants (Difficulty, MissionType, Bucket, etc.)
├── helpers.tsx                — fmtTime, fmtCredits, typeColor, TypeIcon, LevelBadge, StoryTag, etc.
├── MissionCard.tsx            — mission card for master list
├── OfferCard.tsx              — offer card for master list
├── GroupCard.tsx              — group card (choice/all-required) with deriveGroupKind heuristic
├── MissionDetail.tsx          — single mission detail view
├── ChoiceGroupDetail.tsx      — choice-fork group detail (Yaki Investigation pattern)
├── AllRequiredGroupDetail.tsx — all-required group detail (Terran Border Lockdown pattern)
├── RunPlanner.tsx             — Run Planner view
├── EmbeddedMap.tsx            — small inline hex-map component (placeholder — see gaps)
```

## API gaps (data we need but don't have)

| Field | Used in | Status |
|-------|---------|--------|
| Jump distance per mission | MissionCard reward+jumps, DO THIS NEXT callout | Only available on offers (`distance` field). Missing on active missions. |
| Mission `arc` (story arc name) | Group detail headers, card subtitles | Not in API response. Currently derived from `group_name`. |
| Choice vs all-required classification | GroupCard, detail routing | **Heuristic**: groups with different factions → choice fork. Otherwise → all-required. May misclassify. |
| Sector coordinates for route map | EmbeddedMap, MissionMapModal | EmbeddedMap currently renders empty (no sector coord data passed). `MissionMapModal` has its own map data via `useMapData()`, but route pathfinding needs player→target sector graph data. |
| Objective location coordinates | DO THIS NEXT callout, "on site" vs N jumps | Some objectives have `target_x`/`target_z` but sector IDs for jump calculation need the full sector graph. |

## Heuristics used (may break)

1. **Group kind**: `deriveGroupKind()` checks if missions in a group have different factions → "choice". Same faction → "all". This works for Yaki Investigation (3 factions) vs Terran Border Lockdown (all Terran), but may misclassify edge cases.

2. **Objective active step**: Falls back to latest step number when `is_active` flag is missing. Works for most concurrent-objective missions.

3. **Mission bucket**: Active missions use `is_active` flag. Offers without `is_active` default to "offer" bucket. No explicit "guild" tag — guild missions are offers with `is_repeatable=true`.

## Deferred features

| Feature | Reason |
|---------|--------|
| Add to Run button on cards | Per user direction — work on this later |
| Set as Active action | Not supported by game/API |
| Abandon action | Not supported by game/API |
| Run Planner optimization (reorder by nearest-next) | Requires full sector adjacency graph + pathfinding for all run stops |
| Run Planner pre-seeded with offers | State management pattern ready (`runIds`), just needs UI to add/remove |
| Text search filter | Filter row has placeholder — needs input wiring |
| EmbeddedMap with real sector data | Needs sector coordinate data passed from parent. Currently renders empty "No route data" state |

## Next steps

1. ~~**Wire text search filter**~~ ✅ — done, `searchQuery` state + `nameMatch()` filter
2. ~~**Pass sector data to EmbeddedMap**~~ ✅ — EmbeddedMap now self-loads `useMapData` + `useMapLayout`, shows all sectors + player + target markers
3. ~~**Add to Run**~~ ✅ — ＋/✓ button on MissionCard + OfferCard, wired to `runIds` state
4. **Enhance MissionMapModal** — accept optional route path (`[sectorId1, sectorId2, ...]`) and render nav line between sectors
5. **Add jump-distance API field for missions** — backend needs to compute player→mission_sector distance
6. **Add `arc`/`is_choice` fields to API** — backend needs to classify group types from game data
7. **Run Planner optimization** — reorder stops by nearest-next using sector adjacency graph
