$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$electronRuntime = Join-Path $projectRoot "node_modules\electron\dist"
$outputRoot = Join-Path $projectRoot "desktop-build"
$appName = -join ([char[]](0x59B9, 0x59B9, 0x966A, 0x4F34))
$target = Join-Path $outputRoot $appName

if (-not (Test-Path (Join-Path $electronRuntime "electron.exe"))) {
  throw "Local Electron runtime was not found. Run npm ci first."
}

$resolvedOutputRoot = [System.IO.Path]::GetFullPath($outputRoot)
$resolvedTarget = [System.IO.Path]::GetFullPath($target)
if (-not $resolvedTarget.StartsWith($resolvedOutputRoot + [System.IO.Path]::DirectorySeparatorChar)) {
  throw "Desktop build target is outside the expected output directory."
}

if (Test-Path -LiteralPath $target) {
  Remove-Item -LiteralPath $target -Recurse -Force
}

New-Item -ItemType Directory -Path $target | Out-Null
Copy-Item -Path (Join-Path $electronRuntime "*") -Destination $target -Recurse -Force

$defaultExecutable = Join-Path $target "electron.exe"
$appExecutable = Join-Path $target ($appName + ".exe")
Move-Item -LiteralPath $defaultExecutable -Destination $appExecutable -Force

$appRoot = Join-Path $target "resources\app"
New-Item -ItemType Directory -Path $appRoot | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot "package.json") -Destination $appRoot
Copy-Item -LiteralPath (Join-Path $projectRoot "dist") -Destination $appRoot -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot "electron") -Destination $appRoot -Recurse

Write-Host "Desktop folder build created: $appExecutable"
