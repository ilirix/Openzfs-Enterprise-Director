#!/bin/bash
set -eo pipefail
B=/root/oed-bench
R=$B/results
mkdir -p "$R" "$B/cargo-home"
cd "$B"

cat > Containerfile <<'EOF'
FROM docker.io/library/node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends wrk curl procps ca-certificates && rm -rf /var/lib/apt/lists/*
EOF
podman build -q -t localhost/oed-bench:latest -f Containerfile . > /dev/null

RUST_IMG=docker.io/library/rust:1-slim-bookworm
RUN="podman run --rm -v $B/rust:/src -v $B/cargo-home:/cargo -e CARGO_HOME=/cargo -w /src --cpuset-cpus 0-7 $RUST_IMG"

$RUN sh -c 'rustc --version; cargo --version' > "$R/toolchain.txt"
$RUN cargo fetch > "$R/cargo-fetch.log" 2>&1

t0=$(date +%s.%N)
$RUN cargo build --release > "$R/cargo-build.log" 2>&1
t1=$(date +%s.%N)

touch rust/src/main.rs
t2=$(date +%s.%N)
$RUN cargo build --release > "$R/cargo-rebuild.log" 2>&1
t3=$(date +%s.%N)

BIN=rust/target/release/zfs-enterprise-director
$RUN sh -c 'strip /src/target/release/zfs-enterprise-director -o /tmp/s && wc -c < /tmp/s' > "$R/stripped-size.txt" || true

{
  echo "clean_build_s=$(awk -v a=$t0 -v b=$t1 'BEGIN{printf "%.1f", b-a}')"
  echo "incremental_build_s=$(awk -v a=$t2 -v b=$t3 'BEGIN{printf "%.1f", b-a}')"
  echo "binary_bytes=$(wc -c < "$BIN")"
  echo "binary_stripped_bytes=$(cat "$R/stripped-size.txt")"
  echo "crates_compiled=$(grep -c 'Compiling ' "$R/cargo-build.log")"
  echo "warnings=$(grep -c '^warning' "$R/cargo-build.log" || true)"
  echo "node_bundle_bytes=$(wc -c < node/server.cjs)"
  echo "node_dist_bytes=$(du -sb node/dist | cut -f1)"
  echo "node_runtime_bytes=$(podman run --rm localhost/oed-bench:latest sh -c 'wc -c < $(command -v node)')"
  echo "node_version=$(podman run --rm localhost/oed-bench:latest node --version)"
  echo "wrk_version=$(podman run --rm localhost/oed-bench:latest sh -c 'wrk -v 2>&1 | head -1')"
} > "$R/build.env"
cat "$R/toolchain.txt" "$R/build.env"
tail -3 "$R/cargo-build.log"
