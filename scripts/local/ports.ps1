$ErrorActionPreference = 'Stop'
Write-Output 'RelayOps TCP listeners (32000-32099):'
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -ge 32000 -and $_.LocalPort -le 32099 } |
  Select-Object LocalAddress, LocalPort, OwningProcess
netsh interface ipv4 show excludedportrange protocol=tcp
netsh interface ipv6 show excludedportrange protocol=tcp
