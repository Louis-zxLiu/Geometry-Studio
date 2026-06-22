param(
    [string]$Version = "",
    [switch]$IncludeScripts = $true
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$versionFilePath = Join-Path $repoRoot "version.json"

function Resolve-ScreeningZoomExecutablePath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot
    )

    $candidates = @(
        (Join-Path $RepoRoot "resources/screeningzoom/zoomit.exe"),
        (Join-Path $RepoRoot "thirdparty/screeningzoom/build/Release/zoomit.exe"),
        (Join-Path $RepoRoot "thirdparty/screeningzoom/build/zoomit.exe")
    )

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return $candidate
        }
    }

    $joined = $candidates -join [Environment]::NewLine
    throw "Missing screening zoom executable. Expected one of:`n$joined"
}

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

$releaseName = "PlotKityCat-v$Version"
$releaseRoot = Join-Path $repoRoot "build/release/$releaseName"
$releaseZip = "$releaseRoot.zip"
$binExe = Join-Path $repoRoot "build/bin/PlotKityCat.exe"
$runtimeArchive = Join-Path $repoRoot "resources/runtime/runtime.7z"
$runtime7ZipDir = Join-Path $repoRoot "tools/7zip/extra/x64"
$screeningZoomExe = Resolve-ScreeningZoomExecutablePath -RepoRoot $repoRoot
$scriptsDir = Join-Path $repoRoot "Scripts"

if (-not (Test-Path $binExe)) {
    throw "Missing built executable: $binExe"
}

if (-not (Test-Path $runtimeArchive)) {
    throw "Missing runtime archive: $runtimeArchive"
}

if (-not (Test-Path (Join-Path $runtime7ZipDir "7za.exe"))) {
    throw "Missing runtime extractor: $(Join-Path $runtime7ZipDir '7za.exe')"
}

if (-not (Test-Path (Join-Path $runtime7ZipDir "7za.dll"))) {
    throw "Missing runtime extractor DLL: $(Join-Path $runtime7ZipDir '7za.dll')"
}

if (Test-Path $releaseRoot) {
    Remove-Item -LiteralPath $releaseRoot -Recurse -Force
}

if (Test-Path $releaseZip) {
    Remove-Item -LiteralPath $releaseZip -Force
}

New-Item -ItemType Directory -Path (Join-Path $releaseRoot "resources/runtime") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $releaseRoot "resources/runtime/7zip") -Force | Out-Null
Copy-Item -LiteralPath $binExe -Destination (Join-Path $releaseRoot "PlotKityCat.exe") -Force
Copy-Item -LiteralPath $runtimeArchive -Destination (Join-Path $releaseRoot "resources/runtime/runtime.7z") -Force
Copy-Item -LiteralPath (Join-Path $runtime7ZipDir "7za.exe") -Destination (Join-Path $releaseRoot "resources/runtime/7zip/7za.exe") -Force
Copy-Item -LiteralPath (Join-Path $runtime7ZipDir "7za.dll") -Destination (Join-Path $releaseRoot "resources/runtime/7zip/7za.dll") -Force

New-Item -ItemType Directory -Path (Join-Path $releaseRoot "resources/screeningzoom") -Force | Out-Null
Copy-Item -LiteralPath $screeningZoomExe -Destination (Join-Path $releaseRoot "resources/screeningzoom/zoomit.exe") -Force

if ($IncludeScripts -and (Test-Path $scriptsDir)) {
    Copy-Item -LiteralPath $scriptsDir -Destination (Join-Path $releaseRoot "Scripts") -Recurse -Force
}

Compress-Archive -LiteralPath $releaseRoot -DestinationPath $releaseZip -CompressionLevel Optimal

Write-Host "Packaged release:"
Write-Host "  Directory: $releaseRoot"
Write-Host "  Zip:       $releaseZip"
