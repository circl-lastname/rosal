import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

import { changeUserPassword, createUser, getSessionUser, logInUser, logOutUser } from "./auth.js";
import { db, roleToString } from "./db.js";
import { assertForm, config, formatTimestamp, sendError } from "./index.js";
import { populatePage, sendAlert } from "./pages.js";
import { populate } from "./template.js";

function setCookie(res, sessionId) {
  res.setHeader("Set-Cookie", `session=${sessionId}; HttpOnly; Max-Age=31536000; SameSite=Lax${config.useHttps ? "; Secure" : ""}`);
}

export const userPages = {
  "user": {
    hasSubpages: true,
    GET: (req, path, res) => {
      if (path.length !== 2) {
        sendError(res, 404, "User not found");
        return;
      }
      
      const user = getSessionUser(req);
      
      let reqUserStmt = db.prepare("SELECT id, displayName, email, color, role FROM users WHERE username = ?");
      let reqUser = reqUserStmt.get(path[1]);
      
      if (!reqUser) {
        sendError(res, 404, "User not found");
        return;
      }
      
      let buttons = "";
      
      if (user && user.role > reqUser.role) {
        buttons += '<div class="centered">';
        
        if (user.role >= 2) {
          buttons += populate("button", {
            href: `/change-role/${path[1]}`,
            icon: "preferences-desktop-theme",
            text: "Change role"
          });
        }
        
        buttons += populate("button", {
          href: `/reset-password/${path[1]}`,
          icon: "view-refresh",
          text: "Reset password"
        });
        
        buttons += populate("button", {
          href: `/delete-user/${path[1]}`,
          icon: "user-trash",
          text: "Delete"
        });
        
        buttons += "</div>";
      }
      
      let threadsStmt = db.prepare("SELECT threads.id, threads.boardId, threads.timestamp, threads.title, boards.name FROM threads JOIN boards ON threads.boardId = boards.id WHERE threads.userId = ? AND boards.role <= ? ORDER BY threads.id DESC");
      let threadsData = threadsStmt.all(reqUser.id, user ? user.role : 0);
      
      let threads = "";
      
      for (let thread of threadsData) {
        threads += populate("user.thread", {
          id: thread.id,
          boardId: thread.boardId,
          timestamp: formatTimestamp(thread.timestamp),
          title: thread.title,
          board: thread.name
        });
      }
      
      res.setHeader("Content-Type", "text/html");
      res.end(populatePage(user, reqUser.displayName, populate("user", {
        username: path[1],
        displayName: reqUser.displayName,
        email: (() => {
          if (user && user.role >= 1) {
            return populate("user.email", { email: reqUser.email });
          } else {
            return "";
          }
        })(),
        color: reqUser.color,
        role: roleToString(reqUser.role),
        buttons: buttons,
        threads: threads
      })));
    }
  },
  "change-role": {
    hasSubpages: true,
    GET: (req, path, res) => {
      if (path.length !== 2) {
        sendError(res, 404, "User not found");
        return;
      }
      
      const user = getSessionUser(req);
      
      let stmt = db.prepare("SELECT displayName, role FROM users WHERE username = ?");
      let reqUser = stmt.get(path[1]);
      
      if (!reqUser) {
        sendError(res, 404, "User not found");
        return;
      }
      
      if (!user || user.role < 2 || user.role <= reqUser.role) {
        res.statusCode = 403;
        sendAlert(res, user, "Change role", "Forbidden", "This page is accessible only to higher roles.", "/");
        return;
      }
      
      res.setHeader("Content-Type", "text/html");
      res.end(populatePage(user, "Change role", populate("change-role", {
        displayName: reqUser.displayName,
        selected0: reqUser.role === 0 ? "selected" : "",
        selected1: reqUser.role === 1 ? "selected" : "",
        selected2: reqUser.role === 2 ? "selected" : ""
      })));
    },
    POST: (req, path, form, res) => {
      if (path.length !== 2) {
        sendError(res, 404, "User not found");
        return;
      }
      
      const user = getSessionUser(req);
      
      let reqUserStmt = db.prepare("SELECT id FROM users WHERE username = ?");
      let reqUser = reqUserStmt.get(path[1]);
      
      if (!reqUser) {
        sendError(res, 404, "User not found");
        return;
      }
      
      if (!user || user.role < 2 || user.role <= reqUser.role) {
        sendError(res, 403, "This page is accessible only to higher roles");
        return;
      }
      
      let role = parseInt(form.role);
      if (Number.isNaN(role) || role < 0 || role > 2) {
        sendError(res, 400, "Role must be User, Moderator, or Administrator");
        return;
      }
      
      let stmt = db.prepare("UPDATE users SET role = ? WHERE id = ?");
      stmt.run(role, reqUser.id);
      
      res.statusCode = 302;
      res.setHeader("Location", `/user/${path[1]}`);
      res.end();
    }
  },
  "reset-password": {
    hasSubpages: true,
    GET: (req, path, res) => {
      if (path.length !== 2) {
        sendError(res, 404, "User not found");
        return;
      }
      
      const user = getSessionUser(req);
      
      let stmt = db.prepare("SELECT displayName, role FROM users WHERE username = ?");
      let reqUser = stmt.get(path[1]);
      
      if (!reqUser) {
        sendError(res, 404, "User not found");
        return;
      }
      
      if (!user || user.role <= reqUser.role) {
        res.statusCode = 403;
        sendAlert(res, user, "Reset password", "Forbidden", "This page is accessible only to higher roles.", "/");
        return;
      }
      
      res.setHeader("Content-Type", "text/html");
      res.end(populatePage(user, "Reset password", populate("reset-password", {
        displayName: reqUser.displayName
      })));
    },
    POST: async (req, path, form, res) => {
      if (path.length !== 2) {
        sendError(res, 404, "User not found");
        return;
      }
      
      const user = getSessionUser(req);
      
      let reqUserStmt = db.prepare("SELECT id, displayName, role FROM users WHERE username = ?");
      let reqUser = reqUserStmt.get(path[1]);
      
      if (!reqUser) {
        sendError(res, 404, "User not found");
        return;
      }
      
      if (!user || user.role <= reqUser.role) {
        sendError(res, 403, "This page is accessible only to higher roles");
        return;
      }
      
      const newPassword = randomBytes(15).toString("base64");
      await changeUserPassword(reqUser.id, newPassword);
      
      sendAlert(res, user, "Reset password", "Password reset", `The new password of user "${reqUser.displayName}" is ${newPassword}`, `/user/${path[1]}`);
    }
  },
  "delete-user": {
    hasSubpages: true,
    GET: (req, path, res) => {
      if (path.length !== 2) {
        sendError(res, 404, "User not found");
        return;
      }
      
      const user = getSessionUser(req);
      
      let stmt = db.prepare("SELECT displayName, role FROM users WHERE username = ?");
      let reqUser = stmt.get(path[1]);
      
      if (!reqUser) {
        sendError(res, 404, "User not found");
        return;
      }
      
      if (!user || user.role <= reqUser.role) {
        res.statusCode = 403;
        sendAlert(res, user, "Delete user", "Forbidden", "This page is accessible only to higher roles.", "/");
        return;
      }
      
      res.setHeader("Content-Type", "text/html");
      res.end(populatePage(user, "Delete user", populate("delete-user", {
        displayName: reqUser.displayName
      })));
    },
    POST: (req, path, form, res) => {
      if (path.length !== 2) {
        sendError(res, 404, "User not found");
        return;
      }
      
      const user = getSessionUser(req);
      
      let reqUserStmt = db.prepare("SELECT id, role FROM users WHERE username = ?");
      let reqUser = reqUserStmt.get(path[1]);
      
      if (!reqUser) {
        sendError(res, 404, "User not found");
        return;
      }
      
      if (!user || user.role <= reqUser.role) {
        sendError(res, 403, "This page is accessible only to higher roles");
        return;
      }
      
      let stmt = db.prepare("DELETE FROM users WHERE id = ?");
      stmt.run(reqUser.id);
      
      res.statusCode = 302;
      res.setHeader("Location", "/");
      res.end();
    }
  },
  "log-in": {
    GET: (req, path, res) => {
      const user = getSessionUser(req);
      
      res.setHeader("Content-Type", "text/html");
      res.end(populatePage(user, "Log in", populate("log-in")));
    },
    POST: async (req, path, form, res) => {
      if (!assertForm(form, [ "username", "password" ])) {
        sendError(res, 400, "Form must have username, password");
        return;
      }
      
      const user = getSessionUser(req);
      
      let sessionId = await logInUser(form.username, form.password);
      
      if (sessionId === false) {
        res.statusCode = 400;
        sendAlert(res, user, "Log in", "Failed to log in", "Username or password incorrect.", "/log-in");
      } else {
        res.statusCode = 302;
        res.setHeader("Location", "/");
        setCookie(res, sessionId);
        res.end();
      }
    }
  },
  "forgot-password": {
    GET: (req, path, res) => {
      const user = getSessionUser(req);
      sendAlert(res, user, "Forgot password", "Forgot password", `Please contact support at ${config.supportEmail} with your account's email, an admin will manually reset your password.`, "/log-in");
    },
  },
  "log-out": {
    GET: (req, path, res) => {
      logOutUser(req);
      
      res.statusCode = 302;
      res.setHeader("Location", "/");
      res.end();
    }
  },
  "sign-up": {
    GET: (req, path, res) => {
      const user = getSessionUser(req);
      
      res.setHeader("Content-Type", "text/html");
      res.end(populatePage(user, "Sign up", populate("sign-up")));
    },
    POST: async (req, path, form, res) => {
      if (!assertForm(form, [ "username", "email", "password", "confirmPassword" ])) {
        sendError(res, 400, "Form must have username, email, password, confirmPassword");
        return;
      }
      
      const user = getSessionUser(req);
      
      if (form.username.length < 1 || form.username.length > 24) {
        res.statusCode = 400;
        sendAlert(res, user, "Sign up", "Failed to sign up", "Username must be between 1 and 24 characters.", "/sign-up");
        return;
      }
      
      const regex = /[^a-z0-9_.-]/;
      if (regex.test(form.username)) {
        res.statusCode = 400;
        sendAlert(res, user, "Sign up", "Failed to sign up", "Username must be lowercase and may have digits, underscores, dots, and dashes.", "/sign-up");
        return;
      }
      
      if (form.email.length > 48) {
        res.statusCode = 400;
        sendAlert(res, user, "Sign up", "Failed to sign up", "Email must be no more than 48 characters.", "/sign-up");
        return;
      }
      
      if (form.password !== form.confirmPassword) {
        res.statusCode = 400;
        sendAlert(res, user, "Sign up", "Failed to sign up", "Passwords do not match.", "/sign-up");
        return;
      }
      
      if (bcrypt.truncates(form.password)) {
        res.statusCode = 400;
        sendAlert(res, user, "Sign up", "Failed to sign up", "Password must be no more than 72 bytes.", "/sign-up");
        return;
      }
      
      let sessionId = await createUser(form.username, form.email, form.password);
      
      if (sessionId === false) {
        res.statusCode = 400;
        sendAlert(res, user, "Sign up", "Failed to sign up", "A user with the given username already exists.", "/sign-up");
      } else {
        res.statusCode = 302;
        res.setHeader("Location", "/user-settings");
        setCookie(res, sessionId);
        res.end();
      }
    }
  },
  "user-settings": {
    GET: (req, path, res) => {
      const user = getSessionUser(req);
      
      if (!user) {
        res.statusCode = 403;
        sendAlert(res, user, "User settings", "Please log in", "Log in to change user settings.", "/");
        return;
      }
      
      res.setHeader("Content-Type", "text/html");
      res.end(populatePage(user, "User settings", populate("user-settings", {
        displayName: user.displayName,
        email: user.email,
        color: user.color
      })));
    },
    POST: (req, path, form, res) => {
      if (!assertForm(form, [ "displayName", "email", "color" ])) {
        sendError(res, 400, "Form must have displayName, email, color");
        return;
      }
      
      const user = getSessionUser(req);
      
      if (!user) {
        sendError(res, 403, "Log in to change user settings");
        return;
      }
      
      if (form.displayName.length < 1 || form.displayName.length > 36) {
        res.statusCode = 400;
        sendAlert(res, user, "User settings", "Failed to change settings", "Display name must be between 1 and 36 characters.", "/user-settings");
        return;
      }
      
      if (form.email.length > 48) {
        res.statusCode = 400;
        sendAlert(res, user, "User settings", "Failed to change settings", "Email must be no more than 48 characters.", "/user-settings");
        return;
      }
      
      let color = parseInt(form.manualColor !== "" ? form.manualColor : form.color);
      if (Number.isNaN(color) || color < 0 || color > 359) {
        res.statusCode = 400;
        sendAlert(res, user, "User settings", "Failed to change settings", "Color must be between 0 and 359.", "/user-settings");
        return;
      }
      
      let stmt = db.prepare("UPDATE users SET displayName = ?, email = ?, color = ? WHERE id = ?");
      stmt.run(form.displayName, form.email, color, user.id);
      
      res.statusCode = 302;
      res.setHeader("Location", `/user/${user.username}`);
      res.end();
    }
  },
  "change-password": {
    GET: (req, path, res) => {
      const user = getSessionUser(req);
      
      if (!user) {
        res.statusCode = 403;
        sendAlert(res, user, "Change password", "Please log in", "Log in to change password.", "/");
        return;
      }
      
      res.setHeader("Content-Type", "text/html");
      res.end(populatePage(user, "Change password", populate("change-password")));
    },
    POST: async (req, path, form, res) => {
      if (!assertForm(form, [ "oldPassword", "newPassword", "confirmNewPassword" ])) {
        sendError(res, 400, "Form must have oldPassword, newPassword, confirmNewPassword");
        return;
      }
      
      const user = getSessionUser(req);
      
      if (!user) {
        sendError(res, 403, "Log in to change password");
        return;
      }
      
      if (!(await bcrypt.compare(form.oldPassword, user.passwordHash))) {
        res.statusCode = 400;
        sendAlert(res, user, "Change password", "Failed to change password", "Old password incorrect.", "/change-password");
        return;
      }
      
      if (form.newPassword !== form.confirmNewPassword) {
        res.statusCode = 400;
        sendAlert(res, user, "Change password", "Failed to change password", "New passwords do not match.", "/change-password");
        return;
      }
      
      if (bcrypt.truncates(form.newPassword)) {
        res.statusCode = 400;
        sendAlert(res, user, "Change password", "Failed to change password", "New password must be no more than 72 bytes.", "/change-password");
        return;
      }
      
      await changeUserPassword(user.id, form.newPassword);
      
      res.statusCode = 302;
      res.setHeader("Location", "/log-in");
      res.end();
    }
  }
};
