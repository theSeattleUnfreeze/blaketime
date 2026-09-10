param([Parameter(Mandatory=$true)][string]$Installer, [Parameter(Mandatory=$true)][string]$Binary)
$ErrorActionPreference = 'Stop'
foreach ($Path in @($Installer, $Binary)) {
  $Signature = Get-AuthenticodeSignature -LiteralPath $Path
  if ($Signature.Status -ne 'Valid') { throw 'Windows code signing verification failed' }
}
