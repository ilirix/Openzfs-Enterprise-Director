#!/bin/sh
# Copies the panel bundle and the Rust engine into $B (default /root/oed-bench).
# Run `npm run build` first so server.cjs and dist/ are current.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
SRC=${SRC:-$(cd "$HERE/../.." && pwd)}
B=${B:-/root/oed-bench}
rm -rf "$B"
mkdir -p "$B/node/linux_package/python_cli" "$B/rust" "$B/results"
cp "$SRC/server.cjs" "$B/node/"
cp -r "$SRC/dist" "$B/node/"
cp "$SRC/linux_package/python_cli/zfs_state.json" "$B/node/linux_package/python_cli/"
cp "$B/node/linux_package/python_cli/zfs_state.json" "$B/zfs_state.orig.json"
cp "$SRC/linux_package/rust_engine/Cargo.toml" "$B/rust/"
cp -r "$SRC/linux_package/rust_engine/src" "$B/rust/"
cp "$HERE/build.sh" "$HERE/bench.sh" "$HERE/launch.sh" "$HERE/post.lua" "$B/"
sed -i 's/\r$//' "$B"/*.sh "$B"/post.lua
chmod +x "$B"/*.sh
echo "Prepared $B from $SRC"
