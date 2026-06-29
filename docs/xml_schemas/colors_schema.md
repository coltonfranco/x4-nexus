# libraries/colors.xml Normalized Schema

```xml
<colormap> [@{http://www.w3.org/2001/XMLSchema-instance}noNamespaceSchemaLocation]  -->  colors, daltonization, mappings
  <colors>  -->  color
    <color> [@a, @b, @g, @glow, @id, @r]
  <daltonization>  -->  transformation
    <transformation> [@name, @type]  -->  blue, green, long, middle, red, short
      <blue> [@blue, @green, @long, @middle, @red, @short]
      <green> [@blue, @green, @long, @middle, @red, @short]
      <long> [@blue, @green, @long, @middle, @red, @short]
      <middle> [@blue, @green, @long, @middle, @red, @short]
      <red> [@blue, @green, @long, @middle, @red, @short]
      <short> [@blue, @green, @long, @middle, @red, @short]
  <mappings>  -->  mapping
    <mapping> [@id, @ref]
```
