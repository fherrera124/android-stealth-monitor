const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

const app = express();
app.use(express.json());

app.post('/build', async (req, res) => {
  const { ip, port } = req.body;
  if (!ip || !port) {
    return res.status(400).json({ success: false, error: 'IP and port required' });
  }
  console.log('Build request received with IP:', ip, 'Port:', port);

  const command = `./gradlew assembleDebug -PmyIp=${ip} -PmyPort=${port} --no-daemon --stacktrace`;
  exec(command, { cwd: '/project' }, (error, stdout, stderr) => {
    if (error) {
      console.error(`Build error: ${error.message}`);
      console.error(`Stderr: ${stderr}`);
      res.status(500).json({ success: false, error: error.message, stderr });
      return;
    }
    console.log(`Build successful: ${stdout}`);
    const apkPath = path.join('/project', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
    res.json({ success: true, apkPath });
  });
});

app.get('/download-apk', (req, res) => {
  const apkPath = path.join('/project', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  res.setHeader('Content-disposition', 'attachment; filename=app-debug.apk');
  res.setHeader('Content-type', 'application/octet-stream');
  const fileStream = require('fs').createReadStream(apkPath);
  fileStream.pipe(res);
});

const port = 8080;
app.listen(port, '0.0.0.0', () => {
  console.log(`Android builder server running on port ${port}`);
});