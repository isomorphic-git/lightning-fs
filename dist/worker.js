importScripts("lightning-fs.min.js");
importScripts("test.js")

self.fs = new LightningFS("fs");

test(self.fs, 'B')

self.onmessage = (message) => {
  if (message.data === 'die') {
    self.fs.free()
  }
}