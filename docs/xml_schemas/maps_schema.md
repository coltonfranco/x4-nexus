# Map Files Normalized Schema

Grouped by `<macro class="...">` (clusters, sectors, zones)

## Class: `cluster`

```xml
<macro> [@class, @name]  -->  component, connections
  <component> [@ref]
  <connections>  -->  connection
    <connection> [@name, @ref]  -->  macro, offset
      <macro> [@connection, @name, @ref]  -->  component, connections, properties
        <component> [@connection, @ref]
        <connections>  -->  connection
          <connection> [@ref]  -->  macro
            <macro> [@connection, @path, @ref]
        <properties>  -->  phases, region
          <phases> [@default]  -->  phase
            <phase> [@duration, @id, @loop, @path]  -->  propagation, transitions
              <propagation> [@part, @speed]
              <transitions>  -->  transition
                <transition> [@duration, @id, @trigger]
          <region> [@ref]
      <offset>  -->  position, quaternion, rotation
        <position> [@x, @y, @z]
        <quaternion> [@qw, @qx, @qy, @qz]
        <rotation> [@pitch, @yaw]
```

## Class: `galaxy`

```xml
<macro> [@class, @name]  -->  component, connections
  <component> [@ref]
  <connections>  -->  connection
    <connection> [@name, @path, @ref]  -->  macro, offset
      <macro> [@connection, @path, @ref]
      <offset>  -->  position
        <position> [@x, @y, @z]
```

## Class: `highway`

```xml
<macro> [@class, @name]  -->  component, connections, properties
  <component> [@ref]
  <connections>  -->  connection
    <connection> [@ref]  -->  offset
      <offset>  -->  position
        <position> [@x, @y, @z]
  <properties>  -->  boundaries, configuration, controls
    <boundaries>  -->  boundary
      <boundary> [@class]  -->  size, splineposition
        <size> [@r]
        <splineposition> [@inlength, @outlength, @tx, @ty, @tz, @weight, @x, @y, @z]
    <configuration> [@ref, @ring]
    <controls>  -->  angular, linear
      <angular>  -->  roll
      <linear>  -->  time
```

## Class: `sector`

```xml
<macro> [@class, @name]  -->  component, connections, properties
  <component> [@ref]
  <connections>  -->  connection
    <connection> [@name, @ref]  -->  macro, offset
      <macro> [@connection, @ref]  -->  connections
        <connections>  -->  connection
          <connection> [@ref]  -->  macro
            <macro> [@connection, @path]
      <offset>  -->  position
        <position> [@x, @y, @z]
  <properties>  -->  navigation
    <navigation> [@highres]
```

## Class: `unknown`

```xml
<macro> [@connection, @name, @path, @ref]  -->  component, connections, properties
  <component> [@connection, @ref]
  <connections>  -->  connection
    <connection> [@ref]  -->  macro
      <macro> [@connection, @path, @ref]
  <properties>  -->  identification, phases, region, state
    <identification> [@owner]
    <phases> [@default]  -->  phase
      <phase> [@duration, @id, @loop, @path]  -->  propagation, transitions
        <propagation> [@part, @speed]
        <transitions>  -->  transition
          <transition> [@duration, @id, @trigger]
    <region> [@ref]
    <state> [@active]
```

## Class: `zone`

```xml
<macro> [@class, @name]  -->  component, connections
  <component> [@ref]
  <connections>  -->  connection
    <connection> [@name, @ref]  -->  macro, offset
      <macro> [@connection, @ref]  -->  properties
        <properties>  -->  identification, state
          <identification> [@owner]
          <state> [@active]
      <offset>  -->  position, quaternion
        <position> [@x, @y, @z]
        <quaternion> [@qw, @qx, @qy, @qz]
```
