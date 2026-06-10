# libraries/equipmentmods.xml Normalized Schema

```xml
<equipmentmods>  -->  engine, shield, ship, weapon
  <engine>  -->  boostacc, boostduration, boostthrust, forwardthrust, rotationthrust, strafeacc, strafethrust, travelattacktime, travelchargetime, travelthrust
    <boostacc> [@max, @min, @quality, @ware]
    <boostduration> [@max, @min, @quality, @ware]
    <boostthrust> [@max, @min, @quality, @ware]  -->  bonus
      <bonus> [@chance, @max]  -->  boostacc, boostduration, forwardthrust, strafethrust, travelthrust
        <boostacc> [@max, @min, @weight]
        <boostduration> [@max, @min, @weight]
        <forwardthrust> [@max, @min]
        <strafethrust> [@max, @min, @weight]
        <travelthrust> [@max, @min]
    <forwardthrust> [@max, @min, @quality, @ware]  -->  bonus
      <bonus> [@chance, @max]  -->  boostthrust, rotationthrust, strafeacc, strafethrust, travelthrust
        <boostthrust> [@max, @min]
        <rotationthrust> [@max, @min]
        <strafeacc> [@max, @min]
        <strafethrust> [@max, @min]
        <travelthrust> [@max, @min]
    <rotationthrust> [@max, @min, @quality, @ware]  -->  bonus
      <bonus> [@chance, @max]  -->  forwardthrust, strafethrust
        <forwardthrust> [@max, @min]
        <strafethrust> [@max, @min]
    <strafeacc> [@max, @min, @quality, @ware]
    <strafethrust> [@max, @min, @quality, @ware]  -->  bonus
      <bonus> [@chance, @max]  -->  rotationthrust
        <rotationthrust> [@max, @min]
    <travelattacktime> [@max, @min, @quality, @ware]
    <travelchargetime> [@max, @min, @quality, @ware]
    <travelthrust> [@max, @min, @quality, @ware]  -->  bonus
      <bonus> [@chance, @max]  -->  boostthrust, forwardthrust, rotationthrust, strafethrust, travelattacktime, travelchargetime, travelstartthrust
        <boostthrust> [@max, @min]
        <forwardthrust> [@max, @min]
        <rotationthrust> [@max, @min, @weight]
        <strafethrust> [@max, @min, @weight]
        <travelattacktime> [@max, @min, @weight]
        <travelchargetime> [@max, @min, @weight]
        <travelstartthrust> [@max, @min, @weight]
  <shield>  -->  capacity, rechargedelay, rechargerate
    <capacity> [@max, @min, @quality, @ware]  -->  bonus
      <bonus> [@chance, @max]  -->  rechargedelay, rechargerate
        <rechargedelay> [@max, @min]
        <rechargerate> [@max, @min]
    <rechargedelay> [@max, @min, @quality, @ware]
    <rechargerate> [@max, @min, @quality, @ware]  -->  bonus
      <bonus> [@chance, @max]  -->  capacity, rechargedelay
        <capacity> [@max, @min]
        <rechargedelay> [@max, @min]
  <ship>  -->  countermeasurecapacity, deployablecapacity, drag, hidecargochance, mass, maxhull, missilecapacity, radarcloak, radarrange, regiondamage, unitcapacity
    <countermeasurecapacity> [@max, @min, @quality, @ware]
    <deployablecapacity> [@max, @min, @quality, @ware]
    <drag> [@max, @min, @quality, @ware]  -->  bonus
      <bonus> [@chance, @max]  -->  countermeasurecapacity, deployablecapacity, maxhull, missilecapacity, radarrange, unitcapacity
        <countermeasurecapacity> [@max, @min, @weight]
        <deployablecapacity> [@max, @min, @weight]
        <maxhull> [@max, @min, @weight]
        <missilecapacity> [@max, @min, @weight]
        <radarrange> [@max, @min, @weight]
        <unitcapacity> [@max, @min, @weight]
    <hidecargochance> [@max, @min, @quality, @ware]
    <mass> [@max, @min, @quality, @ware]  -->  bonus
      <bonus> [@chance, @max]  -->  countermeasurecapacity, deployablecapacity, drag, maxhull, missilecapacity, radarrange, unitcapacity
        <countermeasurecapacity> [@max, @min, @weight]
        <deployablecapacity> [@max, @min, @weight]
        <drag> [@max, @min]
        <maxhull> [@max, @min, @weight]
        <missilecapacity> [@max, @min, @weight]
        <radarrange> [@max, @min, @weight]
        <unitcapacity> [@max, @min, @weight]
    <maxhull> [@max, @min, @quality, @ware]
    <missilecapacity> [@max, @min, @quality, @ware]
    <radarcloak> [@max, @min, @quality, @ware]  -->  bonus
      <bonus> [@chance, @max]  -->  radarrange
        <radarrange> [@max, @min]
    <radarrange> [@max, @min, @quality, @ware]
    <regiondamage> [@max, @min, @quality, @ware]  -->  bonus
      <bonus> [@chance, @max]  -->  maxhull
        <maxhull> [@max, @min]
    <unitcapacity> [@max, @min, @quality, @ware]
  <weapon>  -->  beamlength, chargetime, cooling, damage, lifetime, mining, reload, rotationspeed, speed, sticktime, surfaceelement
    <beamlength> [@max, @min, @quality, @ware]
    <chargetime> [@max, @min, @quality, @ware]
    <cooling> [@max, @min, @quality, @ware]  -->  bonus
      <bonus> [@chance, @max]  -->  chargetime, damage, lifetime, mining, reload, rotationspeed
        <chargetime> [@max, @min, @weight]
        <damage> [@max, @min]
        <lifetime> [@max, @min, @weight]
        <mining> [@max, @min, @weight]
        <reload> [@max, @min, @weight]
        <rotationspeed> [@max, @min, @weight]
    <damage> [@max, @min, @quality, @ware]  -->  bonus
      <bonus> [@chance, @max]  -->  chargetime, cooling, lifetime, mining, reload, rotationspeed, sticktime
        <chargetime> [@max, @min, @weight]
        <cooling> [@max, @min, @weight]
        <lifetime> [@max, @min, @weight]
        <mining> [@max, @min, @weight]
        <reload> [@max, @min, @weight]
        <rotationspeed> [@max, @min, @weight]
        <sticktime> [@max, @min, @weight]
    <lifetime> [@max, @min, @quality, @ware]
    <mining> [@max, @min, @quality, @ware]  -->  bonus
      <bonus> [@chance, @max]  -->  cooling, damage, reload, rotationspeed
        <cooling> [@max, @min, @weight]
        <damage> [@max, @min, @weight]
        <reload> [@max, @min, @weight]
        <rotationspeed> [@max, @min, @weight]
    <reload> [@max, @min, @quality, @ware]
    <rotationspeed> [@max, @min, @quality, @ware]
    <speed> [@max, @min, @quality, @ware]  -->  bonus
      <bonus> [@chance, @max]  -->  damage, lifetime, reload, rotationspeed
        <damage> [@max, @min, @weight]
        <lifetime> [@max, @min, @weight]
        <reload> [@max, @min, @weight]
        <rotationspeed> [@max, @min, @weight]
    <sticktime> [@max, @min, @quality, @ware]  -->  bonus
      <bonus> [@chance, @max]  -->  chargetime, lifetime, mining, reload, rotationspeed
        <chargetime> [@max, @min, @weight]
        <lifetime> [@max, @min, @weight]
        <mining> [@max, @min, @weight]
        <reload> [@max, @min, @weight]
        <rotationspeed> [@max, @min, @weight]
    <surfaceelement> [@max, @min, @quality, @ware]  -->  bonus
      <bonus> [@chance, @max]  -->  chargetime, cooling, lifetime, mining, rotationspeed
        <chargetime> [@max, @min, @weight]
        <cooling> [@max, @min]
        <lifetime> [@max, @min, @weight]
        <mining> [@max, @min, @weight]
        <rotationspeed> [@max, @min, @weight]
```
