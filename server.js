// RPC server for LightningFS

const port = 8542
const WebSocket = require('ws')
const fs = require('fs').promises
const path = require('path').posix
const osa = require('osa')

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

const origins = {}

const wss = new WebSocket.Server({ port })

const checkScope = async (origin, dir) => new Promise((resolve, reject) => {
  dir = path.normalize(path.resolve(dir))

  const allowedScopes = origins[origin] || []
  if (allowedScopes.some(x => dir.startsWith(x))) {
    return resolve(true)
  }
  osa(promptForPermission, origin, dir, function (err, result, _log) {
    if (err) {
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

wss.on('connection', (ws, req) => {
  const origin = req.headers.origin
  ws.on('message', async (data) => {
    let [id, method, ...args] = JSON.parse(data)
    try {
      console.log('rx:', id, method, args[0], '...')
      // sanitize method
      checkMethod(method)
      // sanitize path argument
      args[0] = path.normalize(path.resolve(args[0]))
      await checkScope(origin, args[0])
      // sanitize second path argument
      if (method === 'rename' || method === 'symlink') {
        args[1] = path.normalize(path.resolve(args[1]))
        await checkScope(origin, args[1])
      }
      // convert JSON to Buffer
      if (method === 'writeFile') {
        if (args[1] && args[1].type && args[1].type === 'Buffer') {
          args[1] = new Uint8Array(args[1].data)
        }
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
      ws.send(JSON.stringify([-id, res]))
    } catch (err) {
      ws.send(JSON.stringify([-id, null, [err.code, err.message]]))
    }
  })
})
