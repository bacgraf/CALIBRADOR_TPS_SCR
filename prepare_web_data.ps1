[CmdletBinding()]
param(
    [string]$ProjectRoot = $PSScriptRoot,
    [switch]$UseExistingData,
    [switch]$ValidateOnly
)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $ProjectRoot).ProviderPath).TrimEnd('\')

function Assert-ChildPath([string]$Path) {
    $absolute = [System.IO.Path]::GetFullPath($Path)
    if (!(Split-Path -Parent $absolute).Equals($root, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Destino fora do diretório do projeto: $absolute"
    }
    if ((Test-Path -LiteralPath $absolute) -and
        ((Get-Item -LiteralPath $absolute -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw "Não é permitido substituir um link de diretório: $absolute"
    }
    return $absolute
}

function Assert-WebFiles([string]$Directory) {
    $index = Join-Path $Directory 'index.html'
    if (!(Test-Path -LiteralPath $index -PathType Leaf)) { throw "index.html ausente em $Directory" }
    $items = @(Get-Item -LiteralPath $Directory -Force) + @(Get-ChildItem -LiteralPath $Directory -Recurse -Force)
    foreach ($item in $items) {
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Link não permitido: $($item.FullName)" }
    }
    $html = Get-Content -Raw -Encoding UTF8 -LiteralPath $index
    foreach ($match in [regex]::Matches($html, '(?:src|href)\s*=\s*["'']([^"'']+)["'']')) {
        $reference = $match.Groups[1].Value
        if ($reference -match '^(?:https?:|data:|#|//)') { continue }
        $relative = ($reference -split '[?#]')[0].TrimStart('/')
        $asset = [IO.Path]::GetFullPath((Join-Path $Directory $relative))
        if (!$asset.StartsWith($Directory.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase) -or
            !(Test-Path -LiteralPath $asset -PathType Leaf)) { throw "Asset inválido ou ausente: $reference" }
    }
}

$data = Assert-ChildPath (Join-Path $root 'data')
$source = if ($UseExistingData) { $data } else { Join-Path $root 'WEB\dist' }
Assert-WebFiles $source
if ($ValidateOnly -or $UseExistingData) {
    Write-Output "Arquivos web validados: $source"
    return
}

$suffix = [Guid]::NewGuid().ToString('N')
$staging = Assert-ChildPath (Join-Path $root ('.data-staging-' + $suffix))
$backup = Assert-ChildPath (Join-Path $root ('.data-backup-' + $suffix))
$hadData = Test-Path -LiteralPath $data
New-Item -ItemType Directory -Path $staging | Out-Null
try {
    foreach ($file in Get-ChildItem -LiteralPath $source -File -Recurse -Force) {
        $relative = $file.FullName.Substring($source.Length).TrimStart('\')
        $target = Join-Path $staging $relative
        New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
        Copy-Item -LiteralPath $file.FullName -Destination $target -ErrorAction Stop
        if ((Get-FileHash -LiteralPath $file.FullName).Hash -ne (Get-FileHash -LiteralPath $target).Hash) {
            throw "Cópia divergente: $relative"
        }
    }
    Assert-WebFiles $staging
    # Revalidar os caminhos imediatamente antes de cada troca de diretório.
    $data = Assert-ChildPath $data
    $backup = Assert-ChildPath $backup
    $staging = Assert-ChildPath $staging
    if ($hadData) { Move-Item -LiteralPath $data -Destination $backup -ErrorAction Stop }
    try { Move-Item -LiteralPath $staging -Destination $data -ErrorAction Stop }
    catch {
        if ($hadData -and !(Test-Path -LiteralPath $data)) {
            Move-Item -LiteralPath (Assert-ChildPath $backup) -Destination (Assert-ChildPath $data) -ErrorAction Stop
        }
        throw
    }
    Write-Output "Pasta data preparada e verificada."
    if ($hadData) { Write-Output "Versão anterior preservada em: $backup" }
} catch {
    Write-Warning "Preparação interrompida. Pasta temporária preservada para diagnóstico: $staging"
    throw
}
