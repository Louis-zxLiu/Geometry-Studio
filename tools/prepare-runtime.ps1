[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$SourceRuntimeDir,

    [string]$VersionFile = "runtime.version.json",

    [string]$OutputArchive = "resources/runtime/runtime.7z",

    [switch]$CleanExistingRuntime,

    [switch]$TrimQtForRelease,

    [switch]$TrimUnusedPythonPackagesForRelease,

    [switch]$TrimOptionalScientificPackagesForRelease,

    [switch]$TrimAIPythonPackagesForRelease,

    [switch]$TrimQtOptionalUiForRelease,

    [switch]$TrimPythonPackagingToolsForRelease,

    [switch]$TrimPythonRuntimeClutterForRelease,

    [switch]$TrimSuspiciousPythonPackagesForRelease
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

function Remove-PathsIfPresent {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RuntimeRoot,
        [Parameter(Mandatory = $true)]
        [string[]]$RelativePaths
    )

    foreach ($relativePath in $RelativePaths) {
        $targetPath = Join-Path $RuntimeRoot $relativePath
        if (Test-Path -LiteralPath $targetPath) {
            Remove-Item -LiteralPath $targetPath -Recurse -Force
        }
    }
}

function Remove-FilesExceptAllowed {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootPath,
        [Parameter(Mandatory = $true)]
        [string[]]$AllowedNames
    )

    if (-not (Test-Path -LiteralPath $RootPath -PathType Container)) {
        return
    }

    Get-ChildItem -LiteralPath $RootPath -Force | ForEach-Object {
        if ($AllowedNames -contains $_.Name) {
            return
        }

        Remove-Item -LiteralPath $_.FullName -Recurse -Force
    }
}

function Remove-DirectoriesByName {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootPath,
        [Parameter(Mandatory = $true)]
        [string[]]$DirectoryNames,
        [string[]]$PreserveRelativePaths = @()
    )

    if (-not (Test-Path -LiteralPath $RootPath -PathType Container)) {
        return
    }

    $rootFullPath = [System.IO.Path]::GetFullPath($RootPath).TrimEnd('\', '/')
    $preserveFullPaths = @(
        foreach ($relativePath in $PreserveRelativePaths) {
            [System.IO.Path]::GetFullPath((Join-Path $RootPath $relativePath)).TrimEnd('\', '/')
        }
    )

    Get-ChildItem -LiteralPath $RootPath -Recurse -Directory -Force -ErrorAction SilentlyContinue |
        Where-Object { $DirectoryNames -contains $_.Name } |
        Where-Object {
            $candidate = [System.IO.Path]::GetFullPath($_.FullName).TrimEnd('\', '/')
            -not ($preserveFullPaths -contains $candidate)
        } |
        Sort-Object FullName -Descending |
        ForEach-Object {
            if (Test-Path -LiteralPath $_.FullName) {
                Remove-Item -LiteralPath $_.FullName -Recurse -Force
            }
        }
}

function Trim-QtRuntimeForRelease {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RuntimeRoot
    )

    $qtRoot = Join-Path $RuntimeRoot "Lib/site-packages/PyQt5/Qt5"
    if (-not (Test-Path -LiteralPath $qtRoot -PathType Container)) {
        return
    }

    $firstTier = @(
        "Lib/site-packages/PyQt5/Qt5/bin/Qt5WebEngineCore.dll",
        "Lib/site-packages/PyQt5/Qt5/resources/icudtl.dat",
        "Lib/site-packages/PyQt5/Qt5/resources/qtwebengine_resources.pak",
        "Lib/site-packages/PyQt5/Qt5/resources/qtwebengine_devtools_resources.pak",
        "Lib/site-packages/PyQt5/Qt5/resources/qtwebengine_resources_100p.pak",
        "Lib/site-packages/PyQt5/Qt5/resources/qtwebengine_resources_200p.pak",
        "Lib/site-packages/PyQt5/Qt5/translations/qtwebengine_locales"
    )

    $secondTier = @(
        "Lib/site-packages/PyQt5/Qt5/bin/Qt5Designer.dll",
        "Lib/site-packages/PyQt5/Qt5/bin/Qt5XmlPatterns.dll",
        "Lib/site-packages/PyQt5/Qt5/bin/Qt5Location.dll",
        "Lib/site-packages/PyQt5/Qt5/bin/Qt5Multimedia.dll",
        "Lib/site-packages/PyQt5/Qt5/plugins/platforms/qminimal.dll",
        "Lib/site-packages/PyQt5/Qt5/plugins/platforms/qoffscreen.dll",
        "Lib/site-packages/PyQt5/Qt5/plugins/assetimporters",
        "Lib/site-packages/PyQt5/Qt5/plugins/renderers",
        "Lib/site-packages/PyQt5/Qt5/plugins/sqldrivers"
    )

    Remove-PathsIfPresent -RuntimeRoot $RuntimeRoot -RelativePaths ($firstTier + $secondTier)
}

function Trim-UnusedPythonPackagesForRelease {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RuntimeRoot
    )

    $firstBatch = @(
        "Lib/site-packages/IPython",
        "Lib/site-packages/ipython-9.8.0.dist-info",
        "Lib/site-packages/ipython_genutils",
        "Lib/site-packages/ipython_genutils-0.2.0.dist-info",
        "Lib/site-packages/ipython_pygments_lexers.py",
        "Lib/site-packages/ipython_pygments_lexers-1.1.1.dist-info",
        "Lib/site-packages/jupyter.py",
        "Lib/site-packages/jupyter-1.1.1.dist-info",
        "Lib/site-packages/jupyter_bokeh",
        "Lib/site-packages/jupyter_bokeh-4.0.5.dist-info",
        "Lib/site-packages/jupyter_client",
        "Lib/site-packages/jupyter_console",
        "Lib/site-packages/jupyter_core",
        "Lib/site-packages/jupyter_events",
        "Lib/site-packages/jupyter_leaflet",
        "Lib/site-packages/jupyter_leaflet-0.20.0.dist-info",
        "Lib/site-packages/jupyter_lsp",
        "Lib/site-packages/jupyter_server",
        "Lib/site-packages/jupyter_server_terminals",
        "Lib/site-packages/jupyterlab",
        "Lib/site-packages/jupyterlab_pygments",
        "Lib/site-packages/jupyterlab_pygments-0.3.0.dist-info",
        "Lib/site-packages/jupyterlab_server",
        "Lib/site-packages/jupyterlab_widgets",
        "Lib/site-packages/jupyterlab_widgets-3.0.15.dist-info",
        "Lib/site-packages/notebook",
        "Lib/site-packages/notebook-7.5.1.dist-info",
        "Lib/site-packages/notebook_shim",
        "Lib/site-packages/notebook_shim-0.2.4.dist-info",
        "Lib/site-packages/nbclient",
        "Lib/site-packages/nbclient-0.10.2.dist-info",
        "Lib/site-packages/nbconvert",
        "Lib/site-packages/nbconvert-7.16.6.dist-info",
        "Lib/site-packages/nbformat",
        "Lib/site-packages/nbformat-5.10.4.dist-info",
        "Lib/site-packages/black",
        "Lib/site-packages/black-25.11.0.dist-info",
        "Lib/site-packages/blackd",
        "Lib/site-packages/_black_version.py",
        "Lib/site-packages/_black_version.pyi",
        "Lib/site-packages/isort",
        "Lib/site-packages/isort-6.0.1.dist-info",
        "Lib/site-packages/pylint",
        "Lib/site-packages/pylint-4.0.4.dist-info",
        "Lib/site-packages/pylint_venv.py",
        "Lib/site-packages/pylint_venv-3.0.4.dist-info",
        "Lib/site-packages/astroid",
        "Lib/site-packages/astroid-4.0.2.dist-info",
        "Lib/site-packages/datasette",
        "Lib/site-packages/datasette-0.65.2.dist-info",
        "Lib/site-packages/datasette_graphql",
        "Lib/site-packages/datasette_graphql-2.2.dist-info",
        "Lib/site-packages/plotpy",
        "Lib/site-packages/plotpy-2.8.2.dist-info",
        "Lib/site-packages/pyqtgraph",
        "Lib/site-packages/pyqtgraph-0.14.0.dist-info",
        "Lib/site-packages/pythonwin",
        "Lib/site-packages/PyWin32.chm",
        "Lib/site-packages/qdarkstyle",
        "Lib/site-packages/QDarkStyle-3.2.3.dist-info",
        "Lib/site-packages/qtpy",
        "Lib/site-packages/QtPy-2.4.3.dist-info"
    )

    Remove-PathsIfPresent -RuntimeRoot $RuntimeRoot -RelativePaths $firstBatch
}

function Trim-OptionalScientificPackagesForRelease {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RuntimeRoot
    )

    $secondBatch = @(
        "Lib/site-packages/_cvxcore.cp313-win_amd64.pyd",
        "Lib/site-packages/_cvxpy_sparsecholesky.cp313-win_amd64.pyd",
        "Lib/site-packages/clarabel",
        "Lib/site-packages/clarabel-0.11.1.dist-info",
        "Lib/site-packages/cvxpy",
        "Lib/site-packages/cvxpy-1.7.1.dist-info",
        "Lib/site-packages/networkx",
        "Lib/site-packages/networkx-3.6.1.dist-info",
        "Lib/site-packages/osqp",
        "Lib/site-packages/osqp-0.6.7.post3.dist-info",
        "Lib/site-packages/osqppurepy",
        "Lib/site-packages/qdldl-0.1.7.post5.dist-info",
        "Lib/site-packages/qdldl.cp313-win_amd64.pyd",
        "Lib/site-packages/scs",
        "Lib/site-packages/scs-3.2.9.dist-info",
        "Lib/site-packages/scs.libs",
        "Lib/site-packages/seaborn",
        "Lib/site-packages/seaborn-0.13.2.dist-info",
        "Lib/site-packages/xarray",
        "Lib/site-packages/xarray-2025.11.0.dist-info"
    )

    Remove-PathsIfPresent -RuntimeRoot $RuntimeRoot -RelativePaths $secondBatch
}

function Trim-AIPythonPackagesForRelease {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RuntimeRoot
    )

    $aiBatch = @(
        "Lib/site-packages/anthropic",
        "Lib/site-packages/anthropic-0.75.0.dist-info",
        "Lib/site-packages/cohere",
        "Lib/site-packages/cohere-5.20.0.dist-info",
        "Lib/site-packages/foundry_local",
        "Lib/site-packages/foundry_local_sdk-0.5.1.dist-info",
        "Lib/site-packages/genai_prices",
        "Lib/site-packages/genai_prices-0.0.38.dist-info",
        "Lib/site-packages/google",
        "Lib/site-packages/google_auth-2.43.0.dist-info",
        "Lib/site-packages/google_genai-1.55.0.dist-info",
        "Lib/site-packages/groq",
        "Lib/site-packages/groq-0.37.1.dist-info",
        "Lib/site-packages/huggingface_hub",
        "Lib/site-packages/huggingface_hub-1.2.3.dist-info",
        "Lib/site-packages/langchain",
        "Lib/site-packages/langchain-1.1.3.dist-info",
        "Lib/site-packages/langchain_core",
        "Lib/site-packages/langchain_core-1.2.0.dist-info",
        "Lib/site-packages/langgraph",
        "Lib/site-packages/langgraph-1.0.5.dist-info",
        "Lib/site-packages/langgraph_checkpoint-3.0.0.dist-info",
        "Lib/site-packages/langgraph_prebuilt",
        "Lib/site-packages/langgraph_prebuilt-1.0.5.dist-info",
        "Lib/site-packages/langgraph_sdk",
        "Lib/site-packages/langgraph_sdk-0.3.0.dist-info",
        "Lib/site-packages/langsmith",
        "Lib/site-packages/langsmith-0.4.59.dist-info",
        "Lib/site-packages/mistralai",
        "Lib/site-packages/mistralai-1.9.11.dist-info",
        "Lib/site-packages/mistralai_azure",
        "Lib/site-packages/mistralai_gcp",
        "Lib/site-packages/tiktoken",
        "Lib/site-packages/tiktoken-0.12.0.dist-info",
        "Lib/site-packages/tiktoken_ext"
    )

    Remove-PathsIfPresent -RuntimeRoot $RuntimeRoot -RelativePaths $aiBatch
}

function Trim-QtOptionalUiForRelease {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RuntimeRoot
    )

    $qtRoot = Join-Path $RuntimeRoot "Lib/site-packages/PyQt5/Qt5"
    if (-not (Test-Path -LiteralPath $qtRoot -PathType Container)) {
        return
    }

    $optionalUiPaths = @(
        "Lib/site-packages/PyQt5/Qt5/qml",
        "Lib/site-packages/PyQt5/Qt5/plugins/audio",
        "Lib/site-packages/PyQt5/Qt5/plugins/bearer",
        "Lib/site-packages/PyQt5/Qt5/plugins/geometryloaders",
        "Lib/site-packages/PyQt5/Qt5/plugins/geoservices",
        "Lib/site-packages/PyQt5/Qt5/plugins/mediaservice",
        "Lib/site-packages/PyQt5/Qt5/plugins/playlistformats",
        "Lib/site-packages/PyQt5/Qt5/plugins/position",
        "Lib/site-packages/PyQt5/Qt5/plugins/sceneparsers",
        "Lib/site-packages/PyQt5/Qt5/plugins/sensors",
        "Lib/site-packages/PyQt5/Qt5/plugins/sensorgestures",
        "Lib/site-packages/PyQt5/Qt5/plugins/texttospeech",
        "Lib/site-packages/PyQt5/Qt5/plugins/webview"
    )

    Remove-PathsIfPresent -RuntimeRoot $RuntimeRoot -RelativePaths $optionalUiPaths

    $translationRoot = Join-Path $qtRoot "translations"
    Remove-FilesExceptAllowed -RootPath $translationRoot -AllowedNames @(
        "qt_zh_CN.qm",
        "qt_help_zh_CN.qm"
    )
}

function Trim-PythonPackagingToolsForRelease {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RuntimeRoot
    )

    $packagingTools = @(
        "Lib/site-packages/pip",
        "Lib/site-packages/pip-25.3.dist-info",
        "Lib/site-packages/setuptools",
        "Lib/site-packages/setuptools-80.9.0.dist-info",
        "Lib/site-packages/wheel",
        "Lib/site-packages/wheel-0.45.1.dist-info",
        "Lib/site-packages/pkg_resources",
        "Lib/site-packages/distutils-precedence.pth"
    )

    Remove-PathsIfPresent -RuntimeRoot $RuntimeRoot -RelativePaths $packagingTools
}

function Trim-PythonRuntimeClutterForRelease {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RuntimeRoot
    )

    Remove-DirectoriesByName -RootPath $RuntimeRoot -DirectoryNames @(
        "__pycache__",
        "test",
        "tests",
        "testing",
        "example",
        "examples",
        "doc",
        "docs"
    ) -PreserveRelativePaths @(
        "Lib/site-packages/numpy/testing"
    )

    Remove-PathsIfPresent -RuntimeRoot $RuntimeRoot -RelativePaths @(
        "Lib/site-packages/PyQt5/Qt5/qsci"
    )
}

function Trim-SuspiciousPythonPackagesForRelease {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RuntimeRoot
    )

    $suspiciousPackages = @(
        "Lib/site-packages/ipympl",
        "Lib/site-packages/ipympl-0.9.8.dist-info",
        "Lib/site-packages/pydantic_ai",
        "Lib/site-packages/pydantic_ai-1.22.0.dist-info",
        "Lib/site-packages/github",
        "Lib/site-packages/PyGithub-2.8.1.dist-info",
        "Lib/site-packages/cryptography",
        "Lib/site-packages/cryptography-46.0.3.dist-info",
        "Lib/site-packages/lxml",
        "Lib/site-packages/lxml-6.0.2.dist-info"
    )

    Remove-PathsIfPresent -RuntimeRoot $RuntimeRoot -RelativePaths $suspiciousPackages
}

function Get-Runtime7ZipExecutablePath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepositoryRoot
    )

    $candidates = @(
        (Join-Path $RepositoryRoot "tools/7zip/extra/x64/7za.exe"),
        (Join-Path $RepositoryRoot "tools/7zip/7za.exe")
    )

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return $candidate
        }
    }

    throw "7-Zip CLI not found. Expected tools/7zip/extra/x64/7za.exe"
}

function New-7ZipRuntimeArchive {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepositoryRoot,
        [Parameter(Mandatory = $true)]
        [string]$SourceDirectory,
        [Parameter(Mandatory = $true)]
        [string]$ArchivePath
    )

    $sevenZipExe = Get-Runtime7ZipExecutablePath -RepositoryRoot $RepositoryRoot
    $workingDirectory = Split-Path -Parent $SourceDirectory
    $sourcePattern = (Join-Path $SourceDirectory "*")

    & $sevenZipExe a -t7z $ArchivePath $sourcePattern -mx=9 -m0=lzma2 -md=128m -mfb=273 -ms=on -mmt=on
    if ($LASTEXITCODE -ne 0) {
        throw "7-Zip failed while creating runtime archive: exit code $LASTEXITCODE"
    }
}

$sourceRuntimeDir = Resolve-InWorkspacePath -PathValue $SourceRuntimeDir
$versionFilePath = Resolve-InWorkspacePath -PathValue $VersionFile
$outputArchivePath = Resolve-InWorkspacePath -PathValue $OutputArchive
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

if ($TrimQtForRelease.IsPresent) {
    Trim-QtRuntimeForRelease -RuntimeRoot $stagingDir
}

if ($TrimUnusedPythonPackagesForRelease.IsPresent) {
    Trim-UnusedPythonPackagesForRelease -RuntimeRoot $stagingDir
}

if ($TrimOptionalScientificPackagesForRelease.IsPresent) {
    Trim-OptionalScientificPackagesForRelease -RuntimeRoot $stagingDir
}

if ($TrimAIPythonPackagesForRelease.IsPresent) {
    Trim-AIPythonPackagesForRelease -RuntimeRoot $stagingDir
}

if ($TrimQtOptionalUiForRelease.IsPresent) {
    Trim-QtOptionalUiForRelease -RuntimeRoot $stagingDir
}

if ($TrimPythonPackagingToolsForRelease.IsPresent) {
    Trim-PythonPackagingToolsForRelease -RuntimeRoot $stagingDir
}

if ($TrimPythonRuntimeClutterForRelease.IsPresent) {
    Trim-PythonRuntimeClutterForRelease -RuntimeRoot $stagingDir
}

if ($TrimSuspiciousPythonPackagesForRelease.IsPresent) {
    Trim-SuspiciousPythonPackagesForRelease -RuntimeRoot $stagingDir
}

if (Test-Path -LiteralPath $outputArchivePath) {
    Remove-Item -LiteralPath $outputArchivePath -Force
}

New-7ZipRuntimeArchive -RepositoryRoot $repoRoot -SourceDirectory $stagingDir -ArchivePath $outputArchivePath

if ($CleanExistingRuntime.IsPresent -and (Test-Path -LiteralPath $runtimeDirPath)) {
    Remove-Item -LiteralPath $runtimeDirPath -Recurse -Force
}

Write-Host "Prepared runtime archive:" $outputArchivePath
Write-Host "Staged from:" $sourceRuntimeDir
Write-Host "Version file:" $versionFilePath
Write-Host "Trim Qt for release:" $TrimQtForRelease.IsPresent
Write-Host "Trim unused Python packages for release:" $TrimUnusedPythonPackagesForRelease.IsPresent
Write-Host "Trim optional scientific packages for release:" $TrimOptionalScientificPackagesForRelease.IsPresent
Write-Host "Trim AI Python packages for release:" $TrimAIPythonPackagesForRelease.IsPresent
Write-Host "Trim Qt optional UI for release:" $TrimQtOptionalUiForRelease.IsPresent
Write-Host "Trim Python packaging tools for release:" $TrimPythonPackagingToolsForRelease.IsPresent
Write-Host "Trim Python runtime clutter for release:" $TrimPythonRuntimeClutterForRelease.IsPresent
Write-Host "Trim suspicious Python packages for release:" $TrimSuspiciousPythonPackagesForRelease.IsPresent
