"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => StatusHistoryPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var StatusHistoryPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    // Track previous status values to detect changes
    this.previousStatuses = /* @__PURE__ */ new Map();
  }
  async onload() {
    console.log("Status History Plugin loaded");
    this.app.workspace.onLayoutReady(() => {
      this.loadAllStatuses();
    });
    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        this.handleMetadataChange(file);
      })
    );
  }
  async loadAllStatuses() {
    const files = this.app.vault.getMarkdownFiles();
    for (const file of files) {
      const cache = this.app.metadataCache.getFileCache(file);
      const status = cache?.frontmatter?.status;
      if (status) {
        this.previousStatuses.set(file.path, status);
      }
    }
  }
  async handleMetadataChange(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    const newStatus = cache?.frontmatter?.status;
    if (!newStatus) return;
    const previousStatus = this.previousStatuses.get(file.path);
    if (previousStatus === newStatus) return;
    this.previousStatuses.set(file.path, newStatus);
    if (!previousStatus) return;
    await this.appendStatusHistory(file, newStatus);
  }
  async appendStatusHistory(file, newStatus) {
    const content = await this.app.vault.read(file);
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const newEntry = {
      dateSet: today,
      statusSet: newStatus
    };
    const hasFrontmatter = content.startsWith("---");
    if (!hasFrontmatter) return;
    const endOfFrontmatter = content.indexOf("---", 3);
    if (endOfFrontmatter === -1) return;
    const frontmatterStr = content.slice(3, endOfFrontmatter).trim();
    const body = content.slice(endOfFrontmatter + 3);
    let frontmatter;
    try {
      frontmatter = (0, import_obsidian.parseYaml)(frontmatterStr) ?? {};
    } catch {
      console.error("Status History: could not parse frontmatter for", file.path);
      return;
    }
    const history = Array.isArray(frontmatter.status_history) ? frontmatter.status_history : [];
    history.push(newEntry);
    frontmatter.status_history = history;
    const newFrontmatter = (0, import_obsidian.stringifyYaml)(frontmatter).trim();
    const newContent = `---
${newFrontmatter}
---${body}`;
    await this.app.vault.modify(file, newContent);
    console.log(`Status History: logged "${newStatus}" for ${file.name}`);
  }
  onunload() {
    console.log("Status History Plugin unloaded");
  }
};
