import React from 'react'

function ScreenshotsTab({ screenshots }) {
  return (
    <div id="screenshots-gallery">
      <div id="screenshots-list">
        {screenshots.length === 0 ? (
          <div className="no-screenshots">No screenshots available</div>
        ) : (
          screenshots.map(screenshot => (
            <div key={screenshot.filename} className="screenshot-item">
              <img src={screenshot.url} alt="Screenshot" className="screenshot-thumbnail" loading="lazy" />
              <div className="screenshot-info">{new Date(screenshot.timestamp).toLocaleString()}</div>
              {screenshot.automatic && <div className="screenshot-badge">Auto</div>}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default ScreenshotsTab