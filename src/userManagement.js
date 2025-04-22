import bcrypt from "bcryptjs";

import { changeUserPassword, createUser, getSessionUser, logInUser, logOutUser } from "./auth.js";
import { db, roleToString } from "./db.js";
import { assertForm, config, sendError } from "./index.js";
import { populatePage, sendAlert } from "./pages.js";
import { populate } from "./template.js";

export const userManagementPages = {
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
        res.setHeader("Set-Cookie", `session=${sessionId}`);
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
  "register": {
    GET: (req, path, res) => {
      const user = getSessionUser(req);
      
      res.setHeader("Content-Type", "text/html");
      res.end(populatePage(user, "Register", populate("register")));
    },
    POST: async (req, path, form, res) => {
      if (!assertForm(form, [ "username", "email", "password", "confirmPassword" ])) {
        sendError(res, 400, "Form must have username, email, password, confirmPassword");
        return;
      }
      
      const user = getSessionUser(req);
      
      if (form.username.length < 1 || form.username.length > 24) {
        res.statusCode = 400;
        sendAlert(res, user, "Register", "Failed to register", "Username must be between 1 and 24 characters.", "/register");
        return;
      }
      
      const regex = /[^a-z0-9_.-]/;
      if (regex.test(form.username)) {
        res.statusCode = 400;
        sendAlert(res, user, "Register", "Failed to register", "Username must be lowercase and may have digits, underscores, dots, and dashes.", "/register");
        return;
      }
      
      if (form.password !== form.confirmPassword) {
        res.statusCode = 400;
        sendAlert(res, user, "Register", "Failed to register", "Passwords do not match.", "/register");
        return;
      }
      
      if (bcrypt.truncates(form.password)) {
        res.statusCode = 400;
        sendAlert(res, user, "Register", "Failed to register", "Password must be no more than 72 bytes.", "/register");
        return;
      }
      
      let sessionId = await createUser(form.username, form.email, form.password);
      
      if (sessionId === false) {
        res.statusCode = 400;
        sendAlert(res, user, "Register", "Failed to register", "A user with the given username already exists.", "/register");
      } else {
        res.statusCode = 302;
        res.setHeader("Location", "/user-settings");
        res.setHeader("Set-Cookie", `session=${sessionId}`);
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
