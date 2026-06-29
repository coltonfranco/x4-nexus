# libraries/god.xml Normalized Schema

```xml
<god> [@{http://www.w3.org/2001/XMLSchema-instance}noNamespaceSchemaLocation]  -->  gamestart, objects, products, stations
  <gamestart> [@galaxy, @ref]  -->  objects, products, ships, stations
    <stations>  -->  station
      <station> [@id, @owner, @race, @type]  -->  location, position, quotas, station
        <location> [@class, @macro, @matchextension]
        <position> [@pitch, @roll, @x, @y, @yaw, @z]
        <quotas>  -->  quota
          <quota> [@galaxy, @gamestart, @zone]
        <station> [@constructionplan]  -->  loadout, select
          <loadout>  -->  level
            <level> [@exact]
          <select> [@faction, @tags]
  <objects>  -->  object
    <object> [@id, @owner]  -->  location, object, position, quotas
      <location> [@class, @macro, @solitary]  -->  corerange, region
        <corerange> [@max, @min]
        <region> [@allowhazardous, @gravidar]
      <object> [@macro]
      <position> [@pitch, @roll, @x, @y, @yaw, @z]
      <quotas>  -->  quota
        <quota> [@galaxy]
  <products>  -->  product
    <product> [@friendgroup, @id, @owner, @startactive, @type, @ware]  -->  location, module, position, quotas
      <location> [@class, @comparison, @excludedtags, @excluderinghighway, @faction, @macro, @relation, @solitary, @tags]  -->  economy, region, security, sunlight
        <economy> [@max, @maxbound, @min]
        <region> [@allowhazardous, @max, @ware]
        <security> [@min]
        <sunlight> [@max, @maxbound, @min]
      <module>  -->  select
        <select> [@faction, @race, @tags, @ware]
      <position> [@pitch, @roll, @x, @y, @z]
      <quotas>  -->  quota
        <quota> [@cluster, @galaxy, @gamestart, @sector]
  <stations>  -->  defaults, station
    <defaults>  -->  location, modules, quota
      <location> [@coreboundaryzoneheight, @newzonechance]  -->  corerange, region
        <corerange> [@max]
        <region> [@allowgravidar, @allowhazardous]
      <modules> [@production, @storage]
      <quota> [@sector, @zone]
    <station> [@encyclopedia, @id, @owner, @race, @respawnable, @type]  -->  location, position, quota, quotas, station
      <location> [@class, @coreboundaryzoneheight, @excludedtags, @macro, @matchextension, @newzonechance, @solitary]  -->  corerange, region
        <corerange> [@max, @min]
        <region> [@allowhazardous, @gravidar]
      <position> [@pitch, @roll, @safepos, @x, @y, @yaw, @z]
      <quota> [@galaxy, @sector]
      <quotas>  -->  quota
        <quota> [@galaxy, @gamestart, @sector, @zone]
      <station> [@constructionplan, @macro, @ref]  -->  loadout, select
        <loadout> [@useplanloadout]  -->  level, variation
          <level> [@exact, @faction]
          <variation> [@exact]
        <select> [@faction, @tags]
```
