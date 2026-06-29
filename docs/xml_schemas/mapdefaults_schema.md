# libraries/mapdefaults.xml Normalized Schema

```xml
<defaults> [@{http://www.w3.org/2001/XMLSchema-instance}noNamespaceSchemaLocation]  -->  dataset
  <dataset> [@comment, @macro]  -->  properties
    <properties>  -->  access, area, identification, resources, sounds, system, worlds
      <access> [@licence]
      <area> [@economy, @extensionexclusivejobs, @factionlogic, @god, @jobs, @security, @sunlight, @tags, @thewave]
      <identification> [@description, @image, @name, @system]
      <resources>  -->  ware
        <ware> [@amount, @ware]
      <sounds>  -->  music
        <music> [@ref]
      <system>  -->  planets, space, suns
        <planets>  -->  planet
          <planet> [@atmopart, @atmosphere, @class, @geology, @maxpopulation, @name, @part, @population, @settlements]  -->  moons, shaderparams
            <moons>  -->  moon
              <moon> [@atmopart, @atmosphere, @geology, @maxpopulation, @name, @part, @population, @settlements]  -->  shaderparams
                <shaderparams>  -->  shaderparam
                  <shaderparam> [@name, @stat]  -->  param
                    <param> [@position, @value]
            <shaderparams>  -->  shaderparam
              <shaderparam> [@default, @name, @stat, @type]  -->  param
                <param> [@a, @b, @g, @position, @r, @texture, @value]
        <space> [@environment]
        <suns>  -->  sun
          <sun> [@class]
      <worlds>  -->  world
        <world> [@factor, @part]
```
