param(
    [Parameter(Mandatory = $true)]
    [string]$Version,
    [string]$BaseURL = "https://update.5051001.xyz/plotkitycat/releases"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$sourceExe = Join-Path $repoRoot "build/bin/PlotKityCat.exe"
$outputDir = Join-Path $repoRoot "build/update/$Version"
$targetName = "PlotKityCat-$Version-windows-amd64.exe"
$targetExe = Join-Path $outputDir $targetName
$manifestPath = Join-Path $outputDir "manifest.json"

if (-not (Test-Path $sourceExe)) {
    throw "Missing built executable: $sourceExe"
}

if (Test-Path $outputDir) {
    Remove-Item -LiteralPath $outputDir -Recurse -Force
}

New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
Copy-Item -LiteralPath $sourceExe -Destination $targetExe -Force

$hash = (Get-FileHash -LiteralPath $targetExe -Algorithm SHA256).Hash.ToLowerInvariant()
$publishedAt = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")

$manifest = [ordered]@{
    version = $Version
    notes = ""
    publishedAt = $publishedAt
    windows = [ordered]@{
        url = ($BaseURL.TrimEnd('/') + "/" + $targetName)
        sha256 = $hash
    }
}

$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

Write-Host "Prepared update artifacts:"
Write-Host "  EXE:      $targetExe"
Write-Host "  Manifest: $manifestPath"
Write-Host "  SHA256:   $hash"
