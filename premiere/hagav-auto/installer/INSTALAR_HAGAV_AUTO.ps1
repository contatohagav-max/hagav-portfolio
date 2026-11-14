# Instala o painel HAGAV AUTO no Premiere Pro (usuario atual). Feche o Premiere antes.
$ErrorActionPreference = 'Stop'
$src  = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $env:APPDATA 'Adobe\CEP\extensions\com.hagav.auto'
if (Get-Process -Name 'Adobe Premiere Pro' -ErrorAction SilentlyContinue) { Write-Host 'Feche o Premiere Pro e rode de novo.' -ForegroundColor Yellow; exit 1 }
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
New-Item -ItemType Directory -Path $dest -Force | Out-Null
Copy-Item (Join-Path $src 'panel\*') $dest -Recurse -Force
Copy-Item (Join-Path $src 'core') $dest -Recurse -Force
# Painel nao assinado: habilita o modo de depuracao do CEP (o mesmo ajuste ja usado pelos outros paineis HAGAV).
9..13 | ForEach-Object {
  $key = "HKCU:\Software\Adobe\CSXS.$_"
  if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
  Set-ItemProperty -Path $key -Name 'PlayerDebugMode' -Value '1' -Type String
}
Write-Host "HAGAV AUTO instalado em $dest" -ForegroundColor Green
Write-Host 'Abra o Premiere: Janela > Extensoes > HAGAV AUTO'
