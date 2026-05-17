param(
    [string]$Version = "",
    [switch]$IncludeScripts = $true
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$frontendPackagePath = Join-Path $repoRoot "frontend/package.json"
$frontendPackage = Get-Content $frontendPackagePath -Raw | ConvertFrom-Json

if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = [string]$frontendPackage.version
}

$releaseName = "PlotKityCat-v$Version"
$releaseRoot = Join-Path $repoRoot "build/release/$releaseName"
$releaseZip = "$releaseRoot.zip"
$binExe = Join-Path $repoRoot "build/bin/PlotKityCat.exe"
$runtimeZip = Join-Path $repoRoot "resources/runtime/runtime.zip"
$scriptsDir = Join-Path $repoRoot "Scripts"

if (-not (Test-Path $binExe)) {
    throw "Missing built executable: $binExe"
}

if (-not (Test-Path $runtimeZip)) {
    throw "Missing runtime archive: $runtimeZip"
}

if (Test-Path $releaseRoot) {
    Remove-Item -LiteralPath $releaseRoot -Recurse -Force
}

if (Test-Path $releaseZip) {
    Remove-Item -LiteralPath $releaseZip -Force
}

New-Item -ItemType Directory -Path (Join-Path $releaseRoot "resources/runtime") -Force | Out-Null
Copy-Item -LiteralPath $binExe -Destination (Join-Path $releaseRoot "PlotKityCat.exe") -Force
Copy-Item -LiteralPath $runtimeZip -Destination (Join-Path $releaseRoot "resources/runtime/runtime.zip") -Force

if ($IncludeScripts -and (Test-Path $scriptsDir)) {
    Copy-Item -LiteralPath $scriptsDir -Destination (Join-Path $releaseRoot "Scripts") -Recurse -Force
}

Compress-Archive -LiteralPath $releaseRoot -DestinationPath $releaseZip -CompressionLevel Optimal

Write-Host "Packaged release:"
Write-Host "  Directory: $releaseRoot"
Write-Host "  Zip:       $releaseZip"
