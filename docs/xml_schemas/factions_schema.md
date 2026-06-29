# libraries/factions.xml Normalized Schema

```xml
<factions> [@{http://www.w3.org/2001/XMLSchema-instance}noNamespaceSchemaLocation]  -->  faction, signals
  <faction> [@active, @behaviourset, @constructionbias, @description, @homespacename, @id, @name, @policefaction, @prefixname, @primaryrace, @shortname, @spacename, @tags]  -->  account, buildrules, color, icon, licences, relations, signals
    <account> [@amount]
    <buildrules> [@method]
    <color> [@ref]
    <icon> [@active, @banner, @inactive]
    <licences>  -->  licence
      <licence> [@description, @factions, @grantedtext, @icon, @maxlegalscan, @minrelation, @name, @notgrantedtext, @precursor, @price, @tags, @type]
    <relations> [@locked]  -->  relation
      <relation> [@faction, @relation]
    <signals>  -->  response
      <response> [@response, @signal]
  <signals>  -->  signal
    <signal> [@ask, @default, @description, @id, @name]  -->  response
      <response> [@description, @id, @name]
```
