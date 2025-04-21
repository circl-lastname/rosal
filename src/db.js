import Database from "better-sqlite3";

import { config } from "./index.js";

export let db;

export function initDatabase() {
  db = new Database(config.dbFile);
  
  db.exec(`
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  displayName TEXT NOT NULL,
  email TEXT NOT NULL,
  color INTEGER NOT NULL,
  role INTEGER NOT NULL CHECK (role in (0, 1, 2)),
  passwordHash TEXT NOT NULL
);
  `);
}

export function roleToString(role) {
  switch (role) {
    case 0:
      return "User";
    case 1:
      return "Moderator";
    case 2:
      return "Administrator";
  }
}
