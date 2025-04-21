import { db, roleToString } from "./db.js";
import { config, sendError } from "./index.js";
import { handleStaticRequest } from "./static.js";
import { populate } from "./template.js";
import { createUser, logInUser, logOutUser, getSessionUser } from "./user.js";

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

export const pages = {
  "": {
    GET: (req, path, res) => {
      const user = getSessionUser(req);
      
      res.setHeader("Content-Type", "text/html");
      res.end(populatePage(user, "Front page", populate("alert", { title: "Welcome", message: "This site is a work in progress", href: "/" })));
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
      const user = getSessionUser(req);
      
      let sessionId = await logInUser(form.username, form.password);
      
      if (sessionId === false) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "text/html");
        res.end(populatePage(user, "Log in", populate("alert", {
          title: "Failed to log in",
          message: "Username or password incorrect.",
          href: "/log-in"
        })));
        return;
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
      
      res.setHeader("Content-Type", "text/html");
      res.end(populatePage(user, "Forgot password", populate("alert", {
        title: "Forgot password",
        message: `Please contact support at ${config.supportEmail} with your account's email, an admin will manually reset your password.`,
        href: "/log-in"
      })));
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
      const user = getSessionUser(req);
      
      if (form.username.length < 1 || form.username.length > 24) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "text/html");
        res.end(populatePage(user, "Register", populate("alert", {
          title: "Failed to register",
          message: "Username must be between 1 and 24 characters.",
          href: "/register"
        })));
        return;
      }
      
      const regex = /[^A-Za-z0-9_.-]/;
      if (regex.test(form.username)) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "text/html");
        res.end(populatePage(user, "Register", populate("alert", {
          title: "Failed to register",
          message: "Username must be alphanumeric and may have underscores, dots, and dashes.",
          href: "/register"
        })));
        return;
      }
      
      if (form.password !== form.confirmPassword) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "text/html");
        res.end(populatePage(user, "Register", populate("alert", {
          title: "Failed to register",
          message: "Passwords do not match.",
          href: "/register"
        })));
        return;
      }
      
      let sessionId = await createUser(form.username, form.email, form.password);
      
      if (sessionId === false) {
        res.statusCode = 409;
        res.setHeader("Content-Type", "text/html");
        res.end(populatePage(user, "Register", populate("alert", {
          title: "Failed to register",
          message: "A user with the given username already exists.",
          href: "/register"
        })));
      } else {
        res.statusCode = 302;
        res.setHeader("Location", "/");
        res.setHeader("Set-Cookie", `session=${sessionId}`);
        res.end();
      }
    }
  }
};
