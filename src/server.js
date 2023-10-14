const http = require('http')
const dns2 = require('dns2')
const { Packet } = dns2
const httpProxy = require('http-proxy-middleware')
const { data } = require('./data/netData.js')
const ipRangeCheck = require('ip-range-check')

for (const netData of data) {
  // #region Proxy http/https Server  
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
  // #endregion
}

for (const netData of data) {
  const server = dns2.createServer({
    udp: true,
    handle: (request, send, rinfo) => {
      const response = Packet.createResponseFromRequest(request)
      response.header.aa = 1 // this is an authoritative response
      const [question] = request.questions
      const { name } = question
      response.answers.push({
        name,
        type: Packet.TYPE.A,
        class: Packet.CLASS.IN,
        ttl: 300,
        address: netData.dnsTargetAddress,
      })
      send(response)
      console.log(`Response: ${JSON.stringify(response)}`)
    }
  })
  server.on('request', (request, response, rinfo) => {
    console.log(`Request: ${JSON.stringify(request)}`)
  })

  server.on('requestError', (error) => {
    console.log('Client sent an invalid request', error)
  })

  server.on('listening', () => {
    console.log(server.addresses())
  })

  server.on('close', () => {
    console.log('server closed')
  })

  server.listen({
    udp: {
      port: netData.dnsPort,
      address: netData.server_node,
      type: "udp4",
    },
    tcp: {
      port: netData.dnsPort,
      address: netData.server_node,
    },
  })
}

//#endregion
