[CmdletBinding()]
param(
    [string]$PythonExe = "",

    [string]$RuntimeDir = "runtime",

    [string]$IndexUrl = "",

    [string]$ExtraIndexUrl = "",

    [switch]$Recreate,

    [switch]$SkipInstall,

    [switch]$CreateArchive,

    [switch]$TrimArchiveForRelease,

    [string]$VersionFile = "runtime.version.json",

    [string]$OutputArchive = "resources/runtime/runtime.7z"
)

$ErrorActionPreference = "Stop"

$repoRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))

function Resolve-InRepositoryPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PathValue
    )

    if ([System.IO.Path]::IsPathRooted($PathValue)) {
        return [System.IO.Path]::GetFullPath($PathValue)
    }

    return [System.IO.Path]::GetFullPath((Join-Path $repoRoot $PathValue))
}

function Assert-SafeRuntimeDirectory {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PathValue
    )

    $fullPath = [System.IO.Path]::GetFullPath($PathValue).TrimEnd('\', '/')
    $rootPath = [System.IO.Path]::GetFullPath($repoRoot).TrimEnd('\', '/')
    $comparison = [System.StringComparison]::OrdinalIgnoreCase

    if (-not ($fullPath.Equals($rootPath, $comparison) -or $fullPath.StartsWith($rootPath + [System.IO.Path]::DirectorySeparatorChar, $comparison))) {
        throw "RuntimeDir must be inside the repository: $fullPath"
    }

    $leafName = [System.IO.Path]::GetFileName($fullPath)
    if ($leafName -ne "runtime") {
        throw "RuntimeDir must resolve to a directory named runtime: $fullPath"
    }
}

function Resolve-HostPython {
    param(
        [string]$RequestedPython
    )

    if (-not [string]::IsNullOrWhiteSpace($RequestedPython)) {
        if (Test-Path -LiteralPath $RequestedPython -PathType Leaf) {
            return [System.IO.Path]::GetFullPath($RequestedPython)
        }

        $requestedCommand = Get-Command $RequestedPython -ErrorAction SilentlyContinue
        if ($null -ne $requestedCommand) {
            return $requestedCommand.Source
        }

        throw "Python executable not found: $RequestedPython"
    }

    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if ($null -ne $pythonCommand) {
        return $pythonCommand.Source
    }

    $pyLauncher = Get-Command py -ErrorAction SilentlyContinue
    if ($null -ne $pyLauncher) {
        $resolved = & $pyLauncher.Source -3 -c "import sys; print(sys.executable)"
        if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($resolved)) {
            return $resolved.Trim()
        }
    }

    throw "No host Python was found. Install Python 3.12+ or pass -PythonExe."
}

function Resolve-RuntimePython {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RuntimeRoot
    )

    $candidates = @(
        "Scripts/python.exe",
        "python.exe",
        "bin/python.exe",
        "bin/python"
    )

    foreach ($candidate in $candidates) {
        $path = Join-Path $RuntimeRoot $candidate
        if (Test-Path -LiteralPath $path -PathType Leaf) {
            return [System.IO.Path]::GetFullPath($path)
        }
    }

    throw "Runtime Python was not found under $RuntimeRoot"
}

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    Write-Host ">" $FilePath ($Arguments -join " ")
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code $LASTEXITCODE"
    }
}

function Invoke-Pip {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RuntimePython,
        [Parameter(Mandatory = $true)]
        [string[]]$PipArguments
    )

    $arguments = @("-m", "pip") + $PipArguments
    if (-not [string]::IsNullOrWhiteSpace($IndexUrl)) {
        $arguments += @("-i", $IndexUrl)
    }
    if (-not [string]::IsNullOrWhiteSpace($ExtraIndexUrl)) {
        $arguments += @("--extra-index-url", $ExtraIndexUrl)
    }

    Invoke-CheckedCommand -FilePath $RuntimePython -Arguments $arguments
}

function Test-GeometryRuntimeImports {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RuntimePython
    )

    $script = @'
import importlib
import sys

modules = [
    ("numpy", "NumPy"),
    ("matplotlib", "Matplotlib"),
    ("scipy", "SciPy"),
    ("PyQt5", "PyQt5"),
    ("sympy", "SymPy"),
    ("PIL", "Pillow"),
    ("pydantic", "Pydantic"),
    ("openai", "OpenAI"),
    ("langchain", "LangChain"),
    ("langchain_openai", "LangChain OpenAI"),
    ("langgraph", "LangGraph"),
    ("pypdf", "pypdf"),
]

failed = []
for module_name, label in modules:
    try:
        module = importlib.import_module(module_name)
        version = getattr(module, "__version__", "unknown")
        print(f"{label}: ok ({version})")
    except Exception as exc:
        failed.append(f"{label}: {exc}")

if failed:
    print("Import check failed:", file=sys.stderr)
    for item in failed:
        print("  " + item, file=sys.stderr)
    raise SystemExit(1)
'@

    $tempScript = Join-Path ([System.IO.Path]::GetTempPath()) ("geometry-runtime-imports-" + [System.Guid]::NewGuid().ToString("N") + ".py")
    try {
        Set-Content -LiteralPath $tempScript -Value $script -Encoding UTF8
        Invoke-CheckedCommand -FilePath $RuntimePython -Arguments @($tempScript)
    }
    finally {
        if (Test-Path -LiteralPath $tempScript) {
            Remove-Item -LiteralPath $tempScript -Force
        }
    }
}

$runtimePath = Resolve-InRepositoryPath -PathValue $RuntimeDir
$versionFilePath = Resolve-InRepositoryPath -PathValue $VersionFile
$archivePath = Resolve-InRepositoryPath -PathValue $OutputArchive

Assert-SafeRuntimeDirectory -PathValue $runtimePath

if ($Recreate.IsPresent -and (Test-Path -LiteralPath $runtimePath)) {
    Write-Host "Removing existing runtime:" $runtimePath
    Remove-Item -LiteralPath $runtimePath -Recurse -Force
}

if (-not (Test-Path -LiteralPath $runtimePath -PathType Container)) {
    $hostPython = Resolve-HostPython -RequestedPython $PythonExe
    Write-Host "Creating runtime venv with:" $hostPython
    Invoke-CheckedCommand -FilePath $hostPython -Arguments @("-m", "venv", $runtimePath)
}

$runtimePython = Resolve-RuntimePython -RuntimeRoot $runtimePath
Write-Host "Runtime Python:" $runtimePython
Invoke-CheckedCommand -FilePath $runtimePython -Arguments @("--version")

if (-not $SkipInstall.IsPresent) {
    Invoke-Pip -RuntimePython $runtimePython -PipArguments @("install", "--upgrade", "pip", "setuptools", "wheel")

    $packages = @(
        "numpy",
        "matplotlib",
        "scipy",
        "PyQt5",
        "sympy",
        "Pillow",
        "pydantic",
        "openai",
        "langchain",
        "langchain-openai",
        "langgraph",
        "pypdf"
    )

    Invoke-Pip -RuntimePython $runtimePython -PipArguments (@("install", "--upgrade") + $packages)
}

if (Test-Path -LiteralPath $versionFilePath -PathType Leaf) {
    Copy-Item -LiteralPath $versionFilePath -Destination (Join-Path $runtimePath "runtime.version.json") -Force
}

Test-GeometryRuntimeImports -RuntimePython $runtimePython

if ($CreateArchive.IsPresent) {
    $prepareRuntimeScript = Join-Path $PSScriptRoot "prepare-runtime.ps1"
    $archiveArguments = @(
        "-SourceRuntimeDir", $runtimePath,
        "-VersionFile", $versionFilePath,
        "-OutputArchive", $archivePath
    )
    if ($TrimArchiveForRelease.IsPresent) {
        $archiveArguments += @(
            "-TrimQtForRelease",
            "-TrimUnusedPythonPackagesForRelease",
            "-TrimOptionalScientificPackagesForRelease",
            "-TrimQtOptionalUiForRelease",
            "-TrimPythonRuntimeClutterForRelease"
        )
    }

    Invoke-CheckedCommand -FilePath "powershell" -Arguments (@("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $prepareRuntimeScript) + $archiveArguments)
}

Write-Host "Geometry Studio runtime is ready:" $runtimePath
