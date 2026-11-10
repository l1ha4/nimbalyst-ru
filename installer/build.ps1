param([string]$NodeArchive = '')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$version = (Get-Content (Join-Path $root 'mod.json') -Raw | ConvertFrom-Json).version
$nodeVersion = '24.22.2'
$nodeHash = 'ca1bff5d8ead13c9f2ea404a176db46bd430704d5b5113734049fa365e7799e2'
$build = Join-Path $root ('build\' + [guid]::NewGuid().ToString('N'))
$dist = Join-Path $root 'dist'
$payload = Join-Path $build 'payload'
New-Item -ItemType Directory -Force $build,$dist,$payload | Out-Null
if (-not $NodeArchive) {
    $NodeArchive = Join-Path $build "node-v$nodeVersion-win-x64.zip"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest "https://nodejs.org/dist/v$nodeVersion/node-v$nodeVersion-win-x64.zip" -OutFile $NodeArchive -UseBasicParsing
}
if ((Get-FileHash -LiteralPath $NodeArchive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $nodeHash) { throw 'Node.js archive SHA-256 mismatch' }
Expand-Archive -LiteralPath $NodeArchive -DestinationPath (Join-Path $build 'node')
$nodeRoot = Join-Path $build "node\node-v$nodeVersion-win-x64"
$nodeExe = Join-Path $nodeRoot 'node.exe'
$signature = Get-AuthenticodeSignature $nodeExe
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=OpenJS Foundation') { throw 'Invalid Node.js Authenticode signature' }

# Explicit allowlist: never include reports, backups, local profiles or app binaries.
$files = @('Install.cmd','Install-After-Update.cmd','Uninstall.cmd','Diagnose.cmd','Recover.cmd','run.ps1','nimbalyst-ru.cjs','mod.json','README.md','README.en.md','VALIDATION.md','LICENSE','CHANGELOG.md')
$dirs = @('lib','locales','vendor','tests')
foreach ($file in $files) { Copy-Item -LiteralPath (Join-Path $root $file) -Destination $payload }
foreach ($dir in $dirs) { Copy-Item -LiteralPath (Join-Path $root $dir) -Destination $payload -Recurse }
New-Item -ItemType Directory (Join-Path $payload 'runtime') | Out-Null
Copy-Item -LiteralPath $nodeExe -Destination (Join-Path $payload 'runtime\node.exe')
Copy-Item -LiteralPath (Join-Path $nodeRoot 'LICENSE') -Destination (Join-Path $payload 'runtime\NODE-LICENSE')
$zip = Join-Path $build 'payload.zip'
Compress-Archive -Path (Join-Path $payload '*') -DestinationPath $zip -CompressionLevel Optimal
$exe = Join-Path $dist "Nimbalyst-RU-Setup-$version.exe"
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $compiler /nologo /target:winexe /platform:x64 /optimize+ /utf8output "/out:$exe" "/resource:$zip,payload.zip" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll (Join-Path $PSScriptRoot 'Setup.cs')
if ($LASTEXITCODE -ne 0) { throw 'C# compilation failed' }
$portable = Join-Path $dist "Nimbalyst-RU-$version-source.zip"
$source = Join-Path $build 'Nimbalyst-RU'
New-Item -ItemType Directory $source | Out-Null
foreach ($file in $files) { Copy-Item -LiteralPath (Join-Path $root $file) -Destination $source }
foreach ($dir in ($dirs + @('installer'))) { Copy-Item -LiteralPath (Join-Path $root $dir) -Destination $source -Recurse }
Compress-Archive -LiteralPath $source -DestinationPath $portable -CompressionLevel Optimal -Force
$sums = @($exe,$portable) | ForEach-Object { '{0}  {1}' -f (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant(),(Split-Path $_ -Leaf) }
$sums | Set-Content -LiteralPath (Join-Path $dist 'SHA256SUMS.txt') -Encoding ASCII
Write-Host "Built: $exe"
Write-Host "Node.js $nodeVersion; official archive SHA-256: $nodeHash"
