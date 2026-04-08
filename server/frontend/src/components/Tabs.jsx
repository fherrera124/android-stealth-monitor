import React, { useState, useEffect } from 'react'
import LogsTab from './LogsTab.jsx'
import ScreenshotsTab from './ScreenshotsTab.jsx'
import ConfigTab from './ConfigTab.jsx'

function Tabs({ socket, logs, screenshots, defaultConfig, deviceConfig, currentDevice, devices, showMsg }) {
  const [activeTab, setActiveTab] = useState('logs')

  useEffect(() => {
    if (activeTab === 'screenshots') {
      socket?.emit('get_screenshots', currentDevice)
    } else if (activeTab === 'config') {
      socket?.emit('get_default_config')
      if (currentDevice) {
        socket?.emit('get_device_config', currentDevice)
      }
    }
  }, [activeTab, currentDevice, socket])

  const handleTabChange = (tabName) => {
    setActiveTab(tabName)
  }

  return (
    <div id="right">
      <div id="tabs">
        <button className={`tab-button ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => handleTabChange('logs')}>Logs</button>
        <button className={`tab-button ${activeTab === 'screenshots' ? 'active' : ''}`} onClick={() => handleTabChange('screenshots')}>Screenshots</button>
        <button className={`tab-button ${activeTab === 'config' ? 'active' : ''}`} onClick={() => handleTabChange('config')}>Config</button>
      </div>
      <div id="logs-tab" className={`tab-content ${activeTab === 'logs' ? 'active' : ''}`}>
        <LogsTab logs={logs} />
      </div>
      <div id="screenshots-tab" className={`tab-content ${activeTab === 'screenshots' ? 'active' : ''}`}>
        <ScreenshotsTab screenshots={screenshots} />
      </div>
      <div id="config-tab" className={`tab-content ${activeTab === 'config' ? 'active' : ''}`}>
        <ConfigTab socket={socket} defaultConfig={defaultConfig} deviceConfig={deviceConfig} currentDevice={currentDevice} devices={devices} showMsg={showMsg} />
      </div>
    </div>
  )
}

export default Tabs