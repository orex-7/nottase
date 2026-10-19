try {
  & (Join-Path $PSScriptRoot 'fix-accents2.ps1')
} catch {
  Write-Output ('ERR: ' + $_.Exception.Message)
  Write-Output $_.ScriptStackTrace
}