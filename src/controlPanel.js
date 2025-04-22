import { getSessionUser } from "./auth.js";
import { db, roleToString } from "./db.js";
import { assertForm, sendError } from "./index.js";
import { populatePage, sendAlert } from "./pages.js";
import { populate } from "./template.js";

export const controlPanelPages = {
  "control-panel": {
    GET: (req, path, res) => {
      const user = getSessionUser(req);
      
      if (!user || user.role < 1) {
        res.statusCode = 403;
        sendAlert(res, user, "Control panel", "Forbidden", "This page is accessible only to moderators and administrators.", "/");
        return;
      }
      
      let buttons = "";
      
      if (user.role >= 2) {
        buttons += populate("button", {
          href: "/manage-boards",
          icon: "accessories-text-editor",
          text: "Manage boards"
        });
      }
      
      res.setHeader("Content-Type", "text/html");
      res.end(populatePage(user, "Control panel", populate("control-panel", {
        buttons: buttons
      })));
    }
  },
  "manage-boards": {
    GET: (req, path, res) => {
      const user = getSessionUser(req);
      
      if (!user || user.role < 2) {
        res.statusCode = 403;
        sendAlert(res, user, "Manage boards", "Forbidden", "This page is accessible only to administrators.", "/");
        return;
      }
      
      let stmt = db.prepare("SELECT id, displayOrder, name, role FROM boards ORDER BY displayOrder ASC");
      let boardsData = stmt.all();
      
      let boards = "";
      
      for (let board of boardsData) {
        boards += populate("manage-boards.board", {
          id: board.id,
          displayOrder: board.displayOrder,
          name: board.name,
          role: roleToString(board.role)
        });
      }
      
      res.setHeader("Content-Type", "text/html");
      res.end(populatePage(user, "Manage boards", populate("manage-boards", {
        boards: boards
      })));
    },
    POST: (req, path, form, res) => {
      const user = getSessionUser(req);
      
      if (!user || user.role < 2) {
        sendError(res, 403, "This page is accessible only to administrators");
        return;
      }
      
      let stmt = db.prepare("UPDATE boards SET displayOrder = ? WHERE id = ?");
      
      for (let key in form) {
        let boardId = parseInt(key);
        if (Number.isNaN(boardId)) {
          continue;
        }
        
        let displayOrder = parseInt(form[key]);
        if (Number.isNaN(displayOrder)) {
          continue;
        }
        
        stmt.run(displayOrder, boardId);
      }
      
      res.statusCode = 302;
      res.setHeader("Location", "/manage-boards");
      res.end();
    }
  },
  "create-board": {
    GET: (req, path, res) => {
      const user = getSessionUser(req);
      
      if (!user || user.role < 2) {
        res.statusCode = 403;
        sendAlert(res, user, "Create board", "Forbidden", "This page is accessible only to administrators.", "/");
        return;
      }
      
      res.setHeader("Content-Type", "text/html");
      res.end(populatePage(user, "Create board", populate("create-edit-board", {
        title: "Create board",
        name: "",
        description: "",
        selected0: "selected",
        selected1: "",
        selected2: "",
        submitText: "Create board"
      })));
    },
    POST: (req, path, form, res) => {
      if (!assertForm(form, [ "name", "description", "role" ])) {
        sendError(res, 400, "Form must have name, description, role");
        return;
      }
      
      const user = getSessionUser(req);
      
      if (!user || user.role < 2) {
        sendError(res, 403, "This page is accessible only to administrators");
        return;
      }
      
      let role = parseInt(form.role);
      if (Number.isNaN(role) || role < 0 || role > 2) {
        res.statusCode = 400;
        sendAlert(res, user, "Create board", "Failed to create board", "Role must be User, Moderator, or Administrator.", "/create-board");
        return;
      }
      
      let displayOrder = db.prepare("SELECT MAX(displayOrder) AS maxDisplayOrder FROM boards").get().maxDisplayOrder + 1;
      
      let stmt = db.prepare("INSERT INTO boards (displayOrder, name, description, role) VALUES (?, ?, ?, ?)");
      stmt.run(displayOrder, form.name, form.description, role);
      
      res.statusCode = 302;
      res.setHeader("Location", "/manage-boards");
      res.end();
    }
  },
  "edit-board": {
    hasSubpages: true,
    GET: (req, path, res) => {
      if (path.length !== 2) {
        sendError(res, 404, "Board not found");
        return;
      }
      
      const user = getSessionUser(req);
      
      if (!user || user.role < 2) {
        res.statusCode = 403;
        sendAlert(res, user, "Edit board", "Forbidden", "This page is accessible only to administrators.", "/");
        return;
      }
      
      let boardId = parseInt(path[1]);
      if (Number.isNaN(boardId)) {
        sendError(res, 404, "Board not found");
        return;
      }
      
      let stmt = db.prepare("SELECT name, description, role FROM boards WHERE id = ?");
      let board = stmt.get(boardId);
      
      if (!board) {
        sendError(res, 404, "Board not found");
        return;
      }
      
      res.setHeader("Content-Type", "text/html");
      res.end(populatePage(user, "Edit board", populate("create-edit-board", {
        title: "Edit board",
        name: board.name,
        description: board.description,
        // Why html???? Just let me set it in value="board.role"
        selected0: board.role === 0 ? "selected" : "",
        selected1: board.role === 1 ? "selected" : "",
        selected2: board.role === 2 ? "selected" : "",
        submitText: "Save"
      })));
    },
    POST: (req, path, form, res) => {
      if (path.length !== 2) {
        sendError(res, 404, "Board not found");
        return;
      }
      
      if (!assertForm(form, [ "name", "description", "role" ])) {
        sendError(res, 400, "Form must have name, description, role");
        return;
      }
      
      const user = getSessionUser(req);
      
      if (!user || user.role < 2) {
        sendError(res, 403, "This page is accessible only to administrators");
        return;
      }
      
      let boardId = parseInt(path[1]);
      if (Number.isNaN(boardId)) {
        sendError(res, 404, "Board not found");
        return;
      }
      
      if (!db.prepare("SELECT 1 FROM boards WHERE id = ?").get(boardId)) {
        sendError(res, 404, "Board not found");
        return;
      }
      
      let role = parseInt(form.role);
      if (Number.isNaN(role) || role < 0 || role > 2) {
        res.statusCode = 400;
        sendAlert(res, user, "Edit board", "Failed to edit board", "Role must be User, Moderator, or Administrator.", `/edit-board/${boardId}`);
        return;
      }
      
      let stmt = db.prepare("UPDATE boards SET name = ?, description = ?, role = ? WHERE id = ?");
      stmt.run(form.name, form.description, role, boardId);
      
      res.statusCode = 302;
      res.setHeader("Location", "/manage-boards");
      res.end();
    }
  },
  "delete-board": {
    hasSubpages: true,
    GET: (req, path, res) => {
      if (path.length !== 2) {
        sendError(res, 404, "Board not found");
        return;
      }
      
      const user = getSessionUser(req);
      
      if (!user || user.role < 2) {
        res.statusCode = 403;
        sendAlert(res, user, "Delete board", "Forbidden", "This page is accessible only to administrators.", "/");
        return;
      }
      
      let boardId = parseInt(path[1]);
      if (Number.isNaN(boardId)) {
        sendError(res, 404, "Board not found");
        return;
      }
      
      let stmt = db.prepare("SELECT name FROM boards WHERE id = ?");
      let board = stmt.get(boardId);
      
      if (!board) {
        sendError(res, 404, "Board not found");
        return;
      }
      
      res.setHeader("Content-Type", "text/html");
      res.end(populatePage(user, "Delete board", populate("delete-board", {
        name: board.name
      })));
    },
    POST: (req, path, form, res) => {
      if (path.length !== 2) {
        sendError(res, 404, "Board not found");
        return;
      }
      
      const user = getSessionUser(req);
      
      if (!user || user.role < 2) {
        sendError(res, 403, "This page is accessible only to administrators");
        return;
      }
      
      let boardId = parseInt(path[1]);
      if (Number.isNaN(boardId)) {
        sendError(res, 404, "Board not found");
        return;
      }
      
      if (!db.prepare("SELECT 1 FROM boards WHERE id = ?").get(boardId)) {
        sendError(res, 404, "Board not found");
        return;
      }
      
      let stmt = db.prepare("DELETE FROM boards WHERE id = ?");
      stmt.run(boardId);
      
      res.statusCode = 302;
      res.setHeader("Location", "/manage-boards");
      res.end();
    }
  }
};
