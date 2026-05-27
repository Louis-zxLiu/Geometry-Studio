param(
    [string]$Version = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$versionFilePath = Join-Path $repoRoot "version.json"

function Get-AppVersionFromFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Missing version file: $Path"
    }

    $raw = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    $value = [string]$raw.appVersion
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "version.json appVersion is empty"
    }

    return $value.Trim()
}

if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = Get-AppVersionFromFile -Path $versionFilePath
}

$ldflags = "-X plotkitycat/internal/version.appVersion=$Version"

Write-Host "Building PlotKityCat with version $Version"
wails build -clean -ldflags $ldflags
