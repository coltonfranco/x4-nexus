# libraries/region_definitions.xml Normalized Schema

```xml
<regions> [@{http://www.w3.org/2001/XMLSchema-instance}noNamespaceSchemaLocation]  -->  alias, region
  <alias> [@name, @ref]
  <region> [@density, @maxnoisevalue, @minnoisevalue, @name, @noisescale, @rotation, @seed]  -->  boundaries, boundary, falloff, fields, resources
    <boundaries>  -->  boundary
      <boundary> [@class, @invert]  -->  position, size, splineposition
        <position> [@x, @y, @z]
        <size> [@linear, @r]
        <splineposition> [@inlength, @outlength, @tx, @ty, @tz, @x, @y, @z]
    <boundary> [@class]  -->  size, splineposition
      <size> [@linear, @r, @x, @y, @z]
      <splineposition> [@inlength, @outlength, @tx, @ty, @tz, @x, @y, @z]
    <falloff>  -->  lateral, radial
      <lateral> [@default]  -->  step
        <step> [@position, @value]
      <radial> [@default]  -->  step
        <step> [@position, @value]
    <fields>  -->  ambientsound, asteroid, damagefield, debris, effect, force, gravidar, influence, nebula, object, positional, volumetriccloud, volumetricfog
      <ambientsound> [@minnoisevalue, @musicoverride, @noisescale, @playtime, @priority, @seed, @soundid]
      <asteroid> [@allowpitchrotation, @allowrollrotation, @allowyawrotation, @boxchecks, @densityfactor, @groupref, @lodrule, @maxnoisevalue, @minnoisevalue, @noisescale, @ref, @replenishtime, @resourcepercentage, @resources, @rotation, @rotationvariation, @seed, @yield, @yieldvariation]  -->  color
        <color> [@a, @b, @g, @r, @v]
      <damagefield> [@affectsnavigation, @defaulttimedensity, @ignoreimmunity, @maxnoisevalue, @minnoisevalue]  -->  damage, effects, profile, speedcurve
        <damage> [@hull, @noshield, @shield]
        <effects> [@hull, @maxdelay, @mindelay, @shield]
        <profile> [@attackduration, @endvalue, @releaseduration, @startvalue, @sustainduration, @sustainvalue]
        <speedcurve>  -->  step
          <step> [@position, @value]
      <debris> [@densityfactor, @distancefactor, @groupref, @maxnoisevalue, @minnoisevalue, @noisescale, @rotation, @rotationvariation, @seed]
      <effect> [@affectsnavigation, @delay, @delayvariation, @hazardwarning, @maxdistance, @maxnoisevalue, @minnoisevalue, @noisescale, @ref, @seed]  -->  damage
        <damage> [@shield]
      <force> [@defaulttimedensity, @maxnoisevalue, @minnoisevalue, @range, @strength]  -->  offset, profile
        <offset> [@x, @y, @z]
        <profile> [@attackduration, @endvalue, @releaseduration, @startvalue, @sustainduration, @sustainvalue]
      <gravidar> [@factor, @maxnoisevalue, @minnoisevalue, @noisescale, @seed]
      <influence> [@affectsnavigation, @delay, @hazardous, @hazardwarning, @ref]
      <nebula> [@backgroundfog, @fogdistance, @localblue, @localdensity, @localgreen, @localred, @maxnoisevalue, @minnoisevalue, @noisescale, @ref, @resources, @seed, @uniformblue, @uniformdensity, @uniformgreen, @uniformred]
      <object> [@densityfactor, @groupref, @maxnoisevalue, @minnoisevalue, @noisescale, @ref, @rotation, @rotationvariation, @seed]
      <positional> [@densityfactor, @distancefactor, @lodrule, @maxnoisevalue, @minnoisevalue, @noisescale, @ref, @rotation, @rotationvariation, @seed]
      <volumetriccloud> [@densityfactor, @distancefactor, @flashcount, @maxnoisevalue, @minnoisevalue, @multiplier, @noisescale, @rotation, @rotationvariation, @seed, @singlevolume, @volume, @x, @y, @z]
      <volumetricfog> [@defaulttimedensity, @densityfactor, @distancefactor, @lodrule, @maxnoisevalue, @medium, @minnoisevalue, @multiplier, @noisescale, @rotation, @rotationvariation, @seed, @size, @sizevariation, @texture, @timedensitydelay]  -->  offset, profile
        <offset> [@x, @y, @z]
        <profile> [@attackduration, @delay, @endvalue, @loop, @releaseduration, @startvalue, @sustainduration, @sustainvalue]
    <resources>  -->  resource
      <resource> [@ware, @yield]
```
