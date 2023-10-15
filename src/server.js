const https = require('https')
const httpProxy = require('http-proxy')
require('dotenv').config()
const dns2 = require('dns2')
const Packet = dns2.Packet
const { data, cert } = require('./data/netData.js')

//#region DNS
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
  })
}
//#endregion DNS

//#region HTTP/HTTPS
const credentials = { key: cert.key, cert: cert.cert }
const DEBUG_LEVEL = Number(process.env.DEBUG_LEVEL) || 0
for (const netData of data) {
  const proxy = httpProxy.createProxyServer({
    target: netData.target,
    changeOrigin: true,
    xfwd: true,
  })

  const server = https.createServer(credentials, (req, res) => {
    proxy.web(req, res, {
      target: netData.target,
      secure: false,
    })
  })

  //#region errorLog
  if (DEBUG_LEVEL > 0) {
    server.on('request', (req, res) => {
      console.log('Request:', req.url)
    })
    server.on('error', (err) => {
      console.error('Server error:', err)
    })
    proxy.on('error', function (err, req, res) {
      console.error('Proxy error:', err)
    })
  }
  //#endregion errorLog

  //#region detailedLog
  if (DEBUG_LEVEL > 3) {
    proxy.on('proxyReq', function (proxyReq, req, res, options) {
      console.log('Proxy request:', req.url)
    })
    proxy.on('proxyRes', function (proxyRes, req, res) {
      console.log('Proxy response:', req.url)
    })
  }
  //#endregion detailedLog

  server.listen(netData.port, netData.server_node, () => {
    console.log(`Proxy server listening on https://${netData.server_node}:${netData.port}`)
  })

  // Handle CONNECT requests for HTTPS
  server.on('connect', (req, clientSocket, head) => {
    const parts = req.url.split(':')
    const targetHost = parts[0]
    const targetPort = parseInt(parts[1], 10)

    const serverSocket = net.connect(targetPort, targetHost, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n' +
        'Proxy-agent: Node.js-Proxy\r\n' +
        '\r\n')
      serverSocket.write(head)
      serverSocket.pipe(clientSocket)
      clientSocket.pipe(serverSocket)
    })

    serverSocket.on('error', (err) => {
      console.error(err)
      clientSocket.end('HTTP/1.1 500 Internal Server Error\r\n\r\n')
      clientSocket.destroy()
    })
  })
}
//#endregion HTTP/HTTPS

