import { getSessionUser } from "./auth.js";
import { controlPanelPages } from "./controlPanel.js";
import { db, roleToString } from "./db.js";
import { assertForm, config, formatTimestamp, sendError } from "./index.js";
import { staticPages } from "./static.js";
import { populate } from "./template.js";
import { userPages } from "./user.js";

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
      let stmt = db.prepare("SELECT threads.id, threads.timestamp, threads.title, users.username, users.displayName, users.color FROM threads JOIN users ON threads.userId = users.id WHERE threads.boardId = ? ORDER BY threads.id DESC");
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
        createThread: (() => {
          if (user) {
            return populate("board.create-thread", { id: boardId });
          } else {
            return "";
          }
        })(),
        threads: threads
      })));
    }
  },
  "create-thread": {
    hasSubpages: true,
    GET: (req, path, res) => {
      if (path.length !== 2) {
        sendError(res, 404, "Board not found");
        return;
      }
      
      const user = getSessionUser(req);
      
      if (!user) {
        res.statusCode = 403;
        sendAlert(res, user, "Create thread", "Please log in", "Log in to create threads.", "/");
        return;
      }
      
      let boardId = parseInt(path[1]);
      if (Number.isNaN(boardId)) {
        sendError(res, 404, "Board not found");
        return;
      }
      
      let stmt = db.prepare("SELECT name, role FROM boards WHERE id = ?");
      let board = stmt.get(boardId);
      
      if (!board) {
        sendError(res, 404, "Board not found");
        return;
      }
      
      if (board.role > user.role) {
        res.statusCode = 403;
        sendAlert(res, user, "Create thread", "Forbidden", "This page is accessible only to higher roles.", "/");
        return;
      }
      
      res.setHeader("Content-Type", "text/html");
      res.end(populatePage(user, "Create thread", populate("create-thread", {
        name: board.name
      })));
    },
    POST: (req, path, form, res) => {
      if (path.length !== 2) {
        sendError(res, 404, "Board not found");
        return;
      }
      
      if (!assertForm(form, [ "title", "content" ])) {
        sendError(res, 400, "Form must have title, content");
        return;
      }
      
      const user = getSessionUser(req);
      
      if (!user) {
        sendError(res, 403, "Log in to create threads");
        return;
      }
      
      let boardId = parseInt(path[1]);
      if (Number.isNaN(boardId)) {
        sendError(res, 404, "Board not found");
        return;
      }
      
      let boardStmt = db.prepare("SELECT role FROM boards WHERE id = ?");
      let board = boardStmt.get(boardId);
      
      if (!board) {
        sendError(res, 404, "Board not found");
        return;
      }
      
      if (board.role > user.role) {
        sendError(res, 403, "This page is accessible only to higher roles");
        return;
      }
      
      let timestamp = Math.floor(Date.now()/1000);
      
      let threadStmt = db.prepare("INSERT INTO threads (boardId, userId, timestamp, title) VALUES (?, ?, ?, ?)");
      let info = threadStmt.run(boardId, user.id, timestamp, form.title);
      
      let replyStmt = db.prepare("INSERT INTO replies (threadId, userId, timestamp, content) VALUES (?, ?, ?, ?)");
      replyStmt.run(info.lastInsertRowid, user.id, timestamp, form.content);
      
      res.statusCode = 302;
      res.setHeader("Location", `/thread/${info.lastInsertRowid}`);
      res.end();
    }
  },
  "thread": {
    hasSubpages: true,
    GET: (req, path, res) => {
      if (path.length !== 2) {
        sendError(res, 404, "Thread not found");
        return;
      }
      
      const user = getSessionUser(req);
      
      let threadId = parseInt(path[1]);
      if (Number.isNaN(threadId)) {
        sendError(res, 404, "Thread not found");
        return;
      }
      
      let threadStmt = db.prepare("SELECT threads.title, threads.boardId, boards.name, boards.role FROM threads JOIN boards ON threads.boardId = boards.id WHERE threads.id = ?");
      let thread = threadStmt.get(threadId);
      
      if (!thread) {
        sendError(res, 404, "Thread not found");
        return;
      }
      
      if (thread.role > (user ? user.role : 0)) {
        res.statusCode = 403;
        sendAlert(res, user, "Thread", "Forbidden", "This page is accessible only to higher roles.", "/");
        return;
      }
      
      let repliesStmt = db.prepare("SELECT replies.timestamp, replies.content, users.username, users.displayName, users.color, users.role FROM replies JOIN users ON replies.userId = users.id WHERE replies.threadId = ? ORDER BY replies.id ASC");
      let repliesData = repliesStmt.all(threadId);
      
      let buttons = "";
      
      buttons += populate("button", {
        href: `/board/${thread.boardId}`,
        icon: "go-previous",
        text: `Back to "${thread.name}"`
      });
      
      let replies = "";
      
      for (let reply of repliesData) {
        replies += populate("thread.reply", {
          timestamp: formatTimestamp(reply.timestamp),
          content: reply.content,
          username: reply.username,
          displayName: reply.displayName,
          color: reply.color,
          role: roleToString(reply.role)
        });
      }
      
      res.setHeader("Content-Type", "text/html");
      res.end(populatePage(user, thread.title, populate("thread", {
        title: thread.title,
        buttons: buttons,
        replies: replies
      })));
    }
  }
};

Object.assign(pages, staticPages);
Object.assign(pages, userPages);
Object.assign(pages, controlPanelPages);
