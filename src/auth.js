import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

import { db, roleToString } from "./db.js";

setInterval(() => {
  let timestamp = Math.floor(Date.now()/1000);
  db.prepare("DELETE FROM sessions WHERE expireTimestamp >= ?").run(timestamp);
}, 60*60*1000);

function createSession(userId) {
  let token = randomBytes(24).toString("base64");
  let expireTimestamp = Math.floor(Date.now()/1000) + 48*60*60;
  
  let stmt = db.prepare("INSERT INTO sessions (token, userId, expireTimestamp) VALUES (?, ?, ?)");
  stmt.run(token, userId, expireTimestamp);
  
  return token;
}

export async function createUser(username, email, password) {
  if (db.prepare("SELECT 1 FROM users WHERE username = ?").get(username)) {
    return false;
  }
  
  let role = 0;
  // The first created account becomes an Owner
  // As a side-effect, if the Owner is deleted, the next created account becomes one
  if (!db.prepare("SELECT 1 FROM users WHERE role = 3").get()) {
    role = 3;
  }
  
  let passwordHash = await bcrypt.hash(password, 10);
  
  let stmt = db.prepare("INSERT INTO users (username, displayName, bio, email, color, role, passwordHash) VALUES (?, ?, ?, ?, ?, ?, ?)");
  let info = stmt.run(username, username, "", email, Math.floor(Math.random() * 360), role, passwordHash);
  
  return createSession(info.lastInsertRowid);
}

export async function logInUser(username, password) {
  let stmt = db.prepare("SELECT id, passwordHash FROM users WHERE username = ?");
  let user = stmt.get(username);
  
  if (!user) {
    return false;
  }
  
  if (await bcrypt.compare(password, user.passwordHash)) {
    return createSession(user.id);
  } else {
    return false;
  }
}

export function logOutUser(req) {
  if (!req.headers["cookie"]) {
    return;
  }
  
  // Maybe just parse the cookies at this point
  let token = ` ${req.headers["cookie"]}`.match(/(?<= session=)[^;]*/)?.[0];
  
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export async function changeUserPassword(userId, password) {
  db.prepare("DELETE FROM sessions WHERE userId = ?").run(userId);
  
  let passwordHash = await bcrypt.hash(password, 10);
  
  let stmt = db.prepare("UPDATE users SET passwordHash = ? WHERE id = ?");
  stmt.run(passwordHash, userId);
}

export function getSessionUser(req) {
  if (!req.headers["cookie"]) {
    return undefined;
  }
  
  // Maybe just parse the cookies at this point
  let token = ` ${req.headers["cookie"]}`.match(/(?<= session=)[^;]*/)?.[0];
  if (!token) {
    return undefined;
  }
  
  let user = db.prepare("SELECT sessions.id AS sessionId, sessions.unreadCounter, sessions.unreadCounterTimestamp, users.* FROM sessions JOIN users ON sessions.userId = users.id WHERE token = ?").get(token);
  if (!user) {
    return undefined;
  }
  
  let expireTimestamp = Math.floor(Date.now()/1000) + 48*60*60;
  db.prepare("UPDATE sessions SET expireTimestamp = ? WHERE id = ?").run(expireTimestamp, user.sessionId);
  
  return user;
}
