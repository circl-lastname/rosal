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
      href: "/sign-up",
      icon: "contact-new",
      text: "Sign up"
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
      
      if (form.title.length > 48) {
        res.statusCode = 400;
        sendAlert(res, user, "Create thread", "Failed to create thread", "Title must be no more than 48 characters.", `/create-thread/${boardId}`);
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
      
      let threadStmt = db.prepare("SELECT threads.boardId, threads.userId, threads.title, boards.name, boards.role FROM threads JOIN boards ON threads.boardId = boards.id WHERE threads.id = ?");
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
      
      let repliesStmt = db.prepare("SELECT replies.id, replies.userId, replies.timestamp, replies.content, users.username, users.displayName, users.color, users.role FROM replies JOIN users ON replies.userId = users.id WHERE replies.threadId = ? ORDER BY replies.id ASC");
      let repliesData = repliesStmt.all(threadId);
      
      let buttons = "";
      
      buttons += populate("button", {
        href: `/board/${thread.boardId}`,
        icon: "go-previous",
        text: `Back to "${thread.name}"`
      });
      
      if (user) {
        buttons += populate("button", {
          href: `/reply/${threadId}`,
          icon: "mail-reply-sender",
          text: "Reply"
        });
        
        if (thread.userId === user.id || user.role >= 1) {
          buttons += populate("button", {
            href: `/delete-thread/${threadId}`,
            icon: "user-trash",
            text: "Delete"
          });
        }
      }
      
      let replies = "";
      
      for (let reply of repliesData) {
        let replyButtons = "";
        
        replyButtons += populate("button", {
          href: `/thread/${threadId}#reply-${reply.id}`,
          icon: "edit-paste",
          text: "Link"
        });
        
        if (user && (reply.userId === user.id || user.role >= 1)) {
          replyButtons += populate("button", {
            href: `/delete-reply/${reply.id}`,
            icon: "user-trash",
            text: "Delete"
          });
        }
        
        replies += populate("thread.reply", {
          id: reply.id,
          timestamp: formatTimestamp(reply.timestamp),
          content: reply.content.replaceAll("&", "&#38;")
                                .replaceAll("<", "&lt;")
                                .replaceAll(">", "&gt;")
                                .replaceAll('"', "&#34;")
                                .replaceAll("'", "&#39;")
                                .replaceAll("%", "&#37;")
                                .replaceAll("@", "&#64;")
                                .replaceAll("\r\n", "<br>"),
          username: reply.username,
          displayName: reply.displayName,
          color: reply.color,
          role: roleToString(reply.role),
          buttons: replyButtons
        });
      }
      
      res.setHeader("Content-Type", "text/html");
      res.end(populatePage(user, thread.title, populate("thread", {
        title: thread.title,
        buttons: buttons,
        replies: replies
      })));
    }
  },
  "delete-thread": {
    hasSubpages: true,
    GET: (req, path, res) => {
      if (path.length !== 2) {
        sendError(res, 404, "Thread not found");
        return;
      }
      
      const user = getSessionUser(req);
      
      if (!user) {
        res.statusCode = 403;
        sendAlert(res, user, "Delete thread", "Please log in", "Log in to delete threads.", "/");
        return;
      }
      
      let threadId = parseInt(path[1]);
      if (Number.isNaN(threadId)) {
        sendError(res, 404, "Thread not found");
        return;
      }
      
      let threadStmt = db.prepare("SELECT threads.userId, threads.title, boards.role FROM threads JOIN boards ON threads.boardId = boards.id WHERE threads.id = ?");
      let thread = threadStmt.get(threadId);
      
      if (!thread) {
        sendError(res, 404, "Thread not found");
        return;
      }
      
      if (thread.role > user.role || !(thread.userId === user.id || user.role >= 1)) {
        res.statusCode = 403;
        sendAlert(res, user, "Delete thread", "Forbidden", "This page is accessible only to higher roles.", "/");
        return;
      }
      
      res.setHeader("Content-Type", "text/html");
      res.end(populatePage(user, "Delete thread", populate("delete-thread", {
        title: thread.title
      })));
    },
    POST: (req, path, form, res) => {
      if (path.length !== 2) {
        sendError(res, 404, "Thread not found");
        return;
      }
      
      const user = getSessionUser(req);
      
      if (!user) {
        sendError(res, 403, "Log in to delete threads");
        return;
      }
      
      let threadId = parseInt(path[1]);
      if (Number.isNaN(threadId)) {
        sendError(res, 404, "Thread not found");
        return;
      }
      
      let threadStmt = db.prepare("SELECT threads.boardId, threads.userId, boards.role FROM threads JOIN boards ON threads.boardId = boards.id WHERE threads.id = ?");
      let thread = threadStmt.get(threadId);
      
      if (!thread) {
        sendError(res, 404, "Thread not found");
        return;
      }
      
      if (thread.role > user.role || !(thread.userId === user.id || user.role >= 1)) {
        sendError(res, 403, "This page is accessible only to higher roles");
        return;
      }
      
      let stmt = db.prepare("DELETE FROM threads WHERE id = ?");
      stmt.run(threadId);
      
      res.statusCode = 302;
      res.setHeader("Location", `/board/${thread.boardId}`);
      res.end();
    }
  },
  "reply": {
    hasSubpages: true,
    GET: (req, path, res) => {
      if (path.length !== 2) {
        sendError(res, 404, "Thread not found");
        return;
      }
      
      const user = getSessionUser(req);
      
      if (!user) {
        res.statusCode = 403;
        sendAlert(res, user, "Reply", "Please log in", "Log in to reply.", "/");
        return;
      }
      
      let threadId = parseInt(path[1]);
      if (Number.isNaN(threadId)) {
        sendError(res, 404, "Thread not found");
        return;
      }
      
      let stmt = db.prepare("SELECT threads.title, boards.role FROM threads JOIN boards ON threads.boardId = boards.id WHERE threads.id = ?");
      let thread = stmt.get(threadId);
      
      if (!thread) {
        sendError(res, 404, "Thread not found");
        return;
      }
      
      if (thread.role > user.role) {
        res.statusCode = 403;
        sendAlert(res, user, "Reply", "Forbidden", "This page is accessible only to higher roles.", "/");
        return;
      }
      
      res.setHeader("Content-Type", "text/html");
      res.end(populatePage(user, "Reply", populate("reply", {
        title: thread.title
      })));
    },
    POST: (req, path, form, res) => {
      if (path.length !== 2) {
        sendError(res, 404, "Thread not found");
        return;
      }
      
      if (!assertForm(form, [ "content" ])) {
        sendError(res, 400, "Form must have content");
        return;
      }
      
      const user = getSessionUser(req);
      
      if (!user) {
        sendError(res, 403, "Log in to reply");
        return;
      }
      
      let threadId = parseInt(path[1]);
      if (Number.isNaN(threadId)) {
        sendError(res, 404, "Thread not found");
        return;
      }
      
      let threadStmt = db.prepare("SELECT boards.role FROM threads JOIN boards ON threads.boardId = boards.id WHERE threads.id = ?");
      let thread = threadStmt.get(threadId);
      
      if (!thread) {
        sendError(res, 404, "Thread not found");
        return;
      }
      
      if (thread.role > user.role) {
        sendError(res, 403, "This page is accessible only to higher roles");
        return;
      }
      
      let timestamp = Math.floor(Date.now()/1000);
      
      let stmt = db.prepare("INSERT INTO replies (threadId, userId, timestamp, content) VALUES (?, ?, ?, ?)");
      stmt.run(threadId, user.id, timestamp, form.content);
      
      res.statusCode = 302;
      res.setHeader("Location", `/thread/${threadId}`);
      res.end();
    }
  },
  "delete-reply": {
    hasSubpages: true,
    GET: (req, path, res) => {
      if (path.length !== 2) {
        sendError(res, 404, "Reply not found");
        return;
      }
      
      const user = getSessionUser(req);
      
      if (!user) {
        res.statusCode = 403;
        sendAlert(res, user, "Delete reply", "Please log in", "Log in to delete replies.", "/");
        return;
      }
      
      let replyId = parseInt(path[1]);
      if (Number.isNaN(replyId)) {
        sendError(res, 404, "Reply not found");
        return;
      }
      
      let stmt = db.prepare("SELECT replies.threadId, replies.userId, replies.timestamp, replies.content, threads.title, boards.role AS boardRole, users.username, users.displayName, users.color, users.role FROM replies JOIN threads ON replies.threadId = threads.id JOIN boards ON threads.boardId = boards.id JOIN users ON replies.userId = users.id WHERE replies.id = ?");
      let reply = stmt.get(replyId);
      
      if (!reply) {
        sendError(res, 404, "Reply not found");
        return;
      }
      
      if (reply.boardRole > user.role || !(reply.userId === user.id || user.role >= 1)) {
        res.statusCode = 403;
        sendAlert(res, user, "Delete reply", "Forbidden", "This page is accessible only to higher roles.", "/");
        return;
      }
      
      res.setHeader("Content-Type", "text/html");
      res.end(populatePage(user, "Delete reply", populate("delete-reply", {
        title: reply.title,
        reply: populate("thread.reply", {
          id: replyId,
          timestamp: formatTimestamp(reply.timestamp),
          content: reply.content.replaceAll("&", "&#38;")
                                .replaceAll("<", "&lt;")
                                .replaceAll(">", "&gt;")
                                .replaceAll('"', "&#34;")
                                .replaceAll("'", "&#39;")
                                .replaceAll("%", "&#37;")
                                .replaceAll("@", "&#64;")
                                .replaceAll("\r\n", "<br>"),
          username: reply.username,
          displayName: reply.displayName,
          color: reply.color,
          role: roleToString(reply.role),
          buttons: populate("button", {
            href: `/thread/${reply.threadId}#reply-${replyId}`,
            icon: "edit-paste",
            text: "Link"
          })
        })
      })));
    },
    POST: (req, path, form, res) => {
      if (path.length !== 2) {
        sendError(res, 404, "Reply not found");
        return;
      }
      
      const user = getSessionUser(req);
      
      if (!user) {
        sendError(res, 403, "Log in to delete replies");
        return;
      }
      
      let replyId = parseInt(path[1]);
      if (Number.isNaN(replyId)) {
        sendError(res, 404, "Reply not found");
        return;
      }
      
      let replyStmt = db.prepare("SELECT replies.threadId, replies.userId, boards.role FROM replies JOIN threads ON replies.threadId = threads.id JOIN boards ON threads.boardId = boards.id WHERE replies.id = ?");
      let reply = replyStmt.get(replyId);
      
      if (!reply) {
        sendError(res, 404, "Reply not found");
        return;
      }
      
      if (reply.role > user.role || !(reply.userId === user.id || user.role >= 1)) {
        sendError(res, 403, "This page is accessible only to higher roles");
        return;
      }
      
      let stmt = db.prepare("DELETE FROM replies WHERE id = ?");
      stmt.run(replyId);
      
      res.statusCode = 302;
      res.setHeader("Location", `/thread/${reply.threadId}`);
      res.end();
    }
  }
};

Object.assign(pages, staticPages);
Object.assign(pages, userPages);
Object.assign(pages, controlPanelPages);
