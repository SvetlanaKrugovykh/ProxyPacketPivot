const https = require(`https`)
const httpProxy = require(`http-proxy`)
require(`dotenv`).config()
const dns2 = require(`dns2`)
const Packet = dns2.Packet
const { data, cert } = require(`./data/netData.js`)
const DEBUG_LEVEL = Number(process.env.DEBUG_LEVEL) || 0
const currentTime = new Date().toLocaleString('en-US', { dateStyle: `medium`, timeStyle: `short` });

//#region DNS
for (const netData of data) {
  const server = dns2.createServer({
    udp: true,
    tcp: true,
    handle: (request, send, rinfo) => {
      const response = Packet.createResponseFromRequest(request)
      response.header.aa = 1 // this is an authoritative response
      const [question] = request.questions
      const { name } = question
      if (DEBUG_LEVEL === 3) console.log(`Question at ${currentTime}: ${name}`)
      response.answers.push({
        name: netData.dnsTargetName,
        type: Packet.TYPE.A,
        class: Packet.CLASS.IN,
        ttl: 300,
        address: netData.dnsTargetAddress,
      })
      send(response)
      if (DEBUG_LEVEL === 7) console.log(`Response at ${currentTime}: ${JSON.stringify(response)}`)
    }
  })
  server.on('request', (request, response, rinfo) => {
    if (DEBUG_LEVEL === 7) console.log(`Request at ${currentTime}: ${JSON.stringify(request)}`)
  })

  server.on('requestError', (error) => {
    console.log('Client sent an invalid request', error)
  })

  server.on('listening', () => {
    console.log(server.addresses())
  })

  server.on('close', () => {
    console.log(`server closed at ${currentTime}`)
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
      type: "tcp4",
    },
  })
}
//#endregion DNS

//#region HTTP/HTTPS
const credentials = { key: cert.key, cert: cert.cert }

for (const netData of data) {
  const proxy = httpProxy.createProxyServer({
    host: netData.target,
    port: netData.target_port,
    target: netData.target,
    changeOrigin: true,
    xfwd: true,
    secure: true,
  })

  const server = https.createServer(credentials, (req, res) => {
    proxy.web(req, res, {
      target: netData.target,
      port: netData.target_port,
      secure: true,
    })
  })

  //#region errorLog
  if (DEBUG_LEVEL > 0) {
    server.on('request', (req, res) => {
      console.log(`Request at ${currentTime}:`, req.url)
    })
    server.on('error', (err) => {
      console.error(`Server error at ${currentTime}:`, err)
    })
    proxy.on('error', function (err, req, res) {
      console.error(`Proxy error at ${currentTime}:`, err);
      if (err.code === `UNABLE_TO_VERIFY_LEAF_SIGNATURE`) {
        console.error(`The root CA certificate might not be trusted.`);
      }
    })
  }
  //#endregion errorLog
  proxy.on('proxyReq', function (proxyReq, req, res, options) {
    req.url = netData.target //cert.name
    console.log(`Proxy request at ${currentTime}:`, req.url)
  })

  //#region detailedLog
  if (DEBUG_LEVEL > 3) {
    proxy.on('proxyRes', function (proxyRes, req, res) {
      console.log(`Proxy response at ${currentTime}:`, req.url)
    })
  }
  //#endregion detailedLog

  server.listen(netData.port, netData.server_node, () => {
    console.log(`Proxy server listening at ${currentTime} on https://${netData.server_node}:${netData.port}`)
  })
}
//#endregion HTTP/HTTPS

