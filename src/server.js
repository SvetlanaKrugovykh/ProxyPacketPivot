const http = require('http')
const dnsd = require('dnsd')
const httpProxy = require('http-proxy-middleware')
const { data, dnsServerParams } = require('./data/netData.js')
const ipRangeCheck = require('ip-range-check')

for (const netData of data) {
  const dnsServer = dnsd.createServer((req, res) => {
    res.end(dnsServerParams.dnsTargetAddress)
  })

  dnsServer.listen(53, netData.server_node, () => {
    console.log(`DNS server listening on ${netData.server_node} port 53`)
  })

  const proxy = httpProxy.createProxyMiddleware({
    target: netData.target,
    changeOrigin: true,
    xfwd: true,
    router: {
      [netData.node_url]: netData.target
    },
    onProxyReq: (proxyReq, req, res) => {
      const sourceIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress
      const allowedIPs = [netData.client_net]
      console.log(`Source IP: ${sourceIP} Allowed IPs:${allowedIPs}`)
      if (!allowedIPs.some(network => ipRangeCheck(sourceIP, network))) {
        res.writeHead(403, { 'Content-Type': 'text/plain' })
        res.end('Access denied for ' + sourceIP + '\n')
      }
    }
  })

  const server = http.createServer((req, res) => {
    proxy(req, res, (err) => {
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end('Something went wrong.')
    })
  })

  server.listen(netData.port, netData.server_node, () => {
    console.log(`Proxy server for VLAN_${netData.vlan_number} listening on http://${netData.server_node}:${netData.port}${netData.node_url}`)
  })
}