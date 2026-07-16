param(
    [string]$Version = "",
    [switch]$IncludeScripts,
    [switch]$RequireScreeningZoom
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
        (Join-Path $RepoRoot "resources/screeningzoom/zoomit.exe")
    )

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return $candidate
        }
    }

    return ""
}

function Resolve-BuiltExecutablePath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot
    )

    $candidates = @(
        (Join-Path $RepoRoot "build/bin/GeometryStudio.exe"),
        (Join-Path $RepoRoot "build/bin/PlotKityCat.exe")
    )

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return $candidate
        }
    }

    $joined = $candidates -join [Environment]::NewLine
    throw "Missing built executable. Expected one of:`n$joined"
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

function Get-SevenZipArchivePaths {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SevenZipExe,
        [Parameter(Mandatory = $true)]
        [string]$ArchivePath
    )

    $output = & $SevenZipExe l -slt $ArchivePath
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to inspect archive with 7-Zip: $ArchivePath"
    }

    $paths = New-Object System.Collections.Generic.List[string]
    foreach ($line in $output) {
        if (-not $line.StartsWith("Path = ")) {
            continue
        }

        $pathValue = $line.Substring("Path = ".Length).Trim()
        if ([string]::IsNullOrWhiteSpace($pathValue)) {
            continue
        }
        if ([System.IO.Path]::GetFullPath($pathValue) -eq [System.IO.Path]::GetFullPath($ArchivePath)) {
            continue
        }

        $paths.Add($pathValue.Replace("/", "\"))
    }

    return $paths
}

function Assert-PortableRuntimeArchive {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ArchivePath,
        [Parameter(Mandatory = $true)]
        [string]$SevenZipExe
    )

    $entries = @(Get-SevenZipArchivePaths -SevenZipExe $SevenZipExe -ArchivePath $ArchivePath)
    if (-not ($entries -contains "python.exe")) {
        throw "Runtime archive is not portable: missing root python.exe. Rebuild it with tools/prepare-geometry-runtime.ps1 -RuntimeKind portable -Recreate -CreateArchive."
    }

    $hasStdlibZip = $false
    foreach ($entry in $entries) {
        if ($entry -match "^python\d+\.zip$") {
            $hasStdlibZip = $true
            break
        }
    }
    if (-not $hasStdlibZip) {
        throw "Runtime archive is not portable: missing pythonXY.zip standard library."
    }

    if ($entries -contains "pyvenv.cfg") {
        throw "Runtime archive contains pyvenv.cfg and may depend on the build machine Python. Rebuild with -RuntimeKind portable -Recreate -CreateArchive."
    }
}

function Write-PortableReadme {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ReleaseRoot
    )

    $content = @"
Geometry Studio 便携版分发包

运行方式：
1. 先把整个 zip 解压到一个可写目录，例如桌面或 D:\Apps\GeometryStudio。
2. 双击运行 GeometryStudio.exe。
3. 首次启动时，程序会自动把 resources/runtime/runtime.7z 解压到 runtime/ 目录。

便携分发必须保留这些文件：
- GeometryStudio.exe
- resources/runtime/runtime.7z
- resources/runtime/7zip/7za.exe
- resources/runtime/7zip/7za.dll

注意事项：
- 不要在 zip 压缩包内部直接运行 GeometryStudio.exe，必须先完整解压。
- 不要只单独拷贝 GeometryStudio.exe，必须连同 resources/ 目录一起分发。
- 本包不需要安装 Go、Node.js、Wails、npm，也不依赖系统 Python。
- Windows 仍然需要 Microsoft Edge WebView2 Runtime；多数 Windows 10/11 已自带。
- AI 功能需要可访问网络，并正确填写 AI 模型服务商的 URL、KEY、MODEL。
- 拍照/上传图片解题需要使用支持图片输入的多模态模型；纯文本模型只能处理文字题干。
- 如果出现 `write |1: The pipe has been ended.`，表示几何解题子进程已经提前退出，常见原因是包没有完整解压、resources/runtime 缺失、AI 配置错误、模型服务返回错误，或当前模型不支持本次输入。
"@

    [System.IO.File]::WriteAllText(
        (Join-Path $ReleaseRoot "README-PORTABLE.txt"),
        $content,
        [System.Text.UTF8Encoding]::new($false)
    )
}

if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = Get-AppVersionFromFile -Path $versionFilePath
}

$releaseName = "GeometryStudio-v$Version"
$releaseRoot = Join-Path $repoRoot "build/release/$releaseName"
$releaseZip = "$releaseRoot.zip"
$binExe = Resolve-BuiltExecutablePath -RepoRoot $repoRoot
$runtimeArchive = Join-Path $repoRoot "resources/runtime/runtime.7z"
$runtime7ZipDir = Join-Path $repoRoot "tools/7zip/extra/x64"
$screeningZoomExe = Resolve-ScreeningZoomExecutablePath -RepoRoot $repoRoot
$scriptsDir = Join-Path $repoRoot "Scripts"

if (-not (Test-Path $runtimeArchive)) {
    throw "Missing runtime archive: $runtimeArchive"
}

if (-not (Test-Path (Join-Path $runtime7ZipDir "7za.exe"))) {
    throw "Missing runtime extractor: $(Join-Path $runtime7ZipDir '7za.exe')"
}

if (-not (Test-Path (Join-Path $runtime7ZipDir "7za.dll"))) {
    throw "Missing runtime extractor DLL: $(Join-Path $runtime7ZipDir '7za.dll')"
}

Assert-PortableRuntimeArchive `
    -ArchivePath $runtimeArchive `
    -SevenZipExe (Join-Path $runtime7ZipDir "7za.exe")

if (Test-Path $releaseRoot) {
    Remove-Item -LiteralPath $releaseRoot -Recurse -Force
}

if (Test-Path $releaseZip) {
    Remove-Item -LiteralPath $releaseZip -Force
}

New-Item -ItemType Directory -Path (Join-Path $releaseRoot "resources/runtime") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $releaseRoot "resources/runtime/7zip") -Force | Out-Null
Copy-Item -LiteralPath $binExe -Destination (Join-Path $releaseRoot "GeometryStudio.exe") -Force
Copy-Item -LiteralPath $runtimeArchive -Destination (Join-Path $releaseRoot "resources/runtime/runtime.7z") -Force
Copy-Item -LiteralPath (Join-Path $runtime7ZipDir "7za.exe") -Destination (Join-Path $releaseRoot "resources/runtime/7zip/7za.exe") -Force
Copy-Item -LiteralPath (Join-Path $runtime7ZipDir "7za.dll") -Destination (Join-Path $releaseRoot "resources/runtime/7zip/7za.dll") -Force

if (-not [string]::IsNullOrWhiteSpace($screeningZoomExe)) {
    New-Item -ItemType Directory -Path (Join-Path $releaseRoot "resources/screeningzoom") -Force | Out-Null
    Copy-Item -LiteralPath $screeningZoomExe -Destination (Join-Path $releaseRoot "resources/screeningzoom/zoomit.exe") -Force
} elseif ($RequireScreeningZoom.IsPresent) {
    throw "Missing screening zoom executable. Re-run without -RequireScreeningZoom to package without it."
} else {
    Write-Warning "Missing screening zoom executable; packaging without resources/screeningzoom/zoomit.exe."
}

if ($IncludeScripts -and (Test-Path $scriptsDir)) {
    Copy-Item -LiteralPath $scriptsDir -Destination (Join-Path $releaseRoot "Scripts") -Recurse -Force
}

Write-PortableReadme -ReleaseRoot $releaseRoot

Compress-Archive -LiteralPath $releaseRoot -DestinationPath $releaseZip -CompressionLevel Optimal

$releaseZipHash = (Get-FileHash -LiteralPath $releaseZip -Algorithm SHA256).Hash.ToLowerInvariant()
$checksumPath = "$releaseZip.sha256"
[System.IO.File]::WriteAllText(
    $checksumPath,
    "$releaseZipHash  $(Split-Path -Leaf $releaseZip)`n",
    [System.Text.UTF8Encoding]::new($false)
)

Write-Host "Packaged release:"
Write-Host "  Directory: $releaseRoot"
Write-Host "  Zip:       $releaseZip"
Write-Host "  SHA256:    $releaseZipHash"
Write-Host "  Checksum:  $checksumPath"
