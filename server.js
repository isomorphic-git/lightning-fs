// RPC server for LightningFS

const port = 8542
const WebSocket = require('ws')
const fs = require('fs').promises

const wss = new WebSocket.Server({ port })

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    let [id, method, ...args] = JSON.parse(data)
    console.log('rx:', id, method, ...args)
    fs[method](...args).then(res => {
      ws.send(JSON.stringify([-id, res]))
    }).catch(err => {
      ws.send(JSON.stringify([-id, null, [err.name, err.message]]))
    })
  })
})
