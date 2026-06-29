# Wares XML Normalized Schema

This document shows all possible XML paths, tags, and attributes found in `wares.xml`, broken down by their `group`.

## Group: `None`
```xml
<ware> [@description, @factoryname, @group, @id, @name, @tags, @transport, @volume]  -->  component, container, icon, owner, price, production, restriction, software, sources, use
  <component> [@ref]
  <container> [@ref]
  <icon> [@active, @video]
  <owner> [@faction]
  <price> [@average, @max, @min]
  <production> [@amount, @dismantlefactor, @method, @name, @tags, @time]  -->  effects, primary
    <effects>  -->  effect
      <effect> [@product, @type]
    <primary>  -->  ware
      <ware> [@amount, @ware]
  <restriction> [@licence]
  <software> [@predecessor]
  <sources>  -->  source
    <source> [@type]
  <use> [@factions, @threshold]
```

## Group: `agricultural`
```xml
<ware> [@description, @factoryname, @group, @id, @licence, @name, @tags, @transport, @volume]  -->  container, icon, illegal, price, production
  <container> [@ref]
  <icon> [@active, @video]
  <illegal> [@factions]
  <price> [@average, @max, @min]
  <production> [@amount, @method, @name, @time]  -->  effects, primary
    <effects>  -->  effect
      <effect> [@product, @type]
    <primary>  -->  ware
      <ware> [@amount, @ware]
```

## Group: `contraband`
```xml
<ware> [@description, @group, @id, @illegal, @name, @tags, @transport, @volume]  -->  container, icon, illegal, price, production, sources
  <container> [@ref]
  <icon> [@video]
  <illegal> [@factions]
  <price> [@average, @max, @min]
  <production> [@amount, @method, @name, @time]  -->  primary
    <primary>  -->  ware
      <ware> [@amount, @ware]
  <sources>  -->  source
    <source> [@type]
```

## Group: `countermeasures`
```xml
<ware> [@description, @group, @id, @name, @tags, @transport, @volume]  -->  component, container, price, production
  <component> [@ref]
  <container> [@ref]
  <price> [@average, @max, @min]
  <production> [@amount, @method, @name, @time]  -->  primary
    <primary>  -->  ware
      <ware> [@amount, @ware]
```

## Group: `curiosity`
```xml
<ware> [@description, @group, @id, @illegal, @name, @tags, @transport, @volume]  -->  container, icon, illegal, price, production, sources
  <container> [@ref]
  <icon> [@video]
  <illegal> [@factions]
  <price> [@average, @max, @min]
  <production> [@amount, @method, @name, @time]  -->  primary
    <primary>  -->  ware
      <ware> [@amount, @ware]
  <sources>  -->  source
    <source> [@type]
```

## Group: `drones`
```xml
<ware> [@description, @group, @id, @name, @tags, @transport, @volume]  -->  component, container, icon, price, production, restriction, use
  <component> [@ref]
  <container> [@ref]
  <icon> [@video]
  <price> [@average, @max, @min]
  <production> [@amount, @method, @name, @time]  -->  primary
    <primary>  -->  ware
      <ware> [@amount, @ware]
  <restriction> [@licence]
  <use> [@purposes, @threshold]
```

## Group: `energy`
```xml
<ware> [@description, @factoryname, @group, @id, @name, @tags, @transport, @volume]  -->  icon, price, production
  <icon> [@active, @video]
  <price> [@average, @max, @min]
  <production> [@amount, @method, @name, @time]  -->  effects
    <effects>  -->  effect
      <effect> [@product, @type]
```

## Group: `engines`
```xml
<ware> [@description, @group, @id, @name, @tags, @transport, @volume]  -->  component, icon, owner, price, production, restriction, use
  <component> [@ref]
  <icon> [@video]
  <owner> [@faction]
  <price> [@average, @max, @min]
  <production> [@amount, @dismantlefactor, @method, @name, @tags, @time]  -->  primary
    <primary>  -->  ware
      <ware> [@amount, @ware]
  <restriction> [@licence]
  <use> [@factions, @threshold]
```

## Group: `food`
```xml
<ware> [@description, @factoryname, @group, @id, @licence, @name, @tags, @transport, @volume]  -->  container, icon, illegal, price, production
  <container> [@ref]
  <icon> [@active, @video]
  <illegal> [@factions]
  <price> [@average, @max, @min]
  <production> [@amount, @method, @name, @time]  -->  effects, primary
    <effects>  -->  effect
      <effect> [@product, @type]
    <primary>  -->  ware
      <ware> [@amount, @ware]
```

## Group: `gases`
```xml
<ware> [@description, @factoryname, @group, @id, @name, @tags, @transport, @volume]  -->  container, icon, price
  <container> [@ref]
  <icon> [@active, @video]
  <price> [@average, @max, @min]
```

## Group: `generalitem`
```xml
<ware> [@description, @group, @id, @name, @tags, @transport, @volume]  -->  container, icon, price, production, sources
  <container> [@ref]
  <icon> [@video]
  <price> [@average, @max, @min]
  <production> [@amount, @method, @name, @time]  -->  primary
    <primary>  -->  ware
      <ware> [@amount, @ware]
  <sources>  -->  source
    <source> [@type]
```

## Group: `hardware`
```xml
<ware> [@description, @group, @id, @name, @tags, @transport, @volume]  -->  component, container, icon, price, production, sources
  <component> [@ref]
  <container> [@ref]
  <icon> [@video]
  <price> [@average, @max, @min]
  <production> [@amount, @method, @name, @time]  -->  primary
    <primary>  -->  ware
      <ware> [@amount, @ware]
  <sources>  -->  source
    <source> [@type]
```

## Group: `hightech`
```xml
<ware> [@description, @factoryname, @group, @id, @name, @tags, @transport, @volume]  -->  icon, price, production
  <icon> [@active, @video]
  <price> [@average, @max, @min]
  <production> [@amount, @method, @name, @tags, @time]  -->  effects, primary
    <effects>  -->  effect
      <effect> [@product, @type]
    <primary>  -->  ware
      <ware> [@amount, @ware]
```

## Group: `ice`
```xml
<ware> [@description, @factoryname, @group, @id, @licence, @name, @tags, @transport, @volume]  -->  container, icon, illegal, price
  <container> [@ref]
  <icon> [@active, @video]
  <illegal> [@factions]
  <price> [@average, @max, @min]
```

## Group: `luxuryitem`
```xml
<ware> [@description, @group, @id, @illegal, @name, @tags, @transport, @volume]  -->  container, icon, illegal, price, production, sources
  <container> [@ref]
  <icon> [@video]
  <illegal> [@factions]
  <price> [@average, @max, @min]
  <production> [@amount, @method, @name, @time]  -->  primary
    <primary>  -->  ware
      <ware> [@amount, @ware]
  <sources>  -->  source
    <source> [@type]
```

## Group: `minerals`
```xml
<ware> [@description, @factoryname, @group, @id, @name, @tags, @transport, @volume]  -->  container, icon, price
  <container> [@ref]
  <icon> [@active, @video]
  <price> [@average, @max, @min]
```

## Group: `missiles`
```xml
<ware> [@description, @group, @id, @name, @tags, @transport, @volume]  -->  component, container, owner, price, production, restriction, use
  <component> [@ref]
  <container> [@ref]
  <owner> [@faction]
  <price> [@average, @max, @min]
  <production> [@amount, @method, @name, @tags, @time]  -->  primary
    <primary>  -->  ware
      <ware> [@amount, @ware]
  <restriction> [@licence]
  <use> [@threshold]
```

## Group: `pharmaceutical`
```xml
<ware> [@description, @factoryname, @group, @id, @illegal, @name, @tags, @transport, @volume]  -->  container, icon, illegal, price, production
  <container> [@ref]
  <icon> [@active, @video]
  <illegal> [@factions]
  <price> [@average, @max, @min]
  <production> [@amount, @method, @name, @time]  -->  effects, primary
    <effects>  -->  effect
      <effect> [@product, @type]
    <primary>  -->  ware
      <ware> [@amount, @ware]
```

## Group: `refined`
```xml
<ware> [@description, @factoryname, @group, @id, @name, @tags, @transport, @volume]  -->  icon, price, production
  <icon> [@active, @video]
  <price> [@average, @max, @min]
  <production> [@amount, @method, @name, @tags, @time]  -->  effects, primary
    <effects>  -->  effect
      <effect> [@product, @type]
    <primary>  -->  ware
      <ware> [@amount, @ware]
```

## Group: `shields`
```xml
<ware> [@description, @group, @id, @name, @tags, @transport, @volume]  -->  component, icon, owner, price, production, restriction, use
  <component> [@ref]
  <icon> [@video]
  <owner> [@faction]
  <price> [@average, @max, @min]
  <production> [@amount, @dismantlefactor, @method, @name, @tags, @time]  -->  primary
    <primary>  -->  ware
      <ware> [@amount, @ware]
  <restriction> [@licence]
  <use> [@factions, @threshold]
```

## Group: `shiptech`
```xml
<ware> [@description, @factoryname, @group, @id, @name, @tags, @transport, @volume]  -->  icon, price, production
  <icon> [@active, @video]
  <price> [@average, @max, @min]
  <production> [@amount, @method, @name, @tags, @time]  -->  effects, primary
    <effects>  -->  effect
      <effect> [@product, @type]
    <primary>  -->  ware
      <ware> [@amount, @ware]
```

## Group: `software`
```xml
<ware> [@description, @factoryname, @group, @id, @name, @tags, @transport, @volume]  -->  component, icon, price, production, software, use
  <component> [@ref]
  <icon> [@video]
  <price> [@average, @max, @min]
  <production> [@amount, @method, @name, @time]
  <software> [@predecessor]
  <use> [@threshold]
```

## Group: `thrusters`
```xml
<ware> [@description, @group, @id, @name, @tags, @transport, @volume]  -->  component, price, production, use
  <component> [@ref]
  <price> [@average, @max, @min]
  <production> [@amount, @method, @name, @tags, @time]  -->  primary
    <primary>  -->  ware
      <ware> [@amount, @ware]
  <use> [@threshold]
```

## Group: `turrets`
```xml
<ware> [@description, @group, @id, @name, @tags, @transport, @volume]  -->  component, owner, price, production, restriction, use
  <component> [@ref]
  <owner> [@faction]
  <price> [@average, @max, @min]
  <production> [@amount, @dismantlefactor, @method, @name, @tags, @time]  -->  primary
    <primary>  -->  ware
      <ware> [@amount, @ware]
  <restriction> [@licence]
  <use> [@factions, @purposes, @threshold]
```

## Group: `water`
```xml
<ware> [@description, @factoryname, @group, @id, @licence, @name, @tags, @transport, @volume]  -->  container, icon, illegal, price, production
  <container> [@ref]
  <icon> [@active, @video]
  <illegal> [@factions]
  <price> [@average, @max, @min]
  <production> [@amount, @method, @name, @time]  -->  effects, primary
    <effects>  -->  effect
      <effect> [@product, @type]
    <primary>  -->  ware
      <ware> [@amount, @ware]
```

## Group: `weapons`
```xml
<ware> [@description, @group, @id, @name, @tags, @transport, @volume]  -->  component, icon, owner, price, production, restriction, use
  <component> [@ref]
  <icon> [@video]
  <owner> [@faction]
  <price> [@average, @max, @min]
  <production> [@amount, @dismantlefactor, @method, @name, @tags, @time]  -->  primary
    <primary>  -->  ware
      <ware> [@amount, @ware]
  <restriction> [@licence]
  <use> [@factions, @purposes, @threshold]
```
