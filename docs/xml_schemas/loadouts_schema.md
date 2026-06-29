# libraries/loadouts.xml Normalized Schema

```xml
<loadouts>  -->  loadout
  <loadout> [@description, @id, @macro, @name]  -->  ammunition, crew, groups, macros, software, virtualmacros
    <ammunition>  -->  ammunition, unit
      <ammunition> [@exact, @macro, @max, @min, @optional]
      <unit> [@exact, @macro]
    <crew> [@experienced]  -->  crew
      <crew> [@exact, @role]
    <groups>  -->  shields, turrets
      <shields> [@exact, @group, @macro, @max, @min, @optional, @path]
      <turrets> [@exact, @group, @macro, @max, @min, @optional, @path]
    <macros>  -->  engine, shield, turret, weapon
      <engine> [@macro, @path]
      <shield> [@macro, @optional, @path]
      <turret> [@macro, @optional, @path]
      <weapon> [@macro, @optional, @path]
    <software>  -->  software
      <software> [@ware]
    <virtualmacros>  -->  thruster
      <thruster> [@macro]
```
