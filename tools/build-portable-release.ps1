param(
    [string]$Version = "",

    [ValidateSet("download", "embed", "browser", "error")]
    [string]$WebView2Strategy = "embed",

    [switch]$RefreshRuntimeArchive,

    [switch]$RecreateRuntime,

    [switch]$SkipRuntimeInstall,

    [switch]$TrimRuntimeArchive,

    [switch]$RequireScreeningZoom,

    [switch]$IncludeScripts,

    [switch]$NoScripts
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$versionFilePath = Join-Path $repoRoot "version.json"
$runtimeArchive = Join-Path $repoRoot "resources/runtime/runtime.7z"

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

function Invoke-CheckedScript {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ScriptPath,

        [string[]]$Arguments = @()
    )

    Write-Host ""
    Write-Host ">" "powershell" "-NoProfile" "-ExecutionPolicy" "Bypass" "-File" $ScriptPath ($Arguments -join " ")
    & powershell -NoProfile -ExecutionPolicy Bypass -File $ScriptPath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code $LASTEXITCODE"
    }
}

if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = Get-AppVersionFromFile -Path $versionFilePath
}

$prepareRuntime = $RefreshRuntimeArchive.IsPresent -or
    $RecreateRuntime.IsPresent -or
    -not (Test-Path -LiteralPath $runtimeArchive -PathType Leaf)

if ($prepareRuntime) {
    $prepareArgs = @("-CreateArchive")
    if ($RecreateRuntime.IsPresent) {
        $prepareArgs += "-Recreate"
    }
    if ($SkipRuntimeInstall.IsPresent) {
        $prepareArgs += "-SkipInstall"
    }
    if ($TrimRuntimeArchive.IsPresent) {
        $prepareArgs += "-TrimArchiveForRelease"
    }

    Invoke-CheckedScript -ScriptPath (Join-Path $PSScriptRoot "prepare-geometry-runtime.ps1") -Arguments $prepareArgs
} else {
    Write-Host "Using existing runtime archive: $runtimeArchive"
}

Invoke-CheckedScript `
    -ScriptPath (Join-Path $PSScriptRoot "build-versioned-app.ps1") `
    -Arguments @("-Version", $Version, "-WebView2Strategy", $WebView2Strategy)

$packageArgs = @("-Version", $Version)
if ($IncludeScripts.IsPresent -and $NoScripts.IsPresent) {
    throw "Use either -IncludeScripts or -NoScripts, not both."
}
if ($IncludeScripts.IsPresent) {
    $packageArgs += "-IncludeScripts"
}
if ($RequireScreeningZoom.IsPresent) {
    $packageArgs += "-RequireScreeningZoom"
}

Invoke-CheckedScript -ScriptPath (Join-Path $PSScriptRoot "package-release.ps1") -Arguments $packageArgs

$releaseZip = Join-Path $repoRoot "build/release/GeometryStudio-v$Version.zip"
Write-Host ""
Write-Host "Portable release is ready:"
Write-Host "  $releaseZip"
Write-Host ""
Write-Host "Upload the zip, not just GeometryStudio.exe, to GitHub Releases."
