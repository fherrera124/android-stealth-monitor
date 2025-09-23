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
`).catch(console.error);


export { db };