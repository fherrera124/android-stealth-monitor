import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'devices.db');

let dbInstance;

const db = {
  run: (sql, ...params) => new Promise((resolve, reject) => {
    dbInstance.run(sql, ...params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  }),
  get: (sql, ...params) => new Promise((resolve, reject) => {
    dbInstance.get(sql, ...params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  }),
  exec: (sql) => new Promise((resolve, reject) => {
    dbInstance.exec(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  }),
  all: (sql, ...params) => new Promise((resolve, reject) => {
    dbInstance.all(sql, ...params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  })
};

dbInstance = new sqlite3.Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS devices (
    id TEXT,
    device_uuid TEXT UNIQUE NOT NULL,
    brand TEXT,
    model TEXT,
    manufacturer TEXT,
    connected_at INTEGER DEFAULT (strftime('%s', 'now')),
    last_seen INTEGER DEFAULT (strftime('%s', 'now')),
    PRIMARY KEY (device_uuid)
  );
  CREATE TABLE IF NOT EXISTS device_daily_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_uuid TEXT,
    date TEXT,  -- YYYY-MM-DD
    logs_data TEXT,  -- JSON array of {timestamp, log}
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (device_uuid) REFERENCES devices (device_uuid),
    UNIQUE(device_uuid, date)
  );
  CREATE TABLE IF NOT EXISTS default_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_url TEXT NOT NULL,
    screenshot_quality INTEGER DEFAULT 70 CHECK(screenshot_quality >= 1 AND screenshot_quality <= 100),
    auto_screenshot INTEGER DEFAULT 1,  -- 0 = false, 1 = true
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  );
  CREATE TABLE IF NOT EXISTS device_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_uuid TEXT NOT NULL,
    server_url TEXT NOT NULL,
    screenshot_quality INTEGER DEFAULT 70 CHECK(screenshot_quality >= 1 AND screenshot_quality <= 100),
    auto_screenshot INTEGER DEFAULT 1,  -- 0 = false, 1 = true
    is_custom INTEGER DEFAULT 0,  -- 0 = from default config, 1 = manually modified
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (device_uuid) REFERENCES devices (device_uuid),
    UNIQUE(device_uuid)
  );
`).catch(console.error);

// Default config functions
db.getDefaultConfig = () => db.get('SELECT * FROM default_config WHERE id = 1');

db.updateDefaultConfig = (server_url, screenshot_quality, auto_screenshot) => 
  db.run('UPDATE default_config SET server_url = ?, screenshot_quality = ?, auto_screenshot = ?, updated_at = ? WHERE id = 1',
    server_url, screenshot_quality, auto_screenshot ? 1 : 0, Date.now());

// Device config functions
db.getDeviceConfig = (device_uuid) => 
  db.get('SELECT * FROM device_configs WHERE device_uuid = ?', device_uuid);

db.upsertDeviceConfig = (device_uuid, server_url, screenshot_quality, auto_screenshot, is_custom = 0) =>
  db.run(`INSERT OR REPLACE INTO device_configs 
          (device_uuid, server_url, screenshot_quality, auto_screenshot, is_custom, updated_at) 
          VALUES (?, ?, ?, ?, ?, ?)`,
    device_uuid, server_url, screenshot_quality, auto_screenshot ? 1 : 0, is_custom, Date.now());

db.getAllDeviceConfigs = () => db.all('SELECT * FROM device_configs');

db.deleteDeviceConfig = (device_uuid) => 
  db.run('DELETE FROM device_configs WHERE device_uuid = ?', device_uuid);

export { db };
