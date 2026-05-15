[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$SourceRuntimeDir,

    [string]$VersionFile = "runtime.version.json",

    [string]$OutputZip = "resources/runtime/runtime.zip",

    [switch]$CleanExistingRuntime
)

$ErrorActionPreference = "Stop"

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
Copy-Item -LiteralPath (Join-Path $sourceRuntimeDir "*") -Destination $stagingDir -Recurse -Force
Copy-Item -LiteralPath $versionFilePath -Destination (Join-Path $stagingDir "runtime.version.json") -Force

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
