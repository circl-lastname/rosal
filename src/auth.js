import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

import { db, roleToString } from "./db.js";

const sessions = {};

setInterval(() => {
  let now = Date.now();
  
  for (let sessionId in sessions) {
    if (now - sessions[sessionId].lastUse >= 24*60*60*1000) {
      delete sessions[sessionId];
    }
  }
}, 60*60*1000);

function createSession(userId) {
  let sessionId = randomBytes(24).toString("base64");
  sessions[sessionId] = { userId: userId, lastUse: Date.now() };
  return sessionId;
}

export async function createUser(username, email, password) {
  if (db.prepare("SELECT 1 FROM users WHERE username = ?").get(username)) {
    return false;
  }
  
  let role = 0;
  // The first created account becomes an Owner
  if (db.prepare("SELECT COUNT(*) AS count FROM users").get().count === 0) {
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
  let sessionId = ` ${req.headers["cookie"]}`.match(/(?<= session=)[^;]*/)?.[0];
  
  if (sessions[sessionId]) {
    delete sessions[sessionId];
  }
}

export async function changeUserPassword(userId, password) {
  for (let sessionId in sessions) {
    if (sessions[sessionId].userId === userId) {
      delete sessions[sessionId];
    }
  }
  
  let passwordHash = await bcrypt.hash(password, 10);
  
  let stmt = db.prepare("UPDATE users SET passwordHash = ? WHERE id = ?");
  stmt.run(passwordHash, userId);
}

export function getSessionUser(req) {
  if (!req.headers["cookie"]) {
    return undefined;
  }
  
  // Maybe just parse the cookies at this point
  let sessionId = ` ${req.headers["cookie"]}`.match(/(?<= session=)[^;]*/)?.[0];
  
  if (!sessions[sessionId]) {
    return undefined;
  }
  
  sessions[sessionId].lastUse = Date.now();
  
  let stmt = db.prepare("SELECT * FROM users WHERE id = ?");
  return stmt.get(sessions[sessionId].userId);
}
