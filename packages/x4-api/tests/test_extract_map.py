import sqlite3

from x4_extract.static.map import extract, write

# Real game format: <macros><macro class="cluster|sector|zone" name="...">
CLUSTERS_XML = b"""<?xml version="1.0" encoding="utf-8"?>
<macros>
  <macro name="Cluster_01_macro" class="cluster">
    <component ref="standardcluster" />
    <connections>
      <connection name="Cluster_01_Sector001_connection" ref="sectors">
        <offset>
          <position x="100.0" y="200.0" z="300.0" />
          <quaternion qx="0" qy="0.573576" qz="0" qw="0.819152" />
        </offset>
        <macro ref="Cluster_01_Sector001_macro" connection="cluster" />
      </connection>
    </connections>
  </macro>
</macros>
"""

SECTORS_XML = b"""<?xml version="1.0" encoding="utf-8"?>
<macros>
  <macro name="Cluster_01_Sector001_macro" class="sector">
    <component ref="standardsector" />
    <connections>
      <connection name="Zone001_Cluster_01_Sector001_connection" ref="zones">
        <offset>
          <position x="1000.5" y="-500.0" z="2000.0" />
        </offset>
        <macro ref="Zone001_Cluster_01_Sector001_macro" connection="sector" />
      </connection>
    </connections>
  </macro>
</macros>
"""

ZONES_XML = b"""<?xml version="1.0" encoding="utf-8"?>
<macros>
  <macro name="Zone001_Cluster_01_Sector001_macro" class="zone">
    <component ref="standardzone" />
    <connections>
      <connection name="Zone001_Cluster_01_Sector001_connection" ref="destination">
      </connection>
    </connections>
  </macro>
  <macro name="Zone002_Cluster_01_Sector001_macro" class="zone">
    <component ref="standardzone" />
    <connections />
  </macro>
</macros>
"""

# Galaxy format: <connection ref="destination" path="..."><macro path="..."/></connection>
GALAXY_XML = b"""<?xml version="1.0" encoding="utf-8"?>
<macros>
  <macro name="galaxy_macro" class="galaxy">
    <component ref="standardgalaxy" />
    <connections>
      <connection name="Cluster_01_connection" ref="clusters">
        <offset>
          <position x="10.0" y="20.0" z="30.0" />
        </offset>
        <macro ref="Cluster_01_macro" connection="galaxy" />
      </connection>
      <connection ref="destination"
          path="../Zone001_Cluster_01_Sector001_connection/connection_ClusterGate01To02">
        <macro
          path="../../Zone002_Cluster_01_Sector001_connection/connection_ClusterGate02To01"/>
      </connection>
    </connections>
  </macro>
</macros>
"""

MAPDEFAULTS_XML = b"""<?xml version="1.0" encoding="utf-8"?>
<defaults>
  <dataset macro="Cluster_01_macro">
    <properties>
      <identification name="{20003,10001}" description="{20003,10002}" />
      <system>
        <space environment="Thin Nebula"/>
        <suns>
          <sun class="White Dwarf"/>
        </suns>
        <planets>
          <planet population="{1042,10021}" maxpopulation="420000" />
        </planets>
      </system>
    </properties>
  </dataset>
  <dataset macro="Cluster_01_Sector001_macro">
    <properties>
      <identification name="{20004,10011}" description="{20004,10012}"/>
      <area sunlight="1.23" economy="0.5" security="0.25" />
    </properties>
  </dataset>
</defaults>
"""



def test_extract_map_pure():
    xmls = {
        "clusters.xml": CLUSTERS_XML,
        "sectors.xml":  SECTORS_XML,
        "zones.xml":    ZONES_XML,
        "galaxy.xml":   GALAXY_XML,
        "mapdefaults.xml": MAPDEFAULTS_XML,
    }
    result = extract(xmls)

    assert len(result.clusters) == 1
    assert result.clusters[0]["cluster_id"] == "Cluster_01_macro"
    assert result.clusters[0]["name_id"] == "{20003,10001}"
    assert result.clusters[0]["environment"] == "Thin Nebula"
    assert result.clusters[0]["sun_class"] == "White Dwarf"
    assert result.clusters[0]["population_id"] == "{1042,10021}"
    assert result.clusters[0]["max_population"] == 420000
    assert result.clusters[0]["x"] == 10.0
    assert result.clusters[0]["y"] == 20.0
    assert result.clusters[0]["z"] == 30.0

    assert len(result.sectors) == 1
    assert result.sectors[0]["sector_id"] == "Cluster_01_Sector001_macro"
    assert result.sectors[0]["cluster_id"] == "Cluster_01_macro"
    assert result.sectors[0]["name_id"] == "{20004,10011}"
    assert result.sectors[0]["sunlight"] == 1.23
    assert result.sectors[0]["economy"] == 0.5
    assert result.sectors[0]["security"] == 0.25
    assert result.sectors[0]["x"] == 100.0
    assert result.sectors[0]["y"] == 200.0
    assert result.sectors[0]["z"] == 300.0
    assert result.sectors[0]["qy"] == 0.573576

    assert len(result.zones) == 2
    z = next(z for z in result.zones if z["zone_id"] == "Zone001_Cluster_01_Sector001_macro")
    assert z["sector_id"] == "Cluster_01_Sector001_macro"
    assert z["x"] == 1000.5
    assert z["y"] == -500.0
    assert z["z"] == 2000.0

    assert len(result.gates) == 1
    g = result.gates[0]
    assert "Zone001" in g["from_zone_id"]
    assert "Zone002" in g["to_zone_id"]


def test_extract_dlc_files_merged():
    """DLC files at separate paths are processed alongside base files."""
    dlc_clusters = b"""<?xml version="1.0" encoding="utf-8"?>
<macros>
  <macro name="Cluster_602_macro" class="cluster">
    <component ref="standardcluster" />
    <connections />
  </macro>
</macros>
"""
    xmls = {
        "clusters.xml":          CLUSTERS_XML,
        "dlc_boron_clusters.xml": dlc_clusters,
        "sectors.xml":           SECTORS_XML,
        "zones.xml":             ZONES_XML,
        "galaxy.xml":            GALAXY_XML,
    }
    result = extract(xmls)

    cluster_ids = {c["cluster_id"] for c in result.clusters}
    assert "Cluster_01_macro" in cluster_ids
    assert "Cluster_602_macro" in cluster_ids


def test_write_map(tmp_path):
    db_path = tmp_path / "static.db"
    conn = sqlite3.connect(db_path)
    conn.execute(
        "CREATE TABLE clusters (cluster_id TEXT PRIMARY KEY, name TEXT, dlc TEXT, "
        "name_id TEXT, description_id TEXT, environment TEXT, sun_class TEXT, population_id TEXT, max_population INTEGER, owner_faction TEXT, x REAL, y REAL, z REAL, qx REAL, qy REAL, qz REAL, qw REAL)"
    )
    conn.execute(
        "CREATE TABLE sectors (sector_id TEXT PRIMARY KEY, cluster_id TEXT, name TEXT, owner_faction TEXT, dlc TEXT, "
        "name_id TEXT, description_id TEXT, sunlight REAL, economy REAL, security REAL, tags TEXT, access_licence TEXT, x REAL, y REAL, z REAL, qx REAL, qy REAL, qz REAL, qw REAL)"
    )
    conn.execute(
        "CREATE TABLE zones (zone_id TEXT PRIMARY KEY, sector_id TEXT, file_path TEXT, is_legacy BOOLEAN DEFAULT 0, x REAL, y REAL, z REAL, qx REAL, qy REAL, qz REAL, qw REAL)"
    )
    conn.execute(
        "CREATE TABLE gates "
        "(from_zone_id TEXT NOT NULL, to_zone_id TEXT NOT NULL, kind TEXT, "
        "PRIMARY KEY (from_zone_id, to_zone_id))"
    )
    conn.execute(
        "CREATE TABLE superhighways (from_zone_id TEXT NOT NULL, to_zone_id TEXT NOT NULL, PRIMARY KEY (from_zone_id, to_zone_id))"
    )
    conn.execute(
        "CREATE TABLE regions (region_id TEXT PRIMARY KEY, cluster_id TEXT, sector_id TEXT, x REAL, y REAL, z REAL, qx REAL, qy REAL, qz REAL, qw REAL)"
    )

    xmls = {
        "clusters.xml": CLUSTERS_XML,
        "sectors.xml":  SECTORS_XML,
        "zones.xml":    ZONES_XML,
        "galaxy.xml":   GALAXY_XML,
    }
    result = extract(xmls)

    with conn:
        write(conn, result)

    assert conn.execute("SELECT COUNT(*) FROM clusters").fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM sectors").fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM zones").fetchone()[0] == 2
    assert conn.execute("SELECT COUNT(*) FROM gates").fetchone()[0] == 1
