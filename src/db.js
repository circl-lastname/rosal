import Database from "better-sqlite3";

import { config } from "./index.js";

export let db;
const currentSchemaVersion = 2;

export function initDatabase() {
  db = new Database(config.dbFile);
  
  db.exec(`
    PRAGMA foreign_keys = ON;
    
    CREATE TABLE IF NOT EXISTS state (
      schemaVersion INTEGER NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      displayName TEXT NOT NULL,
      bio TEXT NOT NULL,
      email TEXT NOT NULL,
      color INTEGER NOT NULL,
      role INTEGER NOT NULL CHECK (role in (0, 1, 2, 3)),
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
      latestReplyId INTEGER,
      timestamp INTEGER NOT NULL,
      title TEXT NOT NULL,
      FOREIGN KEY (boardId) REFERENCES boards(id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (latestReplyId) REFERENCES replies(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idxThreadsBoardId ON threads(boardId);
    CREATE INDEX IF NOT EXISTS idxThreadsUserId ON threads(userId);
    
    CREATE TABLE IF NOT EXISTS replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      threadId INTEGER NOT NULL,
      userId INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      content TEXT NOT NULL,
      FOREIGN KEY (threadId) REFERENCES threads(id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idxRepliesThreadId ON replies(threadId);
    
    CREATE TABLE IF NOT EXISTS followedThreads (
      userId INTEGER NOT NULL,
      threadId INTEGER NOT NULL,
      replyId INTEGER,
      PRIMARY KEY (userId, threadId),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (threadId) REFERENCES threads(id) ON DELETE CASCADE
    );
  `);
  
  let schemaVersion = db.prepare("SELECT schemaVersion FROM state").get()?.schemaVersion;
  
  if (!schemaVersion) {
    db.prepare("INSERT INTO state (schemaVersion) VALUES (?)").run(currentSchemaVersion);
  } else if (schemaVersion !== currentSchemaVersion) {
    console.log("Migrating database...");
    
    while (schemaVersion !== currentSchemaVersion) {
      switch (schemaVersion) {
        case 1:
          db.exec(`
            ALTER TABLE threads ADD latestReplyId INTEGER REFERENCES replies(id) ON DELETE SET NULL;
            UPDATE threads SET latestReplyId = (SELECT MAX(replies.id) FROM replies WHERE replies.threadId = threads.id);
            UPDATE state SET schemaVersion = 2;
          `);
          schemaVersion = 2;
        break;
      }
    }
  }
}

export function roleToString(role) {
  switch (role) {
    case 0:
      return "User";
    case 1:
      return "Moderator";
    case 2:
      return "Administrator";
    case 3:
      return "Owner";
  }
}
