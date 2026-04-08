import React from 'react'

function Messages({ messages }) {
  return (
    <div id="msgs">
      {messages.map(msg => (
        <p key={msg.id} className="msg">{msg.text}</p>
      ))}
    </div>
  )
}

export default Messages