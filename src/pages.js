import { getSessionUser } from "./auth.js";
import { controlPanelPages } from "./controlPanel.js";
import { db, roleToString } from "./db.js";
import { config, formatTimestamp, sendError } from "./index.js";
import { staticPages } from "./static.js";
import { populate } from "./template.js";
import { userManagementPages } from "./userManagement.js";

export function populatePage(user, pageName, content) {
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
    
    if (user.role >= 1) {
      buttons += populate("button", {
        href: "/control-panel",
        icon: "preferences-desktop",
        text: "Control panel"
      });
    }
    
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

export function sendAlert(res, user, pageName, title, message, href) {
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
      
      let role = user ? user.role : 0;
      
      let stmt = db.prepare("SELECT id, name, description FROM boards WHERE role <= ? ORDER BY displayOrder ASC");
      let boardsData = stmt.all(role);
      
      let boards = "";
      
      for (let board of boardsData) {
        boards += populate("front-page.board", {
          id: board.id,
          name: board.name,
          description: board.description
        });
      }
      
      res.setHeader("Content-Type", "text/html");
      res.end(populatePage(user, "Front page", populate("front-page", {
        boards: boards
      })));
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
            return populate("user.email", { email: reqUser.email });
          } else {
            return "";
          }
        })(),
        color: reqUser.color,
        role: roleToString(reqUser.role)
      })));
    }
  },
  "board": {
    hasSubpages: true,
    GET: (req, path, res) => {
      if (path.length !== 2) {
        sendError(res, 404, "Board not found");
        return;
      }
      
      const user = getSessionUser(req);
      
      let boardId = parseInt(path[1]);
      if (Number.isNaN(boardId)) {
        sendError(res, 404, "Board not found");
        return;
      }
      
      let board = db.prepare("SELECT name, role FROM boards WHERE id = ?").get(boardId);
      
      if (!board) {
        sendError(res, 404, "Board not found");
        return;
      }
      
      if (board.role > (user ? user.role : 0)) {
        res.statusCode = 403;
        sendAlert(res, user, "Board", "Forbidden", "This page is accessible only to higher roles.", "/");
        return;
      }
      
      // Paginate later
      let stmt = db.prepare("SELECT threads.id, threads.timestamp, threads.title, users.username, users.displayName, users.color FROM threads JOIN users ON threads.userID = users.id WHERE threads.boardId = ? ORDER BY threads.id DESC");
      let threadsData = stmt.all(boardId);
      
      let threads = "";
      
      for (let thread of threadsData) {
        threads += populate("board.thread", {
          id: thread.id,
          timestamp: formatTimestamp(thread.timestamp),
          title: thread.title,
          username: thread.username,
          displayName: thread.displayName,
          color: thread.color
        });
      }
      
      res.setHeader("Content-Type", "text/html");
      res.end(populatePage(user, board.name, populate("board", {
        name: board.name,
        threads: threads
      })));
    }
  }
};

Object.assign(pages, staticPages);
Object.assign(pages, userManagementPages);
Object.assign(pages, controlPanelPages);
