param(
    [string]$Version = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$frontendPackagePath = Join-Path $repoRoot "frontend/package.json"

if ([string]::IsNullOrWhiteSpace($Version)) {
    $frontendPackage = Get-Content $frontendPackagePath -Raw | ConvertFrom-Json
    $Version = [string]$frontendPackage.version
}

$ldflags = "-X plotkitycat/internal/version.appVersion=$Version"

Write-Host "Building PlotKityCat with version $Version"
wails build -clean -ldflags $ldflags
