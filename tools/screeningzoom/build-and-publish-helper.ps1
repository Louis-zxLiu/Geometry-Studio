param(
  [ValidateSet("Debug", "Release")]
  [string]$Configuration = "Release",
  [string]$Platform = "x64"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent (Split-Path -Parent $scriptDir)

$buildScript = Join-Path $scriptDir "build-helper.ps1"
$publishScript = Join-Path $scriptDir "publish-helper.ps1"
$builtHelperPath = Join-Path $repoRoot "thirdparty\screeningzoom\helper\build\$Platform\$Configuration\screeningzoom-helper.exe"

& $buildScript -Configuration $Configuration -Platform $Platform
& $publishScript -BuiltHelperPath $builtHelperPath

Write-Output "Build and publish completed:"
Write-Output "  $builtHelperPath"
