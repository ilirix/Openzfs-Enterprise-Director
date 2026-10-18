#!/bin/bash
set -u
B=/root/oed-bench
R=$B/results
IMG=localhost/oed-bench:latest
DUR=${DUR:-15s}
WARM=${WARM:-5s}
STARTS=${STARTS:-5}
mkdir -p "$R"
printf '{\n  "enabled": true\n}\n' > "$B/node/linux_package/python_cli/demo_mode.json"

echo "server,endpoint,conns,rps,p50_ms,p90_ms,p99_ms,avg_ms,errors,cpu_s,requests" > "$R/wrk.csv"
echo "server,run,startup_ms,idle_rss_kb" > "$R/startup.csv"
echo "server,phase,rss_kb,hwm_kb" > "$R/memory.csv"
echo "server,path,method,http_code,bytes" > "$R/coverage.csv"

to_ms() {
  awk -v v="$1" 'BEGIN{
    if (v ~ /us$/) { sub(/us$/, "", v); printf "%.3f", v / 1000 }
    else if (v ~ /ms$/) { sub(/ms$/, "", v); printf "%.3f", v }
    else if (v ~ /s$/) { sub(/s$/, "", v); printf "%.3f", v * 1000 }
    else print v }'
}

port_of() { [ "$1" = node ] && echo 3200 || echo 3201; }

start_server() {
  local s=$1 port
  port=$(port_of "$s")
  podman rm -f srv > /dev/null 2>&1
  if [ "$s" = node ]; then
    cp "$B/zfs_state.orig.json" "$B/node/linux_package/python_cli/zfs_state.json"
    podman run -d --name srv --network host --cpuset-cpus 0-1 --memory 1g \
      -v "$B/node:/app" -v "$B/launch.sh:/launch.sh:ro" -w /app \
      -e NODE_ENV=production -e PORT=$port "$IMG" /launch.sh node server.cjs > /dev/null
  else
    podman run -d --name srv --network host --cpuset-cpus 0-1 --memory 1g \
      -v "$B/rust/target/release:/app:ro" -v "$B/launch.sh:/launch.sh:ro" -w /app \
      -e PORT=$port "$IMG" /launch.sh /app/zfs-enterprise-director > /dev/null
  fi
  for _ in $(seq 1 1200); do
    podman exec srv test -f /tmp/ready 2> /dev/null && return 0
    sleep 0.05
  done
  echo "server $s did not become ready" >&2
  podman logs srv >&2
  return 1
}

mem() { podman exec srv sh -c 'p=$(cat /tmp/pid); awk "/^VmRSS/{r=\$2} /^VmHWM/{h=\$2} END{print r\",\"h}" /proc/$p/status'; }
cpu_ticks() { podman exec srv sh -c 'p=$(cat /tmp/pid); awk "{print \$14+\$15+\$16+\$17}" /proc/$p/stat'; }

run_wrk() {
  local s=$1 label=$2 path=$3 c=$4 lua=${5:-} port t out c0 c1
  port=$(port_of "$s")
  t=4; [ "$c" -lt 4 ] && t=$c
  local script=()
  [ -n "$lua" ] && script=(-s "/bench/$lua")
  podman run --rm --network host --cpuset-cpus 4-7 -v "$B:/bench:ro" "$IMG" \
    wrk -t$t -c$c -d$WARM --timeout 10s "${script[@]}" "http://127.0.0.1:$port$path" > /dev/null
  c0=$(cpu_ticks)
  out=$(podman run --rm --network host --cpuset-cpus 4-7 -v "$B:/bench:ro" "$IMG" \
    wrk -t$t -c$c -d$DUR --latency --timeout 10s "${script[@]}" "http://127.0.0.1:$port$path")
  c1=$(cpu_ticks)
  echo "$out" > "$R/wrk-$s-$label-c$c.txt"
  local rps avg p50 p90 p99 reqs errs cpus
  rps=$(echo "$out" | awk '/Requests\/sec/ {print $2}')
  avg=$(to_ms "$(echo "$out" | awk '$1=="Latency" && $2!="Distribution" {print $2; exit}')")
  p50=$(to_ms "$(echo "$out" | awk '$1=="50%" {print $2}')")
  p90=$(to_ms "$(echo "$out" | awk '$1=="90%" {print $2}')")
  p99=$(to_ms "$(echo "$out" | awk '$1=="99%" {print $2}')")
  reqs=$(echo "$out" | awk '/requests in/ {print $1}')
  errs=$(echo "$out" | awk '/Non-2xx|Socket errors/' | tr -s ' \n' ' ')
  cpus=$(awk -v a="$c0" -v b="$c1" 'BEGIN{printf "%.2f", (b - a) / 100}')
  echo "$s,$label,$c,$rps,$p50,$p90,$p99,$avg,\"$errs\",$cpus,$reqs" >> "$R/wrk.csv"
  echo "  $s $label c=$c rps=$rps p50=${p50}ms p99=${p99}ms cpu=${cpus}s $errs"
}

probe() {
  local s=$1 method=$2 path=$3 port res
  port=$(port_of "$s")
  res=$(curl -s -o /dev/null -X "$method" -H 'Content-Type: application/json' -d '{}' \
    -w '%{http_code},%{size_download}' "http://127.0.0.1:$port$path")
  echo "$s,$path,$method,$res" >> "$R/coverage.csv"
}

for s in node rust; do
  echo "== $s: startup x$STARTS"
  for i in $(seq 1 "$STARTS"); do
    start_server "$s" || exit 1
    sleep 1
    ms=$(podman exec srv cat /tmp/ready)
    rss=$(mem | cut -d, -f1)
    echo "$s,$i,$ms,$rss" >> "$R/startup.csv"
    echo "  run $i: ${ms} ms, idle RSS ${rss} kB"
  done
  idle=$(mem)
  echo "$s,idle,$idle" >> "$R/memory.csv"

  for p in / /api/zfs/arc /api/zfs/arc/telemetry /api/zfs/devices/sdb /api/system/packages /api/zfs/pools /api/zfs/datasets /api/zfs/snapshots /api/system/logs /api/system/demo-mode; do
    probe "$s" GET "$p"
  done

  [ "$s" = node ] && arc=/api/zfs/arc || arc=/api/zfs/arc/telemetry
  echo "== $s: endpoints"
  run_wrk "$s" arc "$arc" 64
  run_wrk "$s" device /api/zfs/devices/sdb 64
  run_wrk "$s" packages /api/system/packages 64
  echo "== $s: concurrency sweep (arc)"
  for c in 1 16 256; do run_wrk "$s" arc "$arc" "$c"; done
  echo "$s,after-get-load,$(mem)" >> "$R/memory.csv"

  echo "== $s: POST benchmark"
  run_wrk "$s" bench-post /api/zfs/benchmark/run 64 post.lua
  echo "$s,after-post-load,$(mem)" >> "$R/memory.csv"
  if [ "$s" = node ]; then
    echo "node_state_bytes_after_post=$(wc -c < "$B/node/linux_package/python_cli/zfs_state.json")" > "$R/state.env"
    echo "node_state_bytes_before=$(wc -c < "$B/zfs_state.orig.json")" >> "$R/state.env"
  fi
  podman logs srv > "$R/server-$s.log" 2>&1
  podman exec srv cat /tmp/server.log >> "$R/server-$s.log" 2>&1
  podman rm -f srv > /dev/null
done
cp "$B/zfs_state.orig.json" "$B/node/linux_package/python_cli/zfs_state.json"
echo "== done"
column -s, -t "$R/wrk.csv"
