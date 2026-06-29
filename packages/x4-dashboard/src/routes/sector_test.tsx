import { SectorMap } from '../components/map/SectorMap'

export default function SectorTestPage() {
  // Use Antigone Memorial as a rich test sector, or fallback to grand_exchange_1
  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="px-5 py-3 border-b border-border shrink-0 flex items-center justify-between bg-card">
        <div>
          <h1 className="text-lg font-bold leading-none">Sector Map Debug</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Testing standalone local coordinate mapping component
          </p>
        </div>
      </div>
      <SectorMap sectorId="Cluster_01_Sector001_macro" /> 
    </div>
  )
}
