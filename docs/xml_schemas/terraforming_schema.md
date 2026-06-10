# libraries/terraforming.xml Normalized Schema

```xml
<terraforming> [@{http://www.w3.org/2001/XMLSchema-instance}noNamespaceSchemaLocation]  -->  projectgroups, projects, stats
  <projectgroups>  -->  projectgroup
    <projectgroup> [@id, @name]
  <projects>  -->  project
    <project> [@chance, @description, @duration, @group, @id, @name, @repeatcooldown, @research, @resilient, @showalways, @version]  -->  blockedgroups, blockedprojects, conditions, deliveries, effects, rebates, removedprojects, resources, sideeffects
      <blockedgroups>  -->  group
        <group> [@id]
      <blockedprojects>  -->  project
        <project> [@id]
      <conditions>  -->  condition
        <condition> [@max, @maxvalue, @min, @minvalue, @stat]
      <deliveries>  -->  ship
        <ship> [@amount, @buildduration, @macro]
      <effects>  -->  effect
        <effect> [@change, @max, @min, @stat, @value]
      <rebates>  -->  rebate
        <rebate> [@value, @ware, @waregroup]
      <removedprojects>  -->  project
        <project> [@id]
      <resources> [@maxprice, @maxwares, @minwares, @payout, @price, @pricescale]  -->  ware
        <ware> [@amount, @ware]
      <sideeffects>  -->  sideeffect
        <sideeffect> [@beneficial, @chance, @change, @project, @setback, @stat, @text]
  <stats>  -->  stat
    <stat> [@default, @dynamic, @icon, @id, @inactivetext, @name]  -->  range
      <range> [@b, @description, @end, @g, @habitable, @r, @state]
```
