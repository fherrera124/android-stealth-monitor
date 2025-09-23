import { Router } from "express";
import path from 'path';

const webRoute = Router()


webRoute.get("/", (req, res) => {
  res.sendFile(path.resolve("./static/html/index.html"))
})

webRoute.get("/setup/:ip/:port", async (req, res) => {
  var { ip, port } = req.params
  console.log(ip, port)

  try {
    const response = await fetch('http://android-builder:8080/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, port })
    });
    const data = await response.json();
    if (data.success) {
      res.json({ success: true })
    } else {
      res.json({ success: false, error: 'Build failed' })
    }
  } catch (error) {
    console.error('Build request error:', error);
    res.sendStatus(500)
  }
})

export default webRoute
