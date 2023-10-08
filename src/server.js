const httpProxy = require('http-proxy')
const data = require('./data/netData-temp.js')


for (const netData of data) {
  const Fastify = require('fastify')()
  const proxyServer = httpProxy.createProxyServer({})

  Fastify.all(netData.node_url, (req, reply) => {
    const sourceIP = req.ip
    const allowedIPs = [netData.client_net]
    if (allowedIPs.some(network => req.isInCIDR(sourceIP, network))) {
      proxyServer.web(req, reply.res, {
        target: netData.target
      })
    } else {
      reply.code(403).send('Access denied')
    }
  })

  Fastify.listen({ port: 8181, host: netData.server_node }, (err, address) => {
    if (err) {
      console.error(err)
      process.exit(1)
    }
    console.log(`Proxy server for VLAN_${netData.vlan_number} listening on ${address}`)
  })
}


