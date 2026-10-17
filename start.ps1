param([int]$Port = 3000)

$ErrorActionPreference = 'Stop'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodeBinary = if ($nodeCommand) { $nodeCommand.Source } else { $null }
if (-not $nodeBinary) {
    # Use the verified portable runtime prepared for this workspace, if present.
    $toolsDirectory = Join-Path $env:LOCALAPPDATA 'BonsaiTools'
    $nodeBinary = Get-ChildItem -Path (Join-Path $toolsDirectory 'node-v*-win-x64/node.exe') -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $nodeBinary) {
    throw 'Node.js 22 or newer is required. Install Node.js, then run this script again.'
}
$viteEntry = Join-Path $PSScriptRoot 'web/node_modules/vite/bin/vite.js'
if (-not (Test-Path -LiteralPath $viteEntry)) {
    throw 'Dependencies are missing. Run cd web, then npm ci, then try again.'
}
Push-Location (Join-Path $PSScriptRoot 'web')
try {
    & $nodeBinary $viteEntry --host 127.0.0.1 --port $Port
    if ($LASTEXITCODE) { exit $LASTEXITCODE }
} finally { Pop-Location }
