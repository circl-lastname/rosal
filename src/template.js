import * as fs from "node:fs";

let templates = {};

export function loadTemplates() {
  const files = fs.readdirSync("templates");
  
  for (let file of files) {
    templates[file.replace(/\.html$/, "")] = fs.readFileSync(`templates/${file}`, "utf8");
  }
}

export function populate(name, gaps) {
  if (!templates[name]) {
    throw new Error("Invalid template");
  }
  
  let template = templates[name];
  
  for (let gap in gaps) {
    let text = gaps[gap].toString().replaceAll("&", "&#38;")
                                   .replaceAll("<", "&lt;")
                                   .replaceAll(">", "&gt;")
                                   .replaceAll("\"", "&#34;")
                                   .replaceAll("'", "&#39;");
    
    template = template.replaceAll(`%%${gap}%%`, text);
  }
  
  return template;
}
