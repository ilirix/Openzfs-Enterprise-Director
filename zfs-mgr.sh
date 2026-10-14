#!/usr/bin/env bash
# OpenZFS Enterprise Director - Root Wrapper
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$DIR/linux_package/zfs-mgr.sh" "$@"
