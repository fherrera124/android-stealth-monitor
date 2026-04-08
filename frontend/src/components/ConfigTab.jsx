import React, { useState, useEffect } from 'react'

function ConfigTab({ socket, defaultConfig, deviceConfig, currentDevice, devices, showMsg }) {

  const [defaultServerUrl, setDefaultServerUrl] = useState('')
  const [defaultScreenshotQuality, setDefaultScreenshotQuality] = useState(70)
  const [defaultAutoScreenshot, setDefaultAutoScreenshot] = useState(true)
  const [deviceServerUrl, setDeviceServerUrl] = useState('')
  const [deviceScreenshotQuality, setDeviceScreenshotQuality] = useState(70)
  const [deviceAutoScreenshot, setDeviceAutoScreenshot] = useState(true)

  useEffect(() => {
    if (defaultConfig) {
      setDefaultServerUrl(defaultConfig.server_url || '')
      setDefaultScreenshotQuality(defaultConfig.screenshot_quality || 70)
      setDefaultAutoScreenshot(defaultConfig.auto_screenshot === 1)
    }
  }, [defaultConfig])

  useEffect(() => {
    if (deviceConfig) {
      setDeviceServerUrl(deviceConfig.server_url || '')
      setDeviceScreenshotQuality(deviceConfig.screenshot_quality || 70)
      setDeviceAutoScreenshot(deviceConfig.auto_screenshot === 1 || deviceConfig.auto_screenshot === true)
    } else {
      setDeviceServerUrl('')
      setDeviceScreenshotQuality(70)
      setDeviceAutoScreenshot(true)
    }
  }, [deviceConfig])

  const saveDefaultConfig = () => {
    if (!defaultServerUrl) {
      showMsg('Please enter a valid Server URL')
      return
    }
    if (defaultScreenshotQuality < 1 || defaultScreenshotQuality > 100) {
      showMsg('Screenshot Quality must be between 1 and 100')
      return
    }
    socket?.emit('update_default_config', {
      server_url: defaultServerUrl,
      screenshot_quality: defaultScreenshotQuality,
      auto_screenshot: defaultAutoScreenshot
    })
  }

  const saveDeviceConfig = () => {
    if (!currentDevice) {
      showMsg('Please select a device first')
      return
    }
    if (!deviceServerUrl) {
      showMsg('Please enter a valid Server URL')
      return
    }
    if (deviceScreenshotQuality < 1 || deviceScreenshotQuality > 100) {
      showMsg('Screenshot Quality must be between 1 and 100')
      return
    }
    socket?.emit('update_device_config', {
      device_uuid: currentDevice,
      server_url: deviceServerUrl,
      screenshot_quality: deviceScreenshotQuality,
      auto_screenshot: deviceAutoScreenshot
    })
  }

  const resetDeviceConfig = () => {
    if (!currentDevice) return
    if (confirm('Are you sure you want to reset this device configuration to default config?')) {
      socket?.emit('reset_device_config', currentDevice)
    }
  }

  const broadcastDefaultConfig = () => {
    if (confirm('Are you sure you want to broadcast the default config to all devices?')) {
      socket?.emit('broadcast_default_config')
      showMsg('Broadcasting default config to all devices...')
    }
  }

  const device = devices.find(d => d.ID === currentDevice)

  return (
    <div className="config-container">
      <div className="config-section">
        <h3>Default Config</h3>
        <p className="config-description">These values are used as default for all new devices</p>
        <div className="config-form">
          <div className="config-field">
            <label htmlFor="default-server-url">Server URL:</label>
            <input type="text" id="default-server-url" value={defaultServerUrl} onChange={(e) => setDefaultServerUrl(e.target.value)} />
          </div>
          <div className="config-field">
            <label htmlFor="default-screenshot-quality">Screenshot Quality (1-100):</label>
            <input type="number" id="default-screenshot-quality" min="1" max="100" value={defaultScreenshotQuality} onChange={(e) => setDefaultScreenshotQuality(parseInt(e.target.value))} />
          </div>
          <div className="config-field">
            <label htmlFor="default-auto-screenshot">
              <input type="checkbox" id="default-auto-screenshot" checked={defaultAutoScreenshot} onChange={(e) => setDefaultAutoScreenshot(e.target.checked)} />
              Auto Screenshot Enabled
            </label>
          </div>
          <div className="config-actions">
            <button onClick={saveDefaultConfig} className="config-button save">Save changes</button>
            <button onClick={() => socket?.emit('get_default_config')} className="config-button reload">Reload</button>
            <button onClick={broadcastDefaultConfig} className="config-button broadcast">Broadcast Config</button>
          </div>
        </div>
      </div>

      <div className="config-section" style={{ display: currentDevice ? 'block' : 'none' }}>
        <h3>Device Configuration</h3>
        <p className="config-description">Configuration for selected device: {device ? `${device.Brand} (${device.Model})` : currentDevice}</p>
        <div className="config-form">
          <div className="config-field">
            <label htmlFor="device-server-url">Server URL:</label>
            <input type="text" id="device-server-url" value={deviceServerUrl} onChange={(e) => setDeviceServerUrl(e.target.value)} />
          </div>
          <div className="config-field">
            <label htmlFor="device-screenshot-quality">Screenshot Quality (1-100):</label>
            <input type="number" id="device-screenshot-quality" min="1" max="100" value={deviceScreenshotQuality} onChange={(e) => setDeviceScreenshotQuality(parseInt(e.target.value))} />
          </div>
          <div className="config-field">
            <label htmlFor="device-auto-screenshot">
              <input type="checkbox" id="device-auto-screenshot" checked={deviceAutoScreenshot} onChange={(e) => setDeviceAutoScreenshot(e.target.checked)} />
              Auto Screenshot Enabled
            </label>
          </div>
          <div className="config-actions">
            <button onClick={saveDeviceConfig} className="config-button save">Save changes</button>
            <button onClick={resetDeviceConfig} className="config-button reset">Reset to Default Config</button>
            <button onClick={() => socket?.emit('get_device_config', currentDevice)} className="config-button reload">Reload</button>
          </div>
        </div>
      </div>

      {!currentDevice && (
        <div className="config-section">
          <p className="config-message">Select a device to view/edit its configuration</p>
        </div>
      )}
    </div>
  )
}

export default ConfigTab