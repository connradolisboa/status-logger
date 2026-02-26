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
var DEFAULT_SETTINGS = {
  includedFolders: [],
  includedTags: [],
  excludedFolders: [],
  excludedTags: []
};
var StatusHistoryPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.previousStatuses = /* @__PURE__ */ new Map();
    this.settings = { ...DEFAULT_SETTINGS };
  }
  async onload() {
    console.log("Status History Plugin loaded");
    await this.load_();
    this.addSettingTab(new StatusHistorySettingTab(this.app, this));
    this.app.workspace.onLayoutReady(() => {
      this.loadAllStatuses();
    });
    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        this.handleMetadataChange(file);
      })
    );
  }
  async load_() {
    const data = await this.loadData();
    if (data?.previousStatuses) {
      this.previousStatuses = new Map(Object.entries(data.previousStatuses));
    }
    if (data?.settings) {
      this.settings = { ...DEFAULT_SETTINGS, ...data.settings };
    }
  }
  async save() {
    await this.saveData({
      previousStatuses: Object.fromEntries(this.previousStatuses),
      settings: this.settings
    });
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
    await this.save();
  }
  isFileWatched(file) {
    const { includedFolders, includedTags, excludedFolders, excludedTags } = this.settings;
    const folderPath = file.parent?.path ?? "";
    const matchesFolder = (folders) => folders.some((f) => folderPath === f || folderPath.startsWith(f + "/"));
    const getFileTags = () => {
      const cache = this.app.metadataCache.getFileCache(file);
      const tags = /* @__PURE__ */ new Set();
      const fmTags = cache?.frontmatter?.tags;
      if (Array.isArray(fmTags)) fmTags.forEach((t) => tags.add(String(t)));
      else if (fmTags != null) tags.add(String(fmTags));
      cache?.tags?.forEach((t) => tags.add(t.tag.replace(/^#/, "")));
      return tags;
    };
    const matchesTags = (watchedTags) => {
      if (watchedTags.length === 0) return false;
      const fileTags = getFileTags();
      return watchedTags.some((t) => fileTags.has(t));
    };
    if (matchesFolder(excludedFolders) || matchesTags(excludedTags)) return false;
    if (includedFolders.length === 0 && includedTags.length === 0) return true;
    return matchesFolder(includedFolders) || matchesTags(includedTags);
  }
  async handleMetadataChange(file) {
    if (!this.isFileWatched(file)) return;
    const cache = this.app.metadataCache.getFileCache(file);
    const newStatus = cache?.frontmatter?.status;
    if (!newStatus) return;
    const previousStatus = this.previousStatuses.get(file.path);
    if (previousStatus === newStatus) return;
    this.previousStatuses.set(file.path, newStatus);
    await this.save();
    if (!previousStatus) return;
    await this.appendStatusHistory(file, newStatus);
  }
  async appendStatusHistory(file, newStatus) {
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const newEntry = { dateSet: today, statusSet: newStatus };
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      const history = Array.isArray(frontmatter.status_history) ? frontmatter.status_history : [];
      history.push(newEntry);
      frontmatter.status_history = history;
    });
    console.log(`Status History: logged "${newStatus}" for ${file.name}`);
  }
  onunload() {
    console.log("Status History Plugin unloaded");
  }
};
var StatusHistorySettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    this.renderListSection(
      containerEl,
      "Included Folders",
      "Log status changes only for files in these folders. Leave empty to include all files (unless excluded).",
      "e.g. Projects/Active",
      () => this.plugin.settings.includedFolders,
      async (val) => {
        this.plugin.settings.includedFolders.push(val);
        await this.plugin.save();
      },
      async (val) => {
        this.plugin.settings.includedFolders = this.plugin.settings.includedFolders.filter((f) => f !== val);
        await this.plugin.save();
      }
    );
    this.renderListSection(
      containerEl,
      "Included Tags",
      "Log status changes only for files with these tags. Leave empty to include all files (unless excluded).",
      "e.g. tracked",
      () => this.plugin.settings.includedTags,
      async (val) => {
        this.plugin.settings.includedTags.push(val);
        await this.plugin.save();
      },
      async (val) => {
        this.plugin.settings.includedTags = this.plugin.settings.includedTags.filter((t) => t !== val);
        await this.plugin.save();
      }
    );
    this.renderListSection(
      containerEl,
      "Excluded Folders",
      "Never log status changes for files in these folders. Exclusions take priority over inclusions.",
      "e.g. Archive",
      () => this.plugin.settings.excludedFolders,
      async (val) => {
        this.plugin.settings.excludedFolders.push(val);
        await this.plugin.save();
      },
      async (val) => {
        this.plugin.settings.excludedFolders = this.plugin.settings.excludedFolders.filter((f) => f !== val);
        await this.plugin.save();
      }
    );
    this.renderListSection(
      containerEl,
      "Excluded Tags",
      "Never log status changes for files with these tags. Exclusions take priority over inclusions.",
      "e.g. no-log",
      () => this.plugin.settings.excludedTags,
      async (val) => {
        this.plugin.settings.excludedTags.push(val);
        await this.plugin.save();
      },
      async (val) => {
        this.plugin.settings.excludedTags = this.plugin.settings.excludedTags.filter((t) => t !== val);
        await this.plugin.save();
      }
    );
  }
  renderListSection(containerEl, heading, description, placeholder, getItems, onAdd, onRemove) {
    containerEl.createEl("h3", { text: heading });
    containerEl.createEl("p", { text: description, cls: "setting-item-description" });
    const listEl = containerEl.createDiv();
    const renderList = () => {
      listEl.empty();
      for (const item of getItems()) {
        new import_obsidian.Setting(listEl).setName(item).addButton(
          (btn) => btn.setIcon("trash").setTooltip("Remove").onClick(async () => {
            await onRemove(item);
            renderList();
          })
        );
      }
    };
    renderList();
    let input;
    const addItem = async () => {
      const vals = input.getValue().split(",").map((v) => v.trim()).filter((v) => v && !getItems().includes(v));
      if (vals.length === 0) return;
      for (const val of vals) await onAdd(val);
      input.setValue("");
      renderList();
    };
    new import_obsidian.Setting(containerEl).addText((text) => {
      input = text;
      text.setPlaceholder(placeholder);
      text.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") addItem();
      });
    }).addButton((btn) => btn.setButtonText("Add").onClick(addItem));
  }
};
