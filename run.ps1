param(
 [ValidateSet('install','uninstall','diagnose','status','recover')][string]$Action = 'status',
 [string]$AppDir = '',
 [switch]$AllowUntested,
 [switch]$Elevated
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$env:NODE_OPTIONS = '--max-old-space-size=4096'
$logDir = Join-Path $PSScriptRoot 'reports'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$log = Join-Path $logDir 'last-operation.log'
try {
 $portableNode = Join-Path $PSScriptRoot 'runtime\node.exe'
 $node = if (Test-Path -LiteralPath $portableNode) { [pscustomobject]@{Source=$portableNode} } else { Get-Command node.exe -ErrorAction SilentlyContinue }
 if (-not $node) { throw 'Нужен Node.js 20 или новее. Установите Node.js LTS с https://nodejs.org и повторите запуск.' }
 $major = [int]((& $node.Source -p 'process.versions.node.split(String.fromCharCode(46))[0]') | Select-Object -Last 1)
 if ($major -lt 20) { throw 'Нужен Node.js версии 20 или новее.' }
 $arguments = @((Join-Path $PSScriptRoot 'nimbalyst-ru.cjs'), $Action)
 if ($AppDir) { $arguments += @('--app-dir',$AppDir) }
 if ($AllowUntested) { $arguments += '--allow-untested' }
 $ErrorActionPreference = 'Continue'
 $output = & $node.Source @arguments 2>&1
 $result = $LASTEXITCODE
 $ErrorActionPreference = 'Stop'
 $output | ForEach-Object { $_.ToString() } | Out-File -LiteralPath $log -Encoding UTF8
 $output | ForEach-Object { Write-Host $_.ToString() }
 if ($result -ne 0 -and -not $Elevated -and $Action -in @('install','uninstall','recover')) {
  $logText = Get-Content -LiteralPath $log -Raw -Encoding UTF8
  if ($logText -match 'EPERM|EACCES|access.*denied|permission denied') {
   Write-Host 'Каталог приложения защищён Windows. Сейчас появится запрос прав администратора для установки русификатора.'
   if ($PSScriptRoot.Contains('"') -or $AppDir.Contains('"')) { throw 'Недопустимые кавычки в пути.' }
   $argsText = '-NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '" -Action ' + $Action + ' -Elevated'
   if ($AppDir) { $argsText += ' -AppDir "' + $AppDir + '"' }
   if ($AllowUntested) { $argsText += ' -AllowUntested' }
   $child = Start-Process -FilePath 'powershell.exe' -ArgumentList $argsText -Verb RunAs -WindowStyle Hidden -Wait -PassThru
   Get-Content -LiteralPath $log -Encoding UTF8
   exit $child.ExitCode
  }
 }
 exit $result
} catch {
 $_.Exception.Message | Out-File -LiteralPath $log -Append -Encoding UTF8
 Write-Host ('ОШИБКА: ' + $_.Exception.Message)
 exit 1
}
