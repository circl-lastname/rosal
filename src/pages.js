import bcrypt from "bcryptjs";

import { db, roleToString } from "./db.js";
import { config, assertForm, sendError } from "./index.js";
import { handleStaticRequest } from "./static.js";
import { populate } from "./template.js";
import { createUser, logInUser, logOutUser, changeUserPassword, getSessionUser } from "./user.js";

function populatePage(user, pageName, content) {
  let buttons = "";
  
  buttons += populate("button", {
    href: "/",
    icon: "go-home",
    text: "Front page"
  });
  
  if (!user) {
    buttons += populate("button", {
      href: "/log-in",
      icon: "system-users",
      text: "Log in"
    });
    
    buttons += populate("button", {
      href: "/register",
      icon: "contact-new",
      text: "Register"
    });
  } else {
    buttons += populate("button", {
      href: `/user/${user.username}`,
      icon: "system-users",
      text: user.displayName
    });
    
    buttons += populate("button", {
      href: "/user-settings",
      icon: "preferences-system",
      text: "User settings"
    });
    
    buttons += populate("button", {
      href: "/log-out",
      icon: "system-log-out",
      text: "Log out"
    });
  }
  
  return populate("main", {
    forumName: config.name,
    pageName: pageName,
    buttons: buttons,
    content: content
  });
}

function sendAlert(res, user, pageName, title, message, href) {
  res.setHeader("Content-Type", "text/html");
  res.end(populatePage(user, pageName, populate("alert", {
    title: title,
    message: message,
    href: href
  })));
}

export const pages = {
  "": {
    GET: (req, path, res) => {
      const user = getSessionUser(req);
      sendAlert(res, user, "Front page", "Welcome", "This site is a work in progress", "/");
    }
  },
  "static": {
    hasSubpages: true,
    GET: handleStaticRequest
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
  "change-password": {
    GET: (req, path, res) => {
      const user = getSessionUser(req);
      
      if (!user) {
        res.statusCode = 403;
        sendAlert(res, user, "User settings", "Please log in", "Log in to change password.", "/");
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
      res.setHeader("Location", `/log-in`);
      res.end();
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
      
      let color = parseInt(form.color);
      if (!color || color < 0 || color > 360) {
        res.statusCode = 400;
        sendAlert(res, user, "User settings", "Failed to change settings", "Color must be between 0 and 360.", "/user-settings");
        return;
      }
      
      let stmt = db.prepare("UPDATE users SET displayName = ?, email = ?, color = ? WHERE id = ?");
      stmt.run(form.displayName, form.email, color, user.id);
      
      res.statusCode = 302;
      res.setHeader("Location", `/user/${user.username}`);
      res.end();
    }
  },
  "user": {
    hasSubpages: true,
    GET: (req, path, res) => {
      if (path.length !== 2) {
        sendError(res, 404, "User not found");
        return;
      }
      
      const user = getSessionUser(req);
      
      let stmt = db.prepare("SELECT id, displayName, email, color, role FROM users WHERE username = ?");
      let reqUser = stmt.get(path[1]);
      
      if (!reqUser) {
        sendError(res, 404, "User not found");
        return;
      }
      
      res.setHeader("Content-Type", "text/html");
      res.end(populatePage(user, reqUser.displayName, populate("user", {
        username: path[1],
        displayName: reqUser.displayName,
        email: (() => {
          if (user && user.role >= 1) {
            return populate("user-email", { email: reqUser.email });
          } else {
            return "";
          }
        })(),
        color: reqUser.color,
        role: roleToString(reqUser.role)
      })));
    }
  }
};
