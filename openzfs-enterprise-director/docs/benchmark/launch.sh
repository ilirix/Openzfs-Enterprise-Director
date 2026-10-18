#!/bin/sh
t0=$(date +%s%N)
"$@" > /tmp/server.log 2>&1 &
echo $! > /tmp/pid
until curl -s -o /dev/null "http://127.0.0.1:$PORT/api/zfs/devices/sdb"; do sleep 0.005; done
t1=$(date +%s%N)
echo $(( (t1 - t0) / 1000000 )) > /tmp/ready
wait
