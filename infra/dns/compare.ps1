# Compares every record in remwa.tech.records.json across DNS servers (spec 0003).
#
#   Pre switch:  .\infra\dns\compare.ps1 -ZoneId Z09833751SWG47A0ZTLQL [-Only <name>] [-Baseline]
#     Checks value and TTL on the 4 Route 53 nameservers and on ns1bqx.name.com,
#     plus `aws route53 test-dns-answer`. -Baseline also saves the public answers
#     from 8.8.8.8 to baseline-pre-switch.json.
#   Post switch: .\infra\dns\compare.ps1 -ZoneId Z09833751SWG47A0ZTLQL -Against 8.8.8.8,1.1.1.1
#     Checks values (not TTLs) on public resolvers against the saved baseline.
#
# Exit code 1 on any mismatch. Needs the aft-admin AWS profile.
param(
  [Parameter(Mandatory = $true)][string]$ZoneId,
  [string]$Only,
  [switch]$Baseline,
  [string[]]$Against,
  [string]$Profile = "aft-admin",
  [string]$OldNameServer = "ns1bqx.name.com"
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$recordsPath = Join-Path $here "remwa.tech.records.json"
$baselinePath = Join-Path $here "baseline-pre-switch.json"

function Normalize([string]$Type, [string]$Value) {
  $v = $Value.Trim()
  if ($Type -eq "TXT") {
    # Joined pieces: "\"part1\" \"part2\"" or already unquoted.
    $pieces = [regex]::Matches($v, '"((?:[^"\\]|\\.)*)"') | ForEach-Object { $_.Groups[1].Value }
    if ($pieces) { $v = ($pieces -join "") }
    return $v
  }
  return $v.ToLowerInvariant().TrimEnd(".")
}

function Expected($Record) {
  $type = $Record.Type
  return @($Record.ResourceRecords | ForEach-Object { Normalize $type $_.Value }) | Sort-Object
}

function Query([string]$Name, [string]$Type, [string]$Server) {
  $answers = Resolve-DnsName -Name $Name -Type $Type -Server $Server -DnsOnly -NoHostsFile -QuickTimeout -ErrorAction SilentlyContinue |
    Where-Object { $_.Section -eq "Answer" -and $_.Type -eq $Type -and $_.Name.TrimEnd(".") -eq $Name.TrimEnd(".") }
  $values = foreach ($a in $answers) {
    switch ($Type) {
      "TXT"   { Normalize "TXT" (($a.Strings | ForEach-Object { '"' + $_ + '"' }) -join " ") }
      "MX"    { Normalize "MX" ("{0} {1}" -f $a.Preference, $a.NameExchange) }
      "CNAME" { Normalize "CNAME" $a.NameHost }
      default { Normalize $Type $a.IPAddress }
    }
  }
  $ttl = $null
  if ($answers) { $ttl = @($answers)[0].TTL }
  return @{ Values = @($values | Sort-Object); Ttl = $ttl }
}

function Same($A, $B) {
  return (@($A) -join "|") -eq (@($B) -join "|")
}

$records = (Get-Content $recordsPath -Raw | ConvertFrom-Json).Changes | ForEach-Object { $_.ResourceRecordSet }
if ($Only) { $records = $records | Where-Object { $_.Name.TrimEnd(".") -eq $Only.TrimEnd(".") } }
if (-not $records) { Write-Error "No record matches '$Only'."; exit 1 }

$failed = $false

if ($Against) {
  $saved = Get-Content $baselinePath -Raw | ConvertFrom-Json
  foreach ($r in $records) {
    $base = $saved | Where-Object { $_.Name -eq $r.Name -and $_.Type -eq $r.Type }
    foreach ($server in $Against) {
      $got = Query $r.Name $r.Type $server
      $ok = Same $got.Values @($base.Values)
      if (-not $ok) { $failed = $true }
      "{0,-4} {1,-6} {2,-36} @ {3}" -f $(if ($ok) { "ok" } else { "DIFF" }), $r.Type, $r.Name, $server
    }
  }
} else {
  $awsServers = aws route53 get-hosted-zone --id $ZoneId --profile $Profile --query "DelegationSet.NameServers" --output text
  $servers = @($awsServers -split "\s+" | Where-Object { $_ }) + $OldNameServer
  $baselineRows = @()
  foreach ($r in $records) {
    $want = Expected $r
    foreach ($server in $servers) {
      $got = Query $r.Name $r.Type $server
      $ok = (Same $got.Values $want) -and ($got.Ttl -eq [int]$r.TTL)
      if (-not $ok) { $failed = $true }
      "{0,-4} {1,-6} {2,-36} @ {3} (ttl {4})" -f $(if ($ok) { "ok" } else { "DIFF" }), $r.Type, $r.Name, $server, $got.Ttl
    }
    $answer = aws route53 test-dns-answer --hosted-zone-id $ZoneId --record-name $r.Name.TrimEnd(".") --record-type $r.Type --profile $Profile --query "RecordData" --output json | ConvertFrom-Json
    $route53 = @($answer | ForEach-Object { Normalize $r.Type $_ }) | Sort-Object
    $ok = Same $route53 $want
    if (-not $ok) { $failed = $true }
    "{0,-4} {1,-6} {2,-36} @ route53 test-dns-answer" -f $(if ($ok) { "ok" } else { "DIFF" }), $r.Type, $r.Name
    if ($Baseline) {
      $baselineRows += [pscustomobject]@{ Name = $r.Name; Type = $r.Type; Values = (Query $r.Name $r.Type "8.8.8.8").Values }
    }
  }
  if ($Baseline -and -not $failed) {
    $json = $baselineRows | ConvertTo-Json -Depth 4
    [IO.File]::WriteAllText($baselinePath, $json, (New-Object Text.UTF8Encoding $false))
    "Baseline saved to $baselinePath"
  }
}

if ($failed) { "MISMATCH: do not switch nameservers."; exit 1 }
"All records match."
exit 0
