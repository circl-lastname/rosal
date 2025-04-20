import { config } from "./index.js";
import { populate } from "./template.js";

function populatePage(pageName, content) {
  return populate("main", {
    forumName: config.name,
    pageName: pageName,
    buttons: populate("button", { text: "Front page", href: "/", icon: "go-home.png" }),
    content: content
  });
}

export function handleFrontPage(req, path, res) {
  res.setHeader("Content-Type", "text/html");
  res.end(populatePage("Front page", populate("board-list")));
}
