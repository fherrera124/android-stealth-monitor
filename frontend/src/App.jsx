import React, { useState, useEffect } from 'react'
import { io } from 'socket.io-client'
import Header from './components/Header.jsx'
import DevicePanel from './components/DevicePanel.jsx'
import Tabs from './components/Tabs.jsx'
import Messages from './components/Messages.jsx'

function App() {
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [socket, setSocket] = useState(null)
  const [devices, setDevices] = useState([])
  const [currentDevice, setCurrentDevice] = useState('')
  const [deviceInfo, setDeviceInfo] = useState({})
  const [logs, setLogs] = useState('')
  const [screenshots, setScreenshots] = useState([])
  const [defaultConfig, setDefaultConfig] = useState(null)
  const [deviceConfig, setDeviceConfig] = useState(null)
  const [messages, setMessages] = useState([])
  const [buildProgress, setBuildProgress] = useState(false)

  useEffect(() => {
    if (authenticated) {
      const newSocket = io('/frontend', {
        transports: ['websocket'],
        upgrade: true
      })
      setSocket(newSocket)

      // Socket listeners
      newSocket.on('devices', (data) => {
        setDevices(data)
        // Check if current device still connected
        const stillConnected = data.some(d => d.ID === currentDevice)
        if (currentDevice && !stillConnected) {
          setCurrentDevice('')
          setDeviceInfo({})
        }
      })

      newSocket.on('device_info', (data) => {
        const { device_uuid, ...info } = data
        setCurrentDevice(device_uuid)
        setDeviceInfo(info)
      })

      newSocket.on('logger', ({ device, log }) => {
        if (device === currentDevice) {
          setLogs(prev => prev + log.trim() + '\n')
        }
      })

      newSocket.on('device_logs', (logs) => {
        setLogs(logs.join('\n'))
      })

      newSocket.on('screenshots_list', (screenshots) => {
        setScreenshots(screenshots)
      })

      newSocket.on('default_config_data', (config) => {
        setDefaultConfig(config)
      })

      newSocket.on('device_config_data', (config) => {
        setDeviceConfig(config)
      })

      newSocket.on('build_success', () => {
        setBuildProgress(false)
        showMsg('Build successful! Downloading APK...')
        newSocket.emit('download_apk')
      })

      newSocket.on('apk_data', (buffer) => {
        const blob = new Blob([buffer], { type: 'application/vnd.android.package-archive' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'app-release.apk'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        showMsg('APK downloaded successfully!')
      })

      newSocket.on('build_error', (data) => {
        setBuildProgress(false)
        showMsg(data.error || 'Build failed')
      })

      // Load initial data
      newSocket.emit('get_default_config')

      return () => newSocket.close()
    }
  }, [authenticated])

  const showMsg = (msg) => {
    const newMsg = { id: Date.now(), text: msg }
    setMessages(prev => [...prev, newMsg])
    setTimeout(() => {
      setMessages(prev => prev.filter(m => m.id !== newMsg.id))
    }, 5000)
  }

  const checkPassword = () => {
    if (password === '8888') {
      setAuthenticated(true)
    } else {
      alert('Clave incorrecta. Intente nuevamente.')
      setPassword('')
    }
  }

  const handleDeviceChange = (deviceId) => {
    setCurrentDevice(deviceId)
    if (deviceId !== 'None') {
      socket?.emit('get_device_info', deviceId)
    } else {
      setDeviceInfo({})
    }
  }

  const takeScreenshot = () => {
    if (!currentDevice) {
      showMsg('Please select a device first.')
      return
    }
    socket?.emit('screenshot_req', currentDevice)
  }

  const download = () => {
    const serverUrl = window.location.origin
    setBuildProgress(true)
    socket?.emit('build_request', { serverUrl })
  }

  const downloadLatest = () => {
    socket?.emit('download_apk')
  }

  const showTab = (tabName) => {
    // Handled in Tabs component
  }

  if (!authenticated) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0,0,0,0.8)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '2rem',
          borderRadius: '10px',
          boxShadow: '0 0 10px rgba(0,0,0,0.3)',
          textAlign: 'center'
        }}>
          <h2>Acceso Restringido</h2>
          <p>Ingrese la clave de acceso:</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && checkPassword()}
            style={{ padding: '0.5rem', margin: '1rem 0', width: '200px', fontSize: '1rem' }}
          />
          <br />
          <button
            onClick={checkPassword}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            Acceder
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Header />
      <div id="container">
        <DevicePanel
          devices={devices}
          currentDevice={currentDevice}
          deviceInfo={deviceInfo}
          onDeviceChange={handleDeviceChange}
          onTakeScreenshot={takeScreenshot}
          onDownload={download}
          onDownloadLatest={downloadLatest}
          buildProgress={buildProgress}
        />
        <Tabs
          socket={socket}
          logs={logs}
          screenshots={screenshots}
          defaultConfig={defaultConfig}
          deviceConfig={deviceConfig}
          currentDevice={currentDevice}
          devices={devices}
          showMsg={showMsg}
        />
      </div>
      <Messages messages={messages} />
    </div>
  )
}

export default App