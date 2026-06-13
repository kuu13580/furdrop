$ports = @(4000, 9000) # Webアプリで使うポートを配列で指定
$RuleName = "WSL2 Firewall"
$wsl2Address = (wsl -e hostname -I).Trim() -split ' ' | Select-Object -First 1

New-NetFireWallRule -DisplayName $RuleName -Direction Inbound -LocalPort $ports -Action Allow -Protocol TCP

for ($i = 0; $i -lt $ports.length; $i++) {
  $port = $ports[$i]
  netsh interface portproxy add v4tov4 listenport=$port listenaddress=* connectport=$port connectaddress=$wsl2Address
}