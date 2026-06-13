$ports = @(4000, 9000) # Web アプリで使うポートを配列で指定
$RuleName = "WSL2 Firewall"
$wsl2Address = (wsl -e hostname -I).Trim() -split ' ' | Select-Object -First 1
if (-not $wsl2Address) {
  throw "WSL2 の IP 取得に失敗しました。WSL が起動しているか確認してください。"
}

# New-NetFirewallRule は毎回新規作成するため、同名ルールの重複を防ぐべく既存を削除してから追加する
Remove-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
New-NetFireWallRule -DisplayName $RuleName -Direction Inbound -LocalPort $ports -Action Allow -Protocol TCP

for ($i = 0; $i -lt $ports.length; $i++) {
  $port = $ports[$i]
  # WSL2 再起動で IP が変わるため、既存ルールを削除してから追加し直す (idempotent)
  netsh interface portproxy delete v4tov4 listenport=$port listenaddress=* | Out-Null
  netsh interface portproxy add v4tov4 listenport=$port listenaddress=* connectport=$port connectaddress=$wsl2Address
}
