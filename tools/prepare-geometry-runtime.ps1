[CmdletBinding()]
param(
    [string]$PythonExe = "",

    [ValidateSet("portable", "venv")]
    [string]$RuntimeKind = "portable",

    [string]$PythonVersion = "3.12.8",

    [string]$PythonEmbedUrl = "",

    [string]$PipBootstrapUrl = "https://bootstrap.pypa.io/get-pip.py",

    [string]$DownloadCacheDir = ".tools_py",

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

function Save-UriIfMissing {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Uri,
        [Parameter(Mandatory = $true)]
        [string]$DestinationPath
    )

    if (Test-Path -LiteralPath $DestinationPath -PathType Leaf) {
        Write-Host "Using cached download:" $DestinationPath
        return
    }

    $destinationDir = Split-Path -Parent $DestinationPath
    if (-not (Test-Path -LiteralPath $destinationDir -PathType Container)) {
        New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
    }

    Write-Host "Downloading:" $Uri
    Write-Host "       to:" $DestinationPath
    Invoke-WebRequest -Uri $Uri -OutFile $DestinationPath
}

function Get-DefaultPythonEmbedUrl {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Version
    )

    return "https://www.python.org/ftp/python/$Version/python-$Version-embed-amd64.zip"
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
        "python.exe",
        "Scripts/python.exe",
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

function Resolve-EmbeddedPythonPthFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RuntimeRoot,
        [Parameter(Mandatory = $true)]
        [string]$Version
    )

    $versionParts = $Version.Split(".")
    if ($versionParts.Count -ge 2) {
        $candidateName = "python{0}{1}._pth" -f $versionParts[0], $versionParts[1]
        $candidatePath = Join-Path $RuntimeRoot $candidateName
        if (Test-Path -LiteralPath $candidatePath -PathType Leaf) {
            return $candidatePath
        }
    }

    $matches = @(Get-ChildItem -LiteralPath $RuntimeRoot -Filter "python*._pth" -File -ErrorAction SilentlyContinue)
    if ($matches.Count -gt 0) {
        return $matches[0].FullName
    }

    if ($versionParts.Count -ge 2) {
        return (Join-Path $RuntimeRoot ("python{0}{1}._pth" -f $versionParts[0], $versionParts[1]))
    }

    return (Join-Path $RuntimeRoot "python._pth")
}

function Add-UniqueLine {
    param(
        [System.Collections.Generic.List[string]]$Lines,
        [Parameter(Mandatory = $true)]
        [string]$Line
    )

    foreach ($existing in $Lines) {
        if ($existing -eq $Line) {
            return
        }
    }
    $Lines.Add($Line)
}

function Enable-PortablePythonSitePackages {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RuntimeRoot,
        [Parameter(Mandatory = $true)]
        [string]$Version
    )

    $sitePackagesDir = Join-Path $RuntimeRoot "Lib/site-packages"
    if (-not (Test-Path -LiteralPath $sitePackagesDir -PathType Container)) {
        New-Item -ItemType Directory -Path $sitePackagesDir -Force | Out-Null
    }

    $pthFile = Resolve-EmbeddedPythonPthFile -RuntimeRoot $RuntimeRoot -Version $Version
    $lines = [System.Collections.Generic.List[string]]::new()
    if (Test-Path -LiteralPath $pthFile -PathType Leaf) {
        foreach ($line in Get-Content -LiteralPath $pthFile) {
            $trimmed = $line.Trim()
            if ([string]::IsNullOrWhiteSpace($trimmed)) {
                continue
            }
            if ($trimmed.StartsWith("#")) {
                continue
            }
            if ($trimmed -eq "import site") {
                continue
            }
            Add-UniqueLine -Lines $lines -Line $trimmed
        }
    }

    $zipName = "python$($Version.Split('.')[0])$($Version.Split('.')[1]).zip"
    if (Test-Path -LiteralPath (Join-Path $RuntimeRoot $zipName) -PathType Leaf) {
        Add-UniqueLine -Lines $lines -Line $zipName
    }
    Add-UniqueLine -Lines $lines -Line "."
    Add-UniqueLine -Lines $lines -Line "Lib/site-packages"

    Set-Content -LiteralPath $pthFile -Value $lines -Encoding ASCII
    Write-Host "Configured portable Python path file:" $pthFile
}

function New-PortableRuntime {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RuntimeRoot
    )

    $effectiveEmbedUrl = $PythonEmbedUrl
    if ([string]::IsNullOrWhiteSpace($effectiveEmbedUrl)) {
        $effectiveEmbedUrl = Get-DefaultPythonEmbedUrl -Version $PythonVersion
    }

    $cacheRoot = Resolve-InRepositoryPath -PathValue $DownloadCacheDir
    $embedZip = Join-Path $cacheRoot ("python-$PythonVersion-embed-amd64.zip")
    Save-UriIfMissing -Uri $effectiveEmbedUrl -DestinationPath $embedZip

    if (-not (Test-Path -LiteralPath $RuntimeRoot -PathType Container)) {
        New-Item -ItemType Directory -Path $RuntimeRoot -Force | Out-Null
    }

    Expand-Archive -LiteralPath $embedZip -DestinationPath $RuntimeRoot -Force
    Enable-PortablePythonSitePackages -RuntimeRoot $RuntimeRoot -Version $PythonVersion
}

function Test-PortableRuntimeLayout {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RuntimeRoot
    )

    return (Test-Path -LiteralPath (Join-Path $RuntimeRoot "python.exe") -PathType Leaf) -and
        (-not (Test-Path -LiteralPath (Join-Path $RuntimeRoot "pyvenv.cfg") -PathType Leaf))
}

function Ensure-Pip {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RuntimePython
    )

    & $RuntimePython -m pip --version | Out-Host
    if ($LASTEXITCODE -eq 0) {
        return
    }

    $cacheRoot = Resolve-InRepositoryPath -PathValue $DownloadCacheDir
    $getPipPath = Join-Path $cacheRoot "get-pip.py"
    Save-UriIfMissing -Uri $PipBootstrapUrl -DestinationPath $getPipPath
    Invoke-CheckedCommand -FilePath $RuntimePython -Arguments @($getPipPath, "--no-warn-script-location")
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
    if ($RuntimeKind -eq "portable") {
        Write-Host "Creating portable Python runtime:" $runtimePath
        New-PortableRuntime -RuntimeRoot $runtimePath
    } else {
        $hostPython = Resolve-HostPython -RequestedPython $PythonExe
        Write-Host "Creating runtime venv with:" $hostPython
        Invoke-CheckedCommand -FilePath $hostPython -Arguments @("-m", "venv", $runtimePath)
    }
} elseif ($RuntimeKind -eq "portable") {
    if (-not (Test-PortableRuntimeLayout -RuntimeRoot $runtimePath)) {
        throw "Existing runtime is not portable. Re-run with -Recreate to replace it: $runtimePath"
    }
    Enable-PortablePythonSitePackages -RuntimeRoot $runtimePath -Version $PythonVersion
}

$runtimePython = Resolve-RuntimePython -RuntimeRoot $runtimePath
Write-Host "Runtime Python:" $runtimePython
Invoke-CheckedCommand -FilePath $runtimePython -Arguments @("--version")

if (-not $SkipInstall.IsPresent) {
    Ensure-Pip -RuntimePython $runtimePython
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
