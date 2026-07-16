param(
    [string]$Version = "",

    [ValidateSet("download", "embed", "browser", "error")]
    [string]$WebView2Strategy = "download"
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

Write-Host "Building Geometry Studio with version $Version"
Write-Host "WebView2 strategy: $WebView2Strategy"
wails build -clean -webview2 $WebView2Strategy -ldflags $ldflags
