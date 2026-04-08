import React from 'react'

function DevicePanel({ devices, currentDevice, deviceInfo, onDeviceChange, onTakeScreenshot, onDownload, onDownloadLatest, buildProgress }) {

  const handleDeviceChange = (e) => {
    const deviceId = e.target.value
    onDeviceChange(deviceId)
  }

  return (
    <form id="left">
      <div id="leftBG"></div>
      <div id="options" className="backdrop-container">
        <div style={{ padding: '1rem 1rem 0 1rem', backgroundColor: '#ffffff', borderRadius: '5px 5px 0 0' }}>
          <select name="devices" id="devices" className="wide" onChange={handleDeviceChange} value={currentDevice}>
            <option data-display="Devices">None</option>
            {devices.map(device => (
              <option key={device.ID} value={device.ID}>
                {device.Brand} ({device.Model})
              </option>
            ))}
          </select>
        </div>
        <div id="infos">
          {Object.entries(deviceInfo).map(([key, value]) => (
            <div key={key} className="info">
              <span>{key} :</span>
              <span>{value}</span>
            </div>
          ))}
          <div className="device-action">
            <button onClick={onTakeScreenshot} title="Take Screenshot" disabled={!currentDevice}>
              Take Screenshot
            </button>
          </div>
        </div>
      </div>
      <div className="section-container">
        <div className="button-container">
          <button onClick={onDownload} title="Build a custom APK configured with your config server URL to establish the connection between the Android client and your control server." disabled={buildProgress}>
            {buildProgress ? 'Building...' : 'Build APK'}
          </button>
        </div>
        {buildProgress && (
          <div className="build-progress" style={{ display: 'block' }}>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: '100%' }}></div>
            </div>
            <div className="progress-text">Building APK...</div>
          </div>
        )}
      </div>
      <div className="section-container">
        <div className="button-container">
          <button onClick={onDownloadLatest} title="Download the latest APK">
            Download APK
          </button>
        </div>
      </div>
    </form>
  )
}

export default DevicePanel