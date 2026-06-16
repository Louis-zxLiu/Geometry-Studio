param(
  [Parameter(Mandatory = $true)]
  [string]$BuiltHelperPath,
  [string]$TargetName = "screeningzoom-helper.exe"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent (Split-Path -Parent $scriptDir)

$binDir = Join-Path $repoRoot "thirdparty\screeningzoom\bin"
$resourceDir = Join-Path $repoRoot "resources\screeningzoom"

if (-not (Test-Path $BuiltHelperPath)) {
  throw "Built helper not found: $BuiltHelperPath"
}

New-Item -ItemType Directory -Force -Path $binDir | Out-Null
New-Item -ItemType Directory -Force -Path $resourceDir | Out-Null

$binTarget = Join-Path $binDir $TargetName
$resourceTarget = Join-Path $resourceDir $TargetName

Copy-Item -LiteralPath $BuiltHelperPath -Destination $binTarget -Force
Copy-Item -LiteralPath $BuiltHelperPath -Destination $resourceTarget -Force

$builtPdbPath = [System.IO.Path]::ChangeExtension($BuiltHelperPath, ".pdb")
if (Test-Path $builtPdbPath) {
  $pdbName = [System.IO.Path]::ChangeExtension($TargetName, ".pdb")
  Copy-Item -LiteralPath $builtPdbPath -Destination (Join-Path $binDir $pdbName) -Force
  Copy-Item -LiteralPath $builtPdbPath -Destination (Join-Path $resourceDir $pdbName) -Force
}

Write-Output "Published helper to:"
Write-Output "  $binTarget"
Write-Output "  $resourceTarget"
