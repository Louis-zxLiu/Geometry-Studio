[CmdletBinding()]
param(
    [switch]$SkipWailsBuild
)

$ErrorActionPreference = "Stop"
$repoRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [string]$WorkingDirectory = $repoRoot
    )

    Write-Host ">" $FilePath ($Arguments -join " ")
    Push-Location $WorkingDirectory
    try {
        & $FilePath @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "Command failed with exit code $LASTEXITCODE"
        }
    }
    finally {
        Pop-Location
    }
}

function Resolve-GoExe {
    $localGo = Join-Path $env:USERPROFILE ".cache\geometry-studio-go\go\bin\go.exe"
    if (Test-Path -LiteralPath $localGo -PathType Leaf) {
        return $localGo
    }
    $goCommand = Get-Command go -ErrorAction Stop
    return $goCommand.Source
}

function Add-ToolPath {
    param([Parameter(Mandatory = $true)][string]$PathValue)
    if (Test-Path -LiteralPath $PathValue -PathType Container) {
        $env:PATH = $PathValue + [System.IO.Path]::PathSeparator + $env:PATH
    }
}

$goExe = Resolve-GoExe
$goBin = Split-Path -Parent $goExe
Add-ToolPath -PathValue $goBin
Add-ToolPath -PathValue (Join-Path $env:USERPROFILE "go\bin")
$env:GOPROXY = "https://goproxy.cn,direct"
$env:PYTHONIOENCODING = "utf-8"

Invoke-CheckedCommand -FilePath "powershell" -Arguments @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    "tools\prepare-geometry-runtime.ps1",
    "-SkipInstall"
)

Invoke-CheckedCommand -FilePath "runtime\Scripts\python.exe" -Arguments @(
    "-m",
    "py_compile",
    "internal\bridge\geometry_agent.py"
)

$graphOutput = & "runtime\Scripts\python.exe" "internal\bridge\geometry_agent.py" "--describe-graph"
if ($LASTEXITCODE -ne 0) {
    throw "Geometry graph description failed"
}
$graph = $graphOutput | ConvertFrom-Json
if ($graph.nodes.Count -ne 10 -or -not ($graph.nodes -contains "self_correct") -or -not ($graph.nodes -contains "publish")) {
    throw "Geometry graph is incomplete: $graphOutput"
}
Write-Host "Geometry graph nodes:" ($graph.nodes -join ", ")

Invoke-CheckedCommand -FilePath "npm" -Arguments @("run", "build") -WorkingDirectory (Join-Path $repoRoot "frontend")
Invoke-CheckedCommand -FilePath $goExe -Arguments @("test", "./...")

$wails = Get-Command wails -ErrorAction SilentlyContinue
if ($null -eq $wails) {
    Invoke-CheckedCommand -FilePath $goExe -Arguments @(
        "install",
        "github.com/wailsapp/wails/v2/cmd/wails@v2.10.2"
    )
}

Invoke-CheckedCommand -FilePath "wails" -Arguments @(
    "generate",
    "module",
    "-compiler",
    $goExe
)

Invoke-CheckedCommand -FilePath $goExe -Arguments @(
    "build",
    "-o",
    "build\bin\GeometryStudio-dev.exe",
    "."
)

if (-not $SkipWailsBuild.IsPresent) {
    Invoke-CheckedCommand -FilePath "wails" -Arguments @(
        "build",
        "-debug",
        "-nopackage",
        "-skipbindings",
        "-nosyncgomod",
        "-webview2",
        "browser",
        "-o",
        "GeometryStudio-wails.exe"
    )
}

$exePath = Join-Path $repoRoot "build\bin\GeometryStudio-wails.exe"
if (-not (Test-Path -LiteralPath $exePath -PathType Leaf)) {
    $exePath = Join-Path $repoRoot "build\bin\GeometryStudio-dev.exe"
}

$existing = Get-Process -Name ([System.IO.Path]::GetFileNameWithoutExtension($exePath)) -ErrorAction SilentlyContinue
if ($existing) {
    $existing | Stop-Process -Force
    Start-Sleep -Seconds 1
}

$process = Start-Process -FilePath $exePath -WorkingDirectory (Split-Path -Parent $exePath) -PassThru
Start-Sleep -Seconds 8
$alive = Get-Process -Id $process.Id -ErrorAction SilentlyContinue
if (-not $alive -or -not $alive.Responding) {
    throw "Geometry Studio did not stay responsive during startup"
}
Write-Host "Startup OK:" $alive.MainWindowTitle
$alive | Stop-Process -Force

Write-Host "Geometry Studio verification complete."
