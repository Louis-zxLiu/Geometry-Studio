[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$SourceRuntimeDir,

    [string]$VersionFile = "runtime.version.json",

    [string]$OutputZip = "resources/runtime/runtime.zip",

    [switch]$CleanExistingRuntime
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

function Resolve-InWorkspacePath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PathValue
    )

    if ([System.IO.Path]::IsPathRooted($PathValue)) {
        return [System.IO.Path]::GetFullPath($PathValue)
    }

    return [System.IO.Path]::GetFullPath((Join-Path -Path (Get-Location) -ChildPath $PathValue))
}

function Get-RuntimeMetadata {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}

function Get-PythonAbiTag {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PythonVersion
    )

    $trimmed = $PythonVersion.Trim()
    if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed -eq "pending") {
        throw "runtime.version.json pythonVersion must be a real version before packaging"
    }

    $match = [regex]::Match($trimmed, '^(?<major>\d+)\.(?<minor>\d+)')
    if (-not $match.Success) {
        throw "Unsupported pythonVersion format: $PythonVersion"
    }

    return "$($match.Groups['major'].Value)$($match.Groups['minor'].Value)"
}

function Add-MatplotlibSurfaceFastpathToRuntime {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RuntimeRoot,
        [Parameter(Mandatory = $true)]
        [string]$VersionFilePath,
        [Parameter(Mandatory = $true)]
        [string]$RepositoryRoot
    )

    $metadata = Get-RuntimeMetadata -Path $VersionFilePath
    $abiTag = Get-PythonAbiTag -PythonVersion ([string]$metadata.pythonVersion)

    $thirdpartyRoot = Join-Path $RepositoryRoot "thirdparty/matplotlib_surface_fastpath"
    $packageSourceRoot = Join-Path $thirdpartyRoot "src/mpl_surface_fastpath"
    $packageTargetRoot = Join-Path $RuntimeRoot "Lib/site-packages/mpl_surface_fastpath"
    $dllSourceRoot = Join-Path $thirdpartyRoot "vendor/win-amd64"
    $dllTargetRoot = Join-Path $RuntimeRoot "DLLs"
    $pythonExtension = "_surface_fastpath.cp$abiTag-win_amd64.pyd"

    if (-not (Test-Path -LiteralPath $packageSourceRoot -PathType Container)) {
        throw "Surface fastpath package source not found: $packageSourceRoot"
    }

    if (-not (Test-Path -LiteralPath $dllSourceRoot -PathType Container)) {
        throw "Surface fastpath runtime DLL directory not found: $dllSourceRoot"
    }

    $packageFiles = @(
        "__init__.py",
        "_backend.py",
        "adapter.py",
        "install.py",
        $pythonExtension
    )

    if (Test-Path -LiteralPath $packageTargetRoot) {
        Remove-Item -LiteralPath $packageTargetRoot -Recurse -Force
    }

    New-Item -ItemType Directory -Path $packageTargetRoot -Force | Out-Null
    New-Item -ItemType Directory -Path $dllTargetRoot -Force | Out-Null

    foreach ($fileName in $packageFiles) {
        $sourcePath = Join-Path $packageSourceRoot $fileName
        if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
            throw "Surface fastpath file not found: $sourcePath"
        }

        Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $packageTargetRoot $fileName) -Force
    }

    foreach ($dllName in @("libgomp-1.dll", "libstdc++-6.dll", "libgcc_s_seh-1.dll")) {
        $sourcePath = Join-Path $dllSourceRoot $dllName
        if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
            throw "Surface fastpath DLL not found: $sourcePath"
        }

        Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $dllTargetRoot $dllName) -Force
        Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $packageTargetRoot $dllName) -Force
    }
}

$sourceRuntimeDir = Resolve-InWorkspacePath -PathValue $SourceRuntimeDir
$versionFilePath = Resolve-InWorkspacePath -PathValue $VersionFile
$outputZipPath = Resolve-InWorkspacePath -PathValue $OutputZip
$runtimeDirPath = Resolve-InWorkspacePath -PathValue "runtime"
$tempRoot = Resolve-InWorkspacePath -PathValue ".runtime-pack"
$stagingDir = Join-Path -Path $tempRoot -ChildPath "runtime"

if (-not (Test-Path -LiteralPath $sourceRuntimeDir -PathType Container)) {
    throw "Source runtime directory not found: $sourceRuntimeDir"
}

if (-not (Test-Path -LiteralPath $versionFilePath -PathType Leaf)) {
    throw "runtime.version.json not found: $versionFilePath"
}

if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $stagingDir | Out-Null
Get-ChildItem -LiteralPath $sourceRuntimeDir -Force | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $stagingDir -Recurse -Force
}
Copy-Item -LiteralPath $versionFilePath -Destination (Join-Path $stagingDir "runtime.version.json") -Force
Add-MatplotlibSurfaceFastpathToRuntime -RuntimeRoot $stagingDir -VersionFilePath $versionFilePath -RepositoryRoot $repoRoot

if (Test-Path -LiteralPath $outputZipPath) {
    Remove-Item -LiteralPath $outputZipPath -Force
}

Compress-Archive -Path (Join-Path $stagingDir "*") -DestinationPath $outputZipPath -CompressionLevel Optimal

if ($CleanExistingRuntime.IsPresent -and (Test-Path -LiteralPath $runtimeDirPath)) {
    Remove-Item -LiteralPath $runtimeDirPath -Recurse -Force
}

Write-Host "Prepared runtime archive:" $outputZipPath
Write-Host "Staged from:" $sourceRuntimeDir
Write-Host "Version file:" $versionFilePath
