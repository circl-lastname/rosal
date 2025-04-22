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
  bio TEXT NOT NULL,
  email TEXT NOT NULL,
  color INTEGER NOT NULL,
  role INTEGER NOT NULL CHECK (role in (0, 1, 2)),
  passwordHash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS boards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  displayOrder INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  role INTEGER NOT NULL CHECK (role in (0, 1, 2))
);

CREATE TABLE IF NOT EXISTS threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  boardId INTEGER NOT NULL,
  userId INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  title TEXT NOT NULL,
  FOREIGN KEY (boardId) REFERENCES boards(id) ON DELETE CASCADE,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  threadId INTEGER NOT NULL,
  userId INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  content TEXT NOT NULL,
  FOREIGN KEY (threadId) REFERENCES threads(id) ON DELETE CASCADE,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
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
