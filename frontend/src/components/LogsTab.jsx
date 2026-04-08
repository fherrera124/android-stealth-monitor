import React, { useEffect, useRef } from 'react'

function LogsTab({ logs }) {
  const textareaRef = useRef(null)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight
    }
  }, [logs])

  return (
    <textarea
      ref={textareaRef}
      name="output"
      spellCheck="false"
      id="output"
      disabled
      value={logs}
      readOnly
    />
  )
}

export default LogsTab