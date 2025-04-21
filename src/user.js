import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

import { db, roleToString } from "./db.js";

const sessions = {};

setInterval(() => {
  let now = new Date();
  
  for (let sessionId in sessions) {
    if (now - sessions[sessionId].date >= 24*60*60*1000) {
      delete sessions[sessionId];
    }
  }
}, 60*60*1000);

function createSession(userId) {
  let sessionId = randomBytes(16).toString("base64");
  sessions[sessionId] = { userId: userId, date: new Date() };
  return sessionId;
}

export async function createUser(username, email, password) {
  if (db.prepare("SELECT 1 FROM users WHERE username = ?").get(username)) {
    return false;
  }
  
  let passwordHash = await bcrypt.hash(password, 10);
  
  let stmt = db.prepare("INSERT INTO users (username, displayName, email, color, role, passwordHash) VALUES (?, ?, ?, ?, ?, ?)");
  let info = stmt.run(username, username, email, Math.floor(Math.random() * 360), 0, passwordHash);
  
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
  // Maybe just parse the cookies at this point
  let sessionId = ` ${req.headers["cookie"]}`.match(/(?<= session=)[^;]*/)?.[0];
  
  if (sessionId && sessions[sessionId]) {
    delete sessions[sessionId];
  }
}

export function getSessionUser(req) {
  // Maybe just parse the cookies at this point
  let sessionId = ` ${req.headers["cookie"]}`.match(/(?<= session=)[^;]*/)?.[0];
  
  if (!sessionId || !sessions[sessionId]) {
    return undefined;
  }
  
  let stmt = db.prepare("SELECT * FROM users WHERE id = ?");
  return stmt.get(sessions[sessionId].userId);
}
