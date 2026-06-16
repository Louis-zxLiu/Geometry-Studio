param(
  [string]$UpstreamRoot = "D:\projects\ZoomIt",
  [string]$DestinationRoot = "D:\projects\plotkitycat\thirdparty\screeningzoom\upstream"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent (Split-Path -Parent $scriptDir)
$manifestPath = Join-Path $repoRoot "thirdparty\screeningzoom\upstream-files.txt"

if (-not (Test-Path $UpstreamRoot)) {
  throw "Upstream root not found: $UpstreamRoot"
}

if (-not (Test-Path $manifestPath)) {
  throw "Manifest not found: $manifestPath"
}

New-Item -ItemType Directory -Force -Path $DestinationRoot | Out-Null

$files = Get-Content $manifestPath | Where-Object {
  $trimmed = $_.Trim()
  $trimmed -and -not $trimmed.StartsWith("#")
}

foreach ($relativePath in $files) {
  $sourcePath = Join-Path $UpstreamRoot $relativePath
  if (-not (Test-Path $sourcePath)) {
    throw "Missing upstream file: $sourcePath"
  }

  $targetPath = Join-Path $DestinationRoot $relativePath
  $targetDir = Split-Path -Parent $targetPath
  New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
  Copy-Item -LiteralPath $sourcePath -Destination $targetPath -Force
}

Write-Output "Synced $($files.Count) files to $DestinationRoot"
