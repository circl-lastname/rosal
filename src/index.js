import * as fs from "node:fs";
import * as http from "node:http";
import * as https from "node:https";
import * as querystring from "node:querystring";

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
  host: "localhost:8080",
  useHttps: false,
  useSecureCookies: false,
  httpsKeyFile: null,
  httpsCertFile: null,
  // Environment
  dbFile: "db.sqlite"
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

export function formatTimestamp(timestamp) {
  const date = new Date(timestamp*1000);
  
  let month;
  
  switch (date.getUTCMonth()) {
    case 0:
      month = "Jan";
    break;
    case 1:
      month = "Feb";
    break;
    case 2:
      month = "Mar";
    break;
    case 3:
      month = "Apr";
    break;
    case 4:
      month = "May";
    break;
    case 5:
      month = "Jun";
    break;
    case 6:
      month = "Jul";
    break;
    case 7:
      month = "Aug";
    break;
    case 8:
      month = "Sep";
    break;
    case 9:
      month = "Oct";
    break;
    case 10:
      month = "Nov";
    break;
    case 11:
      month = "Dec";
    break;
  }
  
  return `${date.getUTCDate()} ${month} ${date.getUTCFullYear()} ${date.getUTCHours().toString().padStart(2, "0")}:${date.getUTCMinutes().toString().padStart(2, "0")}:${date.getUTCSeconds().toString().padStart(2, "0")} UTC`;
}

export function sendError(res, code, message) {
  res.statusCode = code;
  res.setHeader("Content-Type", "text/html");
  res.end(populate("error", { code: code, message: message }));
}

export function assertForm(form, fields) {
  for (let field of fields ) {
    if (typeof form[field] !== "string") {
      return false;
    }
  }
  
  return true;
}

function handleRequest(req, res) {
  res.setHeader("Server", "Rosal");
  
  if (req.headers["host"] !== config.host) {
    sendError(res, 400, `Host header must be ${config.host}`);
    return;
  }
  
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
        
        if (size > 20480) {
          req.destroy();
        }
        
        data += chunk.toString();
      });
      
      req.on("end", () => {
        pages[path[0]].POST(req, path, querystring.parse(data), res);
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

let server;

if (config.useHttps) {
  const options = {
    key: fs.readFileSync(config.httpsKeyFile, "utf8"),
    cert: fs.readFileSync(config.httpsCertFile, "utf8")
  }
  
  server = https.createServer(options, handleRequest);
  
  server.listen(config.port, () => {
    console.log(`Listening on port ${config.port} (HTTPS)`);
  });
} else {
  server = http.createServer(handleRequest);
  
  server.listen(config.port, () => {
    console.log(`Listening on port ${config.port} (HTTP)`);
  });
}
