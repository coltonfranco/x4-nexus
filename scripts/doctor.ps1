# Sanity-check the local environment for x4-companion development.
# Run from repo root:  .\scripts\doctor.ps1

$ErrorActionPreference = "Stop"

Write-Host "== Python ==" -ForegroundColor Cyan
python --version
if ($LASTEXITCODE -ne 0) { Write-Error "Python 3.12+ not on PATH" }

Write-Host "`n== uv ==" -ForegroundColor Cyan
uv --version
if ($LASTEXITCODE -ne 0) {
  Write-Error "uv not installed. See https://docs.astral.sh/uv/"
}

Write-Host "`n== Node ==" -ForegroundColor Cyan
node --version
if ($LASTEXITCODE -ne 0) { Write-Error "Node 20+ not on PATH" }

Write-Host "`n== x4c doctor ==" -ForegroundColor Cyan
uv run x4c doctor
