import * as fs from "node:fs";
import * as http from "node:http";
import * as https from "node:https";

import { initDatabase } from "./db.js";
import { pages } from "./pages.js";
import { loadStaticFiles } from "./static.js";
import { loadTemplates, populate } from "./template.js";

export let config;

const defaultConfig = {
  // Customization
  name: "Rosal-based forum",
  supportEmail: "placeholder@example.com",
  // Protocol 
  port: 8080,
  useHttps: false,
  httpsKeyFile: null,
  httpsCertFile: null,
  // Environment
  logDir: "log",
  dbFile: "db.sqlite",
};

console.log("Rosal | Simple Old-School Forum Software");

try {
  config = JSON.parse(fs.readFileSync("config.json", "utf8"));
} catch (e) {
  if (e.code === "ENOENT") {
    config = defaultConfig;
    fs.writeFileSync("config.json", JSON.stringify(defaultConfig, null, 2));
    
    console.log("Initial config created - Welcome to Rosal!");
  } else {
    throw e;
  }
}

loadStaticFiles();
loadTemplates();
initDatabase();

export function sendError(res, code, message) {
  res.statusCode = code;
  res.setHeader("Content-Type", "text/html");
  res.end(populate("error", { code: code, message: message }));
}

function parseForm(data) {
  let fields = data.split("&");
  let form = {};
  
  for (let field of fields) {
    let keyValue = field.split("=");
    form[keyValue[0]] = decodeURIComponent(keyValue[1]);
  }
  
  return form;
}

function handleRequest(req, res) {
  res.setHeader("Server", "Rosal");
  
  let path;
  
  try {
    path = req.url.split("/").slice(1).map(decodeURIComponent);
  } catch {
    sendError(res, 400, "Malformed URL");
    return;
  }
  
  if (req.method !== "hasSubpages" && pages[path[0]]?.[req.method] && (pages[path[0]].hasSubpages || path.length == 1)) {
    if (req.method === "POST") {
      if (req.headers["content-type"] !== "application/x-www-form-urlencoded") {
        sendError(res, 415, "Must use application/x-www-form-urlencoded");
        return;
      }
      
      let data = "";
      let size = 0;
      
      req.on("data", (chunk) => {
        size += chunk.length;
        
        if (size > 102400) {
          sendError(res, 413, "Request bigger than 102400 bytes");
          return;
        }
        
        data += chunk.toString();
      });
      
      req.on("end", () => {
        pages[path[0]].POST(req, path, parseForm(data), res);
      });
      
      req.on("error", (e) => {
        try {
          sendError(res, 500, e.toString());
        } catch {}
      });
    } else {
      pages[path[0]][req.method](req, path, res);
    }
  } else {
    sendError(res, 404, "No such page");
  }
}

const server = http.createServer(handleRequest);

server.listen(config.port, () => {
  console.log(`Listening on port ${config.port} (HTTP)`);
});
