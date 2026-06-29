# Macro Files Normalized Schema

Grouped by `<macro class="...">` (ships, weapons, shields, stations, etc.)

## Class: `accessory`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  identification
    <identification> [@unique]
```

## Class: `adsign`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  effects, explosiondamage, hull, identification, sounds
    <effects>  -->  explosion
      <explosion> [@ref]
    <explosiondamage> [@value]
    <hull> [@max]
    <identification> [@name, @unique]
    <sounds>  -->  ambient
      <ambient> [@ref]
```

## Class: `adsignobject`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  effects, hull, identification
    <effects>  -->  explosion
      <explosion> [@ref]
    <hull> [@integrated, @invulnerable, @max]
    <identification> [@name, @unique]
```

## Class: `anomaly`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  effects, force, hull, identification, longrangescan, transition
    <effects>  -->  longrangescan
      <longrangescan> [@ref]
    <force> [@pow, @range, @strength]
    <hull> [@invulnerable]
    <identification> [@inactivename, @name]
    <longrangescan> [@minlevel]
    <transition> [@destination, @source]
```

## Class: `asteroid`

```xml
<macro> [@class, @name]  -->  component, connections, properties
  <component> [@ref]
  <connections>  -->  connection
    <connection> [@ref]  -->  macro
      <macro> [@connection, @ref]
  <properties>  -->  drop, effects, explosiondamage, glow, hull, identification, navigation
    <drop> [@ref]
    <effects>  -->  explosion, longrangescan
      <explosion> [@ref]
      <longrangescan> [@ref]
    <explosiondamage> [@shield, @value]
    <glow> [@time]
    <hull> [@invulnerable, @max, @min]
    <identification> [@description, @icon, @landmark, @name, @unique]
    <navigation> [@createoctree]
```

## Class: `bomb`

```xml
<macro> [@class, @name]  -->  component, connections, properties
  <component> [@ref]
  <connections>  -->  connection
    <connection> [@ref]  -->  macro
      <macro> [@connection, @ref]
  <properties>  -->  ammunition, detach, effects, explosiondamage, hull, identification, missile, physics, reload, signalleak, weapon
    <ammunition> [@reload, @value]
    <detach> [@macro]
    <effects>  -->  explosion
      <explosion> [@ref]
    <explosiondamage> [@hull, @shield]
    <hull> [@max]
    <identification> [@description, @name]
    <missile> [@icon, @lifetime, @range]
    <physics> [@mass]  -->  drag, inertia
      <drag> [@forward, @horizontal, @pitch, @reverse, @roll, @vertical, @yaw]
      <inertia> [@pitch, @roll, @yaw]
    <signalleak> [@amount, @macro, @radius]
    <weapon> [@system]
```

## Class: `bomblauncher`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  bullet, hull, identification, reload, rotationspeed
    <bullet> [@class]
    <hull> [@integrated]
    <identification> [@description, @name]
    <reload> [@rate]
    <rotationspeed> [@max]
```

## Class: `buildmodule`

```xml
<macro> [@class, @name]  -->  component, connections, properties
  <component> [@ref]
  <connections>  -->  connection
    <connection> [@name, @ref]  -->  macro
      <macro> [@connection, @ref]
  <properties>  -->  build, builder, equip, explosiondamage, hull, identification, ownership, secrecy, sound_occlusion, sounds, storage, supply, workforce
    <build>  -->  sets
      <sets>  -->  set
        <set> [@ref]
    <builder> [@classes, @optimalprocessorunits, @usemasstraffic]
    <equip> [@classes]
    <explosiondamage> [@noshield, @shield, @value]
    <hull> [@integrated, @max]
    <identification> [@description, @makerrace, @name, @shortname]
    <ownership> [@claim]
    <secrecy> [@level]
    <sound_occlusion> [@inside, @outside]
    <sounds>  -->  ambient
      <ambient> [@ref]
    <storage> [@unit]
    <supply> [@classes]
    <workforce> [@max]
```

## Class: `buildprocessor`

```xml
<macro> [@class, @name]  -->  component
  <component> [@ref]
```

## Class: `buildstorage`

```xml
<macro> [@class, @name]  -->  component, connections, properties
  <component> [@ref]
  <connections>  -->  connection
    <connection> [@ref]  -->  macro
      <macro> [@connection, @ref]
  <properties>  -->  effects, hull, identification
    <effects>  -->  explosion
      <explosion> [@ref]
    <hull> [@invulnerable]
    <identification> [@hudicon, @icon, @name]
```

## Class: `bullet`

```xml
<macro> [@alias, @class, @name, @ref]  -->  component, properties
  <component> [@ref]
  <properties>  -->  ammunition, areadamage, bullet, damage, damagecurves, effects, heat, identification, reload, sounds, weapon
    <ammunition> [@reload, @value]
    <areadamage> [@falloff, @lifetime, @range, @shield, @time, @value]
    <bullet> [@amount, @angle, @attach, @barrelamount, @chargetime, @delay, @firewhenfullcharge, @forcecooldownaftershot, @heatwhilecharging, @icon, @influencelist, @lifetime, @mass, @maxhits, @plannedselfdestruct, @range, @requirefullcharge, @restitution, @ricochet, @scale, @selfdestruct, @selfdestructmintime, @selfdestructtimediff, @speed, @sticktime, @timediff, @tug]
    <damage> [@delay, @hull, @max, @min, @noshield, @repair, @shield, @value]  -->  multiplier
      <multiplier> [@mining, @surfaceelement]
    <damagecurves>  -->  distance, time
      <distance>  -->  point
        <point> [@position, @value]
      <time>  -->  point
        <point> [@position, @value]
    <effects>  -->  activation, bigobjectimpact, impact, launch
      <activation> [@ref]
      <bigobjectimpact> [@inside, @ref]
      <impact> [@inside, @ref]
      <launch> [@ref]
    <heat> [@initial, @value]
    <identification> [@name]
    <reload> [@rate, @time]
    <sounds>  -->  ambient, firing
      <ambient> [@ref]
      <firing> [@ref, @repeat]
    <weapon> [@system]
```

## Class: `cargobay`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  cargo, hull, identification
    <cargo> [@max, @tags]
    <hull> [@integrated, @max]
    <identification> [@unique]
```

## Class: `celestialbody`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  ai, identification
    <ai>  -->  type
      <type> [@global, @local]
    <identification> [@unique]
```

## Class: `checkpoint`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  identification
    <identification> [@icon, @name]
```

## Class: `cluster`

```xml
<macro> [@class, @name]  -->  component
  <component> [@ref]
```

## Class: `cockpit`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  identification, room, sound_environment, sound_occlusion, wall
    <identification> [@name, @unique]
    <room> [@walkable]
    <sound_environment> [@ref]
    <sound_occlusion> [@inside]
    <wall> [@opaque]
```

## Class: `collectableammo`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  hull, identification
    <hull> [@max]
    <identification> [@name]
```

## Class: `collectableblueprints`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  drop, effects, hull, identification, map
    <drop> [@ref]
    <effects>  -->  longrangescan
      <longrangescan> [@ref]
    <hull> [@invulnerable, @max]
    <identification> [@name]
    <map> [@visible]
```

## Class: `collectableshieldrestore`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  hull, identification
    <hull> [@max]
    <identification> [@name, @unique]
```

## Class: `collectablewares`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  drop, effects, hull, identification, longrangescan, map, wares
    <drop> [@ref]
    <effects>  -->  explosion, longrangescan
      <explosion> [@ref]
      <longrangescan> [@ref]
    <hull> [@max]
    <identification> [@description, @icon, @name, @unique]
    <longrangescan> [@minlevel]
    <map> [@visible]
    <wares> [@amount, @container, @ware]
```

## Class: `computer`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  identification
    <identification> [@female, @name, @owner, @page, @unique]
```

## Class: `connectionmodule`

```xml
<macro> [@class, @name]  -->  component, connections, properties
  <component> [@ref]
  <connections>  -->  connection
    <connection> [@ref]  -->  macro
      <macro> [@connection, @ref]
  <properties>  -->  build, explosiondamage, hull, identification, secrecy
    <build>  -->  sets
      <sets>  -->  set
        <set> [@ref]
    <explosiondamage> [@shield, @value]
    <hull> [@max]
    <identification> [@description, @hidden, @makerrace, @name, @shortname, @type]
    <secrecy> [@level]
```

## Class: `controlroom`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  room
    <room> [@walkable]
```

## Class: `countermeasure`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  countermeasure, effects, identification
    <countermeasure> [@counter, @interval, @lifetime]
    <effects>  -->  launch
      <launch> [@ref]
    <identification> [@description, @name, @unique]
```

## Class: `crate_m`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  identification
    <identification> [@name]
```

## Class: `crate_s`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  identification
    <identification> [@name]
```

## Class: `crystal`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  drop, effects, hull, identification
    <drop> [@chance, @damage, @ref, @threshold]
    <effects>  -->  explosion, surface
      <explosion> [@ref]
      <surface> [@ref]
    <hull> [@max, @threshold]
    <identification> [@description, @name]
```

## Class: `cutsceneanchor`

```xml
<macro> [@class, @name]  -->  component, connections, properties
  <component> [@ref]
  <connections>  -->  connection
    <connection> [@ref]  -->  macro
      <macro> [@connection, @ref]
  <properties>  -->  identification
    <identification> [@unique]
```

## Class: `datavault`

```xml
<macro> [@alias, @class, @name]  -->  component, connections, properties
  <component> [@ref]
  <connections>  -->  connection
    <connection> [@ref]  -->  macro
      <macro> [@connection, @ref]
  <properties>  -->  effects, hull, identification, longrangescan
    <effects>  -->  longrangescan
      <longrangescan> [@ref]
    <hull> [@max, @min]
    <identification> [@datavault, @icon, @name]
    <longrangescan> [@minlevel]
```

## Class: `defencemodule`

```xml
<macro> [@alias, @class, @name]  -->  component, connections, properties
  <component> [@ref]
  <connections>  -->  connection
    <connection> [@ref]  -->  macro
      <macro> [@connection, @ref]
  <properties>  -->  build, effects, explosiondamage, explosioneffect, hull, identification, loadouts, map, ownership, relation, secrecy, storage
    <build>  -->  sets
      <sets>  -->  set
        <set> [@ref]
    <effects>  -->  explosion
      <explosion> [@ref]
    <explosiondamage> [@shield, @value]
    <explosioneffect> [@strength]
    <hull> [@integrated, @invulnerable, @max]
    <identification> [@description, @hidden, @icon, @makerrace, @name, @shortname]
    <loadouts>  -->  loadout
      <loadout> [@id]  -->  groups
        <groups>  -->  shields, turrets
          <shields> [@exact, @group, @macro, @path]
          <turrets> [@exact, @group, @macro, @optional, @path]
    <map> [@visible]
    <ownership> [@claim]
    <relation>  -->  kill
      <kill>  -->  faction
        <faction> [@change]
    <secrecy> [@level]
    <storage> [@unit]
```

## Class: `defensible`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  identification
    <identification> [@unique]
```

## Class: `destructible`

```xml
<macro> [@alias, @class, @name]  -->  component, connections, properties
  <component> [@ref]
  <connections>  -->  connection
    <connection> [@ref]  -->  macro
      <macro> [@connection, @ref]
  <properties>  -->  autoaim, build, effects, explosiondamage, explosioneffect, glow, hull, identification, map, secrecy, sounds
    <autoaim> [@allow]
    <build>  -->  sets
      <sets>  -->  set
        <set> [@ref]
    <effects>  -->  explosion, longrangescan
      <explosion> [@ref]
      <longrangescan> [@ref]
    <explosiondamage> [@shield, @value]
    <explosioneffect> [@strength]
    <glow> [@dynamic]
    <hull> [@hittable, @initial, @integrated, @invulnerable, @max, @min, @threshold]
    <identification> [@basename, @description, @makerrace, @name, @owner, @prop, @shortname, @surfaceelement, @unique]
    <map> [@visible]
    <secrecy> [@level]
    <sounds>  -->  ambient
      <ambient> [@ref]
```

## Class: `detector`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  hull, identification
    <hull> [@max, @min, @threshold]
    <identification> [@name]
```

## Class: `dismantleprocessor`

```xml
<macro> [@class, @name]  -->  component
  <component> [@ref]
```

## Class: `dockarea`

```xml
<macro> [@class, @name]  -->  component, connections, properties
  <component> [@ref]
  <connections>  -->  connection
    <connection> [@ref]  -->  macro
      <macro> [@connection, @ref]  -->  component
        <component> [@connection, @ref]
  <properties>  -->  build, explosiondamage, hull, identification, secrecy, sound_occlusion, sounds, storage
    <build>  -->  sets
      <sets>  -->  set
        <set> [@ref]
    <explosiondamage> [@shield, @value]
    <hull> [@integrated, @max]
    <identification> [@description, @makerrace, @name, @shortname, @type, @unique]
    <secrecy> [@level]
    <sound_occlusion> [@inside, @outside]
    <sounds>  -->  ambient
      <ambient> [@ref]
    <storage> [@unit]
```

## Class: `dockingbay`

```xml
<macro> [@class, @name, @ref]  -->  component, properties
  <component> [@ref]
  <properties>  -->  dock, docksize, effects, identification, room, translationacceleration, translationspeed, undock
    <dock> [@allow, @allowbuild, @allowtrade, @allowunits, @capacity, @external, @hidden, @playeronly, @priority, @storage, @uselandinggear, @ventureronly]
    <docksize> [@tags]
    <effects>  -->  cargotube, landing
      <cargotube> [@attach, @detach]
      <landing> [@ref]  -->  curve
        <curve>  -->  point
          <point> [@position, @value]
    <identification> [@description, @name, @shortname]
    <room> [@walkable]
    <translationacceleration> [@max]
    <translationspeed> [@max]
    <undock> [@allow, @distance, @rotate, @speed]
```

## Class: `effectobject`

```xml
<macro> [@class, @name]  -->  component, connections, properties
  <component> [@ref]
  <properties>  -->  ai, identification, sounds
    <ai>  -->  type
      <type> [@global, @local]
    <identification> [@unique]
    <sounds>  -->  ambient
      <ambient> [@ref]
```

## Class: `engine`

```xml
<macro> [@alias, @class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  angular, boost, component, decelerationcurve, effects, hull, identification, sounds, strafecurve, thrust, travel
    <angular> [@pitch, @roll]
    <boost> [@acceleration, @attack, @coast, @duration, @recharge, @release, @thrust]
    <component> [@virtual]
    <decelerationcurve>  -->  point
      <point> [@position, @value]
    <effects>  -->  boosting, traveling
      <boosting> [@ref]
      <traveling> [@ref]
    <hull> [@integrated, @max, @threshold]
    <identification> [@basename, @description, @hidden, @makerrace, @mk, @name, @shortname, @type]
    <sounds>  -->  enginedetail
      <enginedetail> [@ref]
    <strafecurve>  -->  point
      <point> [@position, @value]
    <thrust> [@forward, @pitch, @reverse, @roll, @strafe, @yaw]
    <travel> [@attack, @charge, @release, @thrust]
```

## Class: `entity`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  identification
    <identification> [@name, @owner, @page]
```

## Class: `fogvolume`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  identification, volume
    <identification> [@unique]
    <volume> [@gridsize, @scale, @size]
```

## Class: `forceemitter`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  force, hull
    <force> [@range, @strength]
    <hull> [@max, @min, @threshold]
```

## Class: `galaxy`

```xml
<macro> [@class, @name]  -->  component
  <component> [@ref]
```

## Class: `gate`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  gate, glow, hull, identification
    <gate> [@accelerator]
    <glow> [@dynamic]
    <hull> [@invulnerable]
    <identification> [@description, @icon, @inactivename, @name]
```

## Class: `habitation`

```xml
<macro> [@alias, @class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  build, explosiondamage, hull, identification, secrecy, workforce
    <build>  -->  sets
      <sets>  -->  set
        <set> [@ref]
    <explosiondamage> [@shield, @value]
    <hull> [@max]
    <identification> [@description, @makerrace, @name, @shortname, @size]
    <secrecy> [@level]
    <workforce> [@capacity, @race]
```

## Class: `hackerprobe`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  hack, hull, identification
    <hack> [@angle, @duration, @range]
    <hull> [@integrated]
    <identification> [@unique]
```

## Class: `highway`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  boundaries, controls
    <boundaries> [@priority]  -->  boundary
      <boundary> [@class, @parts]  -->  size, splineposition
        <size> [@r]
        <splineposition> [@weight, @x, @y, @z]
    <controls>  -->  angular, linear
      <angular>  -->  roll
        <roll> [@max]
      <linear>  -->  time
        <time> [@max, @min]
```

## Class: `highwayblocker`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  effects, hull, sounds
    <effects>  -->  trigger
      <trigger> [@delay, @ref]
    <hull> [@invulnerable]
    <sounds>  -->  ambient
      <ambient> [@ref]
```

## Class: `highwaybooster`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  effects, hull, identification, sounds
    <effects>  -->  trigger
      <trigger> [@delay, @ref]
    <hull> [@invulnerable]
    <identification> [@unique]
    <sounds>  -->  ambient, boost
      <ambient> [@ref]
      <boost> [@ref]
```

## Class: `highwayentrygate`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  hull, identification, sounds
    <hull> [@invulnerable]
    <identification> [@icon, @name, @unique]
    <sounds>  -->  ambient
      <ambient> [@ref]
```

## Class: `highwayexitgate`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  hull, identification, sounds
    <hull> [@invulnerable]
    <identification> [@icon, @name, @unique]
    <sounds>  -->  ambient
      <ambient> [@ref]
```

## Class: `highwayscene`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  identification, sounds
    <identification> [@unique]
    <sounds>  -->  ambient, highwayedgeambient
      <ambient> [@ref]
      <highwayedgeambient> [@ref]
```

## Class: `influenceobject`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  hull, identification, influencelist
    <hull> [@max, @min, @threshold]
    <identification> [@name]
    <influencelist> [@delay, @id]
```

## Class: `lensflare`

```xml
<macro> [@class, @name]  -->  component
  <component> [@ref]
```

## Class: `lock`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  effects, hull, identification
    <effects>  -->  explosion
      <explosion> [@ref]
    <hull> [@max]
    <identification> [@name, @unique]
```

## Class: `lockbox`

```xml
<macro> [@class, @name]  -->  component, connections, properties
  <component> [@ref]
  <connections>  -->  connection
    <connection> [@ref]  -->  macro
      <macro> [@connection, @ref]
  <properties>  -->  drop, effects, explosiondamage, hull, identification, longrangescan, secrecy
    <drop> [@ref]
    <effects>  -->  explosion, longrangescan
      <explosion> [@ref]
      <longrangescan> [@ref]
    <explosiondamage> [@hull, @shield]
    <hull> [@initial, @max]
    <identification> [@name, @unique]
    <longrangescan> [@minlevel]
    <secrecy> [@level]
```

## Class: `mine`

```xml
<macro> [@alias, @class, @name]  -->  component, connections, properties
  <component> [@ref]
  <connections>  -->  connection
    <connection> [@ref]  -->  macro
      <macro> [@connection, @ref]
  <properties>  -->  effects, explosiondamage, hull, identification, map, mine, physics, range, trigger
    <effects>  -->  explosion
      <explosion> [@ref]
    <explosiondamage> [@hull, @value]
    <hull> [@max]
    <identification> [@deployable, @description, @icon, @inactiveicon, @name]
    <map> [@visible]
    <mine> [@batch, @counter, @interval]
    <physics> [@mass]
    <range> [@abort, @follow, @trigger]
    <trigger> [@friendfoe, @oncollision]
```

## Class: `miningnode`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  drop, hull, identification
    <drop> [@ref]
    <hull> [@max]
    <identification> [@name]
```

## Class: `missile`

```xml
<macro> [@class, @name]  -->  component, connections, properties
  <component> [@ref]
  <connections>  -->  connection
    <connection> [@ref]  -->  macro
      <macro> [@connection, @ref]
  <properties>  -->  ammunition, countermeasure, detach, effects, explosiondamage, hull, identification, lock, longrangescan, missile, physics, reload, weapon
    <ammunition> [@value]
    <countermeasure> [@resilience]
    <detach> [@macro]
    <effects>  -->  explosion, launch
      <explosion> [@ref]
      <launch> [@ref]
    <explosiondamage> [@value]
    <hull> [@max]
    <identification> [@basename, @description, @name]
    <lock> [@angle, @range, @time]
    <longrangescan> [@minlevel]
    <missile> [@amount, @angle, @barrelamount, @delay, @distribute, @guided, @icon, @influencelist, @lifetime, @range, @retarget, @swarm, @tags, @timediff]
    <physics> [@mass]  -->  drag, inertia
      <drag> [@forward, @horizontal, @pitch, @reverse, @roll, @vertical, @yaw]
      <inertia> [@pitch, @roll, @yaw]
    <reload> [@time]
    <weapon> [@system]
```

## Class: `missilelauncher`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  ammunition, bullet, hull, identification, storage
    <ammunition> [@tags]
    <bullet> [@class]
    <hull> [@hittable, @max]
    <identification> [@basename, @description, @makerrace, @mk, @name, @shortname]
    <storage> [@capacity]
```

## Class: `missileturret`

```xml
<macro> [@alias, @class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  ammunition, bullet, effects, hull, identification, reload, rotationacceleration, rotationspeed, storage
    <ammunition> [@tags]
    <bullet> [@class]
    <effects>  -->  sefx_damage_high, sefx_damage_low, sefx_damage_medium
      <sefx_damage_high> [@ref]
      <sefx_damage_low> [@ref]
      <sefx_damage_medium> [@ref]
    <hull> [@integrated, @max, @threshold]
    <identification> [@basename, @description, @makerrace, @mk, @name, @shortname]
    <rotationacceleration> [@max]
    <rotationspeed> [@max]
    <storage> [@capacity]
```

## Class: `navbeacon`

```xml
<macro> [@alias, @class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  effects, explosiondamage, explosioneffect, hull, identification
    <effects>  -->  explosion, longrangescan
      <explosion> [@ref]
      <longrangescan> [@ref]
    <explosiondamage> [@max]
    <explosioneffect> [@strength]
    <hull> [@max]
    <identification> [@deployable, @description, @icon, @inactiveicon, @name]
```

## Class: `navcontext`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  sound_occlusion
    <sound_occlusion> [@inside, @outside]
```

## Class: `npc`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  bonemods, facemods, identification, models
    <bonemods>  -->  bonemod
      <bonemod> [@exact, @type]  -->  bones
        <bones>  -->  bone
          <bone> [@name]
    <facemods>  -->  facemod
      <facemod> [@exact, @name, @type]
    <identification> [@female, @name, @race]
    <models>  -->  model
      <model> [@ref, @selection, @type]  -->  select
        <select> [@index, @ref]
```

## Class: `object`

```xml
<macro> [@alias, @class, @name]  -->  component, connections, properties
  <component> [@ref]
  <connections>  -->  connection
    <connection> [@ref]  -->  macro
      <macro> [@connection, @ref]  -->  component
        <component> [@connection, @ref]
  <properties>  -->  drop, effects, explosioneffect, glow, hull, identification, longrangescan, map, purpose
    <drop> [@ref]
    <effects>  -->  explosion, longrangescan
      <explosion> [@ref]
      <longrangescan> [@ref]
    <explosioneffect> [@strength]
    <glow> [@default]
    <hull> [@invulnerable, @max, @min]
    <identification> [@datavault, @description, @icon, @landmark, @name, @unique]
    <longrangescan> [@minlevel]
    <map> [@visible]
    <purpose> [@wrapper]
```

## Class: `pier`

```xml
<macro> [@alias, @class, @name]  -->  component, connections, properties
  <component> [@ref]
  <connections>  -->  connection
    <connection> [@ref]  -->  macro
      <macro> [@connection, @ref]
  <properties>  -->  build, explosiondamage, hull, identification, storage
    <build>  -->  sets
      <sets>  -->  set
        <set> [@ref]
    <explosiondamage> [@shield, @value]
    <hull> [@max]
    <identification> [@description, @makerrace, @name, @shortname]
    <storage> [@unit]
```

## Class: `player`

```xml
<macro> [@class, @name]  -->  component, connections, properties
  <component> [@ref]
  <connections>  -->  connection
    <connection> [@ref]  -->  macro
      <macro> [@connection, @ref]
  <properties>  -->  identification, spacesuit
    <identification> [@commable, @name, @owner, @page, @race, @unique]
    <spacesuit> [@macro]
```

## Class: `positional`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  ai, identification
    <ai>  -->  type
      <type> [@global, @local]
    <identification> [@name, @unique]
```

## Class: `processingmodule`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  build, explosiondamage, hull, identification, secrecy
    <build>  -->  sets
      <sets>  -->  set
        <set> [@ref]
    <explosiondamage> [@shield, @value]
    <hull> [@max]
    <identification> [@description, @name, @type]
    <secrecy> [@level]
```

## Class: `production`

```xml
<macro> [@class, @name]  -->  component, connections, properties
  <component> [@ref]
  <connections>  -->  connection
    <connection> [@ref]  -->  macro
      <macro> [@connection, @ref]
  <properties>  -->  build, explosiondamage, hull, identification, production, secrecy, workforce
    <build>  -->  sets
      <sets>  -->  set
        <set> [@ref]
    <explosiondamage> [@shield, @value]
    <hull> [@invulnerable, @max]
    <identification> [@description, @makerrace, @name, @shortname, @type]
    <production> [@production, @research, @showactivestate, @wares]  -->  queue
      <queue> [@method, @ware]  -->  item
        <item> [@method, @ware]
    <secrecy> [@level]
    <workforce> [@max]
```

## Class: `radar`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  build, explosiondamage, hull, identification, radar, secrecy
    <build>  -->  sets
      <sets>  -->  set
        <set> [@ref]
    <explosiondamage> [@shield, @value]
    <hull> [@max]
    <identification> [@description, @name, @shortname]
    <radar> [@range]
    <secrecy> [@level]
```

## Class: `recyclable`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  cargo, effects, explosiondamage, hull, identification, physics
    <cargo> [@max]
    <effects>  -->  explosion
      <explosion> [@ref]
    <explosiondamage> [@shield, @value]
    <hull> [@max]
    <identification> [@icon, @name]
    <physics>  -->  drag
      <drag> [@forward, @horizontal, @reverse, @vertical]
```

## Class: `resourceprobe`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  hull, identification
    <hull> [@max]
    <identification> [@deployable, @description, @icon, @inactiveicon, @name]
```

## Class: `room`

```xml
<macro> [@class, @name]  -->  component, connections, properties
  <component> [@ref]
  <connections>  -->  connection
    <connection> [@ref]  -->  macro
      <macro> [@connection, @ref]
  <properties>  -->  identification, room, sound_environment, sound_occlusion
    <identification> [@name, @prop, @unique]
    <room> [@enterable, @type]
    <sound_environment> [@ref]
    <sound_occlusion> [@inside, @outside]
```

## Class: `satellite`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  explosioneffect, hull, identification, radar
    <explosioneffect> [@strength]
    <hull> [@max]
    <identification> [@deployable, @description, @icon, @inactiveicon, @name]
    <radar> [@range]
```

## Class: `scanner`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  identification, scan, sounds
    <identification> [@description, @name, @unique]
    <scan> [@angle, @longrange, @maxlevel, @range]
    <sounds>  -->  ambient
      <ambient> [@ref]
```

## Class: `scene`

```xml
<macro> [@class, @name]  -->  component
  <component> [@ref]
```

## Class: `sector`

```xml
<macro> [@class, @name]  -->  component, connections
  <component> [@ref]
  <connections>  -->  connection
    <connection> [@name, @ref]  -->  macro
      <macro> [@connection, @ref]
```

## Class: `shieldgenerator`

```xml
<macro> [@alias, @class, @name, @ref]  -->  component, properties
  <component> [@ref]
  <properties>  -->  effects, hull, identification, recharge
    <effects>  -->  sefx_damage_high, sefx_damage_low, sefx_damage_medium
      <sefx_damage_high> [@ref]
      <sefx_damage_low> [@ref]
      <sefx_damage_medium> [@ref]
    <hull> [@integrated, @max, @threshold]
    <identification> [@basename, @description, @makerrace, @mk, @name, @shortname]
    <recharge> [@delay, @max, @rate]
```

## Class: `ship_l`

```xml
<macro> [@alias, @class, @name]  -->  component, connections, properties
  <component> [@ref]
  <connections>  -->  connection
    <connection> [@ref]  -->  macro
      <macro> [@connection, @ref]
  <properties>  -->  boarding, capture, effects, explosiondamage, hull, identification, jerk, loadouts, people, physics, purpose, secrecy, ship, software, sounds, steeringcurve, storage, thruster
    <boarding> [@resistance]
    <capture> [@allow]
    <effects>  -->  longrangescan
      <longrangescan> [@ref]
    <explosiondamage> [@shield, @value]
    <hull> [@max]
    <identification> [@basename, @description, @icon, @makerrace, @name, @shortvariation, @variation]
    <jerk>  -->  angular, forward, forward_boost, forward_travel, strafe
      <angular> [@value]
      <forward> [@accel, @decel, @ratio]
      <forward_boost> [@accel, @ratio]
      <forward_travel> [@accel, @decel, @ratio]
      <strafe> [@value]
    <loadouts>  -->  loadout
      <loadout> [@id]  -->  groups, macros, virtualmacros
        <groups>  -->  turrets
          <turrets> [@exact, @group, @macro, @path]
        <macros>  -->  engine, shield, weapon
          <engine> [@macro, @path]
          <shield> [@macro, @optional, @path]
          <weapon> [@macro, @optional, @path]
        <virtualmacros>  -->  thruster
          <thruster> [@macro]
    <people> [@capacity]
    <physics> [@mass]  -->  accfactors, drag, inertia
      <accfactors> [@forward, @horizontal, @reverse, @vertical]
      <drag> [@forward, @horizontal, @pitch, @reverse, @roll, @vertical, @yaw]
      <inertia> [@pitch, @roll, @yaw]
    <purpose> [@primary]
    <secrecy> [@level]
    <ship> [@type]
    <software>  -->  software
      <software> [@compatible, @default, @ware]
    <sounds>  -->  shipdetail
      <shipdetail> [@ref]
    <steeringcurve>  -->  point
      <point> [@position, @value]
    <storage> [@countermeasure, @deployable, @missile, @unit]
    <thruster> [@tags]
```

## Class: `ship_m`

```xml
<macro> [@class, @name]  -->  component, connections, properties
  <component> [@ref]
  <connections>  -->  connection
    <connection> [@ref]  -->  macro
      <macro> [@connection, @ref]
  <properties>  -->  capture, explosiondamage, gatherrate, glow, hull, identification, jerk, loadouts, people, physics, purpose, secrecy, ship, software, sound_occlusion, sounds, steeringcurve, storage, thruster
    <capture> [@allow]
    <explosiondamage> [@shield, @value]
    <gatherrate> [@gas]
    <glow> [@engine]
    <hull> [@max]
    <identification> [@basename, @description, @icon, @makerrace, @name, @shortvariation, @unit, @variation]
    <jerk>  -->  angular, forward, forward_boost, forward_travel, strafe
      <angular> [@value]
      <forward> [@accel, @decel, @ratio]
      <forward_boost> [@accel, @ratio]
      <forward_travel> [@accel, @decel, @ratio]
      <strafe> [@value]
    <loadouts>  -->  loadout
      <loadout> [@id]  -->  ammunition, macros, virtualmacros
        <ammunition>  -->  ammunition
          <ammunition> [@macro, @max, @min, @optional]
        <macros>  -->  engine, shield, turret, weapon
          <engine> [@macro, @path]
          <shield> [@macro, @optional, @path]
          <turret> [@macro, @optional, @path]
          <weapon> [@macro, @optional, @path]
        <virtualmacros>  -->  thruster
          <thruster> [@macro]
    <people> [@capacity]
    <physics> [@mass]  -->  accfactors, drag, inertia
      <accfactors> [@forward, @horizontal, @reverse, @vertical]
      <drag> [@forward, @horizontal, @pitch, @reverse, @roll, @vertical, @yaw]
      <inertia> [@pitch, @roll, @yaw]
    <purpose> [@primary]
    <secrecy> [@level]
    <ship> [@prestige, @type]
    <software>  -->  software
      <software> [@compatible, @default, @ware]
    <sound_occlusion> [@inside]
    <sounds>  -->  shipdetail
      <shipdetail> [@ref]
    <steeringcurve>  -->  point
      <point> [@position, @value]
    <storage> [@countermeasure, @deployable, @missile, @unit]
    <thruster> [@tags]
```

## Class: `ship_s`

```xml
<macro> [@alias, @class, @name, @ref]  -->  component, connections, properties
  <component> [@ref]
  <connections>  -->  connection
    <connection> [@ref]  -->  macro
      <macro> [@connection, @ref]
  <properties>  -->  capture, effects, enginearticulation, explosiondamage, explosioneffect, gatherrate, glow, hull, identification, jerk, jpm, loadouts, people, physics, purpose, radar, relation, rotationacceleration, rotationspeed, secrecy, ship, software, sound_occlusion, sounds, steeringcurve, storage, thruster
    <capture> [@allow]
    <effects>  -->  explosion, longrangescan
      <explosion> [@ref]
      <longrangescan> [@ref]
    <enginearticulation> [@y, @z]
    <explosiondamage> [@shield, @time, @value]
    <explosioneffect> [@strength]
    <gatherrate> [@gas]
    <glow> [@engine]
    <hull> [@max]
    <identification> [@basename, @deployable, @description, @icon, @inactiveicon, @makerrace, @name, @shortvariation, @type, @unit, @variation]
    <jerk>  -->  angular, forward, forward_boost, forward_travel, strafe
      <angular> [@value]
      <forward> [@accel, @decel, @ratio]
      <forward_boost> [@accel, @ratio]
      <forward_travel> [@accel, @decel, @ratio]
      <strafe> [@value]
    <jpm> [@allow]
    <loadouts> [@mobile]  -->  loadout
      <loadout> [@id]  -->  ammunition, macros, virtualmacros
        <ammunition>  -->  ammunition
          <ammunition> [@macro, @max, @min, @optional]
        <macros>  -->  engine, shield, weapon
          <engine> [@macro, @path]
          <shield> [@macro, @optional, @path]
          <weapon> [@macro, @optional, @path]
        <virtualmacros>  -->  thruster
          <thruster> [@macro]
    <people> [@capacity]
    <physics> [@mass]  -->  accfactors, drag, inertia
      <accfactors> [@forward, @horizontal, @reverse, @vertical]
      <drag> [@forward, @horizontal, @pitch, @reverse, @roll, @vertical, @yaw]
      <inertia> [@pitch, @roll, @yaw]
    <purpose> [@primary]
    <radar> [@range]
    <relation>  -->  attack, kill
      <attack>  -->  multiplier
        <multiplier> [@value]
      <kill>  -->  multiplier
        <multiplier> [@value]
    <rotationacceleration> [@max]
    <rotationspeed> [@max]
    <secrecy> [@level]
    <ship> [@prestige, @type]
    <software>  -->  software
      <software> [@compatible, @default, @ware]
    <sound_occlusion> [@inside]
    <sounds>  -->  shipdetail
      <shipdetail> [@ref]
    <steeringcurve>  -->  point
      <point> [@position, @value]
    <storage> [@countermeasure, @deployable, @missile, @unit]
    <thruster> [@tags]
```

## Class: `ship_xl`

```xml
<macro> [@class, @name]  -->  component, connections, properties
  <component> [@ref]
  <connections>  -->  connection
    <connection> [@ref]  -->  macro
      <macro> [@connection, @ref]
  <properties>  -->  capture, docksize, effects, explosiondamage, hull, identification, jerk, loadouts, people, physics, purpose, regiondamage, secrecy, ship, software, sounds, steeringcurve, storage, threatscore, thruster
    <capture> [@allow]
    <docksize> [@tag]
    <effects>  -->  longrangescan
      <longrangescan> [@ref]
    <explosiondamage> [@shield, @value]
    <hull> [@max]
    <identification> [@basename, @description, @icon, @makerrace, @name, @shortvariation, @variation]
    <jerk>  -->  angular, forward, forward_boost, forward_travel, strafe
      <angular> [@value]
      <forward> [@accel, @decel, @ratio]
      <forward_boost> [@accel, @ratio]
      <forward_travel> [@accel, @decel, @ratio]
      <strafe> [@value]
    <loadouts>  -->  loadout
      <loadout> [@id]  -->  ammunition, groups, macros, virtualmacros
        <ammunition>  -->  ammunition
          <ammunition> [@macro, @max, @min, @optional]
        <groups>  -->  shields, turrets
          <shields> [@exact, @group, @macro, @max, @min, @optional, @path]
          <turrets> [@exact, @group, @macro, @max, @min, @optional, @path]
        <macros>  -->  engine, shield, weapon
          <engine> [@macro, @path]
          <shield> [@macro, @optional, @path]
          <weapon> [@macro, @optional, @path]
        <virtualmacros>  -->  thruster
          <thruster> [@macro]
    <people> [@capacity]
    <physics> [@mass]  -->  accfactors, drag, inertia
      <accfactors> [@forward, @horizontal, @reverse, @vertical]
      <drag> [@forward, @horizontal, @pitch, @reverse, @roll, @vertical, @yaw]
      <inertia> [@pitch, @roll, @yaw]
    <purpose> [@primary]
    <regiondamage> [@immune]
    <secrecy> [@level]
    <ship> [@type]
    <software>  -->  software
      <software> [@compatible, @default, @ware]
    <sounds>  -->  shipdetail
      <shipdetail> [@ref]
    <steeringcurve>  -->  point
      <point> [@position, @value]
    <storage> [@countermeasure, @deployable, @missile, @unit]
    <threatscore> [@value]
    <thruster> [@tags]
```

## Class: `ship_xs`

```xml
<macro> [@alias, @class, @name]  -->  component, connections, properties
  <component> [@ref]
  <connections>  -->  connection
    <connection> [@ref]  -->  macro
      <macro> [@connection, @ref]
  <properties>  -->  effects, explosioneffect, hull, identification, jpm, loadouts, people, physics, purpose, radar, relation, secrecy, ship, software, storage, thruster
    <effects>  -->  explosion
      <explosion> [@ref]
    <explosioneffect> [@strength]
    <hull> [@max]
    <identification> [@deployable, @description, @icon, @inactiveicon, @makerrace, @name, @type, @unit]
    <jpm> [@allow]
    <loadouts> [@mobile]  -->  loadout
      <loadout> [@id]  -->  macros
        <macros>  -->  engine, weapon
          <engine> [@macro, @path]
          <weapon> [@macro, @optional, @path]
    <people> [@capacity]
    <physics> [@mass]  -->  drag, inertia
      <drag> [@forward, @horizontal, @pitch, @reverse, @roll, @vertical, @yaw]
      <inertia> [@pitch, @roll, @yaw]
    <purpose> [@primary]
    <radar> [@range]
    <relation>  -->  attack, kill
      <attack>  -->  multiplier
        <multiplier> [@value]
      <kill>  -->  multiplier
        <multiplier> [@value]
    <secrecy> [@level]
    <ship> [@type]
    <software>  -->  software
      <software> [@default, @ware]
    <storage> [@missile, @unit]
    <thruster> [@tags]
```

## Class: `signalleak`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  hull, identification, indicator, scan
    <hull> [@initial, @max, @min]
    <identification> [@name]
    <indicator> [@range]
    <scan> [@minlevel, @range]
```

## Class: `spacesuit`

```xml
<macro> [@alias, @class, @name]  -->  component, connections, properties
  <component> [@ref]
  <connections>  -->  connection
    <connection> [@ref]  -->  macro
      <macro> [@connection, @ref]
  <properties>  -->  capture, effects, hull, identification, jerk, loadouts, oxygen, physics, software, sound_occlusion, sounds, steeringcurve, thruster
    <capture> [@allow]
    <effects>  -->  suffocating
      <suffocating> [@ref]
    <hull> [@max]
    <identification> [@description, @icon, @makerrace, @name]
    <jerk>  -->  angular, forward, forward_boost, forward_travel, strafe
      <angular> [@value]
      <forward> [@accel, @decel, @ratio]
      <forward_boost> [@accel, @decel, @ratio]
      <forward_travel> [@accel, @decel, @ratio]
      <strafe> [@value]
    <loadouts>  -->  loadout
      <loadout> [@id]  -->  macros
        <macros>  -->  engine
          <engine> [@macro, @path]
    <oxygen> [@maxtime, @warningtime]
    <physics> [@mass]  -->  drag, inertia
      <drag> [@forward, @horizontal, @pitch, @reverse, @roll, @vertical, @yaw]
      <inertia> [@pitch, @roll, @yaw]
    <software>  -->  software
      <software> [@compatible, @ware]
    <sound_occlusion> [@inside]
    <sounds>  -->  breathing, heavybreathing, shipdetail
      <breathing> [@ref]
      <heavybreathing> [@ref]
      <shipdetail> [@ref]
    <steeringcurve>  -->  point
      <point> [@position, @value]
    <thruster> [@tags]
```

## Class: `stardust`

```xml
<macro> [@class, @name]  -->  component
  <component> [@ref]
```

## Class: `station`

```xml
<macro> [@class, @name]  -->  component, connections, properties
  <component> [@ref]
  <connections>  -->  connection
    <connection> [@ref]  -->  macro
      <macro> [@connection, @ref]  -->  component
        <component> [@connection, @ref]
  <properties>  -->  build, effects, hull, identification, map, ownership, purpose, workforce
    <build> [@buildstorage, @plotsize]  -->  sets
      <sets>  -->  set
        <set> [@ref]
    <effects>  -->  explosion
      <explosion> [@ref]
    <hull> [@invulnerable, @max, @min]
    <identification> [@description, @factionhqicon, @hudicon, @icon, @name, @unique]
    <map> [@visible]
    <ownership> [@claim]
    <purpose> [@primary]
    <workforce> [@max]
```

## Class: `storage`

```xml
<macro> [@alias, @class, @name]  -->  component, connections, properties
  <component> [@ref]
  <connections>  -->  connection
    <connection> [@ref]  -->  macro
      <macro> [@connection, @ref]
  <properties>  -->  build, cargo, explosiondamage, hull, identification, secrecy, shield
    <build>  -->  sets
      <sets>  -->  set
        <set> [@ref]
    <cargo> [@max, @tags]
    <explosiondamage> [@shield, @value]
    <hull> [@hittable, @integrated, @max]
    <identification> [@description, @makerrace, @name, @shortname, @size, @unique]
    <secrecy> [@level]
    <shield> [@haswaveprotection]
```

## Class: `targetpoint`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  identification
    <identification> [@name]
```

## Class: `textdisplay`

```xml
<macro> [@class, @name]  -->  component
  <component> [@ref]
```

## Class: `turret`

```xml
<macro> [@alias, @class, @name, @ref]  -->  component, properties
  <component> [@ref]
  <properties>  -->  bullet, effects, hull, identification, reload, rotationacceleration, rotationspeed, sounds, weapon
    <bullet> [@class]
    <effects>  -->  firing, sefx_damage_high, sefx_damage_low, sefx_damage_medium
      <firing> [@start, @stop]
      <sefx_damage_high> [@ref]
      <sefx_damage_low> [@ref]
      <sefx_damage_medium> [@ref]
    <hull> [@integrated, @max, @threshold]
    <identification> [@basename, @description, @makerrace, @mk, @name, @shortname]
    <reload> [@rate, @time]
    <rotationacceleration> [@max]
    <rotationspeed> [@max]
    <sounds>  -->  firing
      <firing> [@ref]
    <weapon> [@angle]
```

## Class: `uielement`

```xml
<macro> [@class, @name]  -->  component
  <component> [@ref]
```

## Class: `unknown`

```xml
<macro> [@connection, @name, @path, @ref]  -->  component, connections, properties
  <component> [@connection, @ref]
  <connections>  -->  connection
    <connection> [@name, @path, @ref]  -->  macro, offset
      <macro> [@connection, @path, @ref]  -->  component, connections, properties
        <component> [@connection, @ref]
        <connections>  -->  connection
          <connection> [@ref]  -->  macro
            <macro> [@connection, @path]
        <properties>  -->  identification
          <identification> [@description, @owner]
      <offset>  -->  position, rotation
        <position> [@x, @y, @z]
        <rotation> [@pitch, @yaw]
  <properties>  -->  boundaries, controls, identification, plan, region
    <boundaries>  -->  boundary
      <boundary> [@class]  -->  size, splineposition
        <size> [@r]
        <splineposition> [@inlength, @outlength, @tx, @tz, @weight, @x, @y, @z]
    <controls>  -->  linear
      <linear>  -->  time
        <time> [@max, @min]
    <identification> [@description, @name, @nameoverride, @owner]
    <plan> [@ref]
    <region> [@ref]
```

## Class: `ventureplatform`

```xml
<macro> [@class, @name]  -->  component, connections, properties
  <component> [@ref]
  <connections>  -->  connection
    <connection> [@ref]  -->  macro
      <macro> [@connection, @ref]
  <properties>  -->  build, explosiondamage, hull, identification
    <build>  -->  sets
      <sets>  -->  set
        <set> [@ref]
    <explosiondamage> [@shield, @value]
    <hull> [@max]
    <identification> [@description, @name]
```

## Class: `weapon`

```xml
<macro> [@alias, @class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  bullet, effects, heat, hull, identification, reload, rotationacceleration, rotationspeed, sounds, weapon, zoom
    <bullet> [@class]
    <effects>  -->  firing
      <firing> [@start, @stop]
    <heat> [@cooldelay, @coolrate, @overheat, @reenable]
    <hull> [@hittable, @integrated, @max, @threshold]
    <identification> [@basename, @description, @makerrace, @mk, @name, @shortname]
    <reload> [@rate, @time]
    <rotationacceleration> [@max]
    <rotationspeed> [@max]
    <sounds>  -->  firing
      <firing> [@ref]
    <weapon> [@angle, @shotangle]
    <zoom> [@delay, @factor, @time]
```

## Class: `welfaremodule`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  build, explosiondamage, hull, identification, workforce
    <build>  -->  sets
      <sets>  -->  set
        <set> [@ref]
    <explosiondamage> [@shield, @value]
    <hull> [@max]
    <identification> [@description, @name, @shortname]
    <workforce> [@growthrate]
```

## Class: `zone`

```xml
<macro> [@class, @name]  -->  component, properties
  <component> [@ref]
  <properties>  -->  boundaries, identification
    <boundaries> [@priority]  -->  boundary
      <boundary> [@class, @parts]  -->  position, rotation, size, splineposition
        <position> [@x, @y, @z]
        <rotation> [@pitch, @roll, @yaw]
        <size> [@linear, @r, @x, @y, @z]
        <splineposition> [@x, @y, @z]
    <identification> [@name]
```
