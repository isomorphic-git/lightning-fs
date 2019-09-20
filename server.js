// RPC server for LightningFS

const port = 8542
const WebSocket = require('ws')
const fs = require('fs').promises
const { createWriteStream, createReadStream, writeFileSync } = require('fs')
const path = require('path').posix
const osa = require('osa')
const http = require('http')

var promptForPermission = function (appName, dir) {
  var app = Application.currentApplication();
  var prompt = `${appName} is requesting access to:

${dir}

Only grant access if you expected this website to request this access.`;

  app.includeStandardAdditions = true;

  try {
    result = app.displayDialog(prompt, {
      withIcon: 2,
      withTitle: 'File System Access',
      message: `${dir}\n\n`,
      buttons: ['Grant', 'Deny'],
      defaultButton: 'Grant',
      cancelButton: 'Deny'
    });
    return true
  } catch (e) {
    return false
  }
};

const checkScope = async (origin, dir) => new Promise((resolve, reject) => {
  dir = path.normalize(path.resolve(dir))

  const allowedScopes = origins[origin] || []
  if (allowedScopes.some(x => dir.startsWith(x))) {
    return resolve(true)
  }
  osa(promptForPermission, origin, dir, function (err, result, _log) {
    if (err) {
      console.log(err)
      return reject(new Error('Access denied'))
    } else {
      if (!result) return reject(new Error('Access denied'))
      if (result) {
        allowedScopes.push(dir)
        origins[origin] = allowedScopes
      }
      return resolve()
    }
  })
})

const checkMethod = (method) => {
  if (!['mkdir', 'rmdir', 'readdir', 'writeFile', 'readFile', 'unlink', 'rename', 'stat', 'lstat', 'readlink', 'symlink'].includes(method)) {
    throw new Error('Unavailable method name')
  }
}

const handleOptions = (req, res) => {
  res.headers['access-control-allow-origin'] = '*'
  res.statusCode = 200
  res.end()
}

const handlePost = async (req, res) => {
  // sanitize path argument
  const rawfilepath = decodeURI(req.url)
  const filepath = path.normalize(path.resolve(rawfilepath))
  res.setHeader('access-control-allow-origin', '*')
  try {
    await checkScope(req.headers.origin || req.headers['x-origin'], filepath)
  } catch (e) {
    res.statusCode = 403
    res.write(e.message)
    res.end()
  }
  try {
    const fstream = createWriteStream(filepath)
    req.pipe(fstream).on('finish', () => {
      res.statusCode = 201
      res.end()
    })
  } catch (e) {
    res.statusCode = 500
    res.write(e.message)
    res.end()
  }
}

const handleGet = async (req, res) => {
  // sanitize path argument
  const rawfilepath = decodeURI(req.url)
  const filepath = path.normalize(path.resolve(rawfilepath))
  res.setHeader('access-control-allow-origin', '*')
  try {
    await checkScope(req.headers.origin || req.headers['x-origin'], filepath)
  } catch (e) {
    res.statusCode = 403
    res.write(e.message)
    return res.end()
  }
  try {
    await fs.stat(filepath)
  } catch (e) {
    res.statusCode = 404
    return res.end()
  }
  const fstream = createReadStream(filepath)
  fstream.pipe(res) 
}

const origins = {}
const wss = new WebSocket.Server({ noServer: true, maxPayload: 0 })
const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    return handleOptions(resq, res)
  }
  if (req.method === 'POST') {
    return handlePost(req, res)
  }
  if (req.method === 'GET') {
    return handleGet(req, res)
  }
  res.statusCode = 400
  res.end()
})
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request)
  })
})

wss.on('connection', (ws, req) => {
  const origin = req.headers.origin
  let _nextMessageIsBufferWrite = void 0
  ws.on('message', async (data) => {
    if (_nextMessageIsBufferWrite) {
      const [id, filepath, opts] = _nextMessageIsBufferWrite
      _nextMessageIsBufferWrite = void 0
      try {
        let res = await fs.writeFile(filepath, data, opts)
        ws.send(JSON.stringify([-id, res]))
      } catch (err) {
        ws.send(JSON.stringify([-id, null, [err.code, err.message]]))
      }
      return
    }
    let [id, method, ...args] = JSON.parse(data)
    try {
      // sanitize path argument
      args[0] = path.normalize(path.resolve(args[0]))
      // Handle buffers
      if (method === 'writeFile') {
        if (args[1] && args[1].nextMessageIsBuffer) {
          _nextMessageIsBufferWrite = [id, args[0], args[2]]
          return
        }
      }
      // sanitize method
      checkMethod(method)
      await checkScope(origin, args[0])
      // sanitize second path argument
      if (method === 'rename' || method === 'symlink') {
        args[1] = path.normalize(path.resolve(args[1]))
        await checkScope(origin, args[1])
      }
      let res = await fs[method](...args)
      // convert Stat objects to JSON
      if (method === 'stat' || method === 'lstat') {
        res = {
          type: res.isFile()
            ? 'file'
            : res.isDirectory()
              ? 'dir'
              : res.isSymbolicLink()
              ? 'symlink'
              : 'other',
          mode: res.mode,
          size: res.size,
          ino: res.ino,
          mtimeMs: res.mtimeMs,
          ctimeMs: res.ctimeMs || stats.mtimeMs,
          uid: 1,
          gid: 1,
          dev: 1
        }
      }
      if (Buffer.isBuffer(res)) {
        ws.send(JSON.stringify([-id, { nextMessageIsBuffer: true }]))
        ws.send(res.buffer)
        return
      }
      ws.send(JSON.stringify([-id, res]))
    } catch (err) {
      ws.send(JSON.stringify([-id, null, [err.code, err.message]]))
    }
  })
})

server.listen(port)
