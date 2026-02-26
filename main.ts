import { App, Plugin, PluginSettingTab, Setting, TextComponent, TFile } from "obsidian";

interface StatusEntry {
  dateSet: string;
  statusSet: string;
}

interface PluginSettings {
  includedFolders: string[];
  includedTags: string[];
  excludedFolders: string[];
  excludedTags: string[];
}

interface PluginData {
  previousStatuses: Record<string, string>;
  settings: PluginSettings;
}

const DEFAULT_SETTINGS: PluginSettings = {
  includedFolders: [],
  includedTags: [],
  excludedFolders: [],
  excludedTags: [],
};

export default class StatusHistoryPlugin extends Plugin {
  private previousStatuses: Map<string, string> = new Map();
  settings: PluginSettings = { ...DEFAULT_SETTINGS };

  async onload() {
    console.log("Status History Plugin loaded");

    await this.load_();

    this.addSettingTab(new StatusHistorySettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      this.loadAllStatuses();
    });

    this.registerEvent(
      this.app.metadataCache.on("changed", (file: TFile) => {
        this.handleMetadataChange(file);
      })
    );
  }

  async load_() {
    const data: PluginData | null = await this.loadData();
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
      settings: this.settings,
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

  isFileWatched(file: TFile): boolean {
    const { includedFolders, includedTags, excludedFolders, excludedTags } = this.settings;

    const folderPath = file.parent?.path ?? "";
    const matchesFolder = (folders: string[]) =>
      folders.some((f) => folderPath === f || folderPath.startsWith(f + "/"));

    const getFileTags = (): Set<string> => {
      const cache = this.app.metadataCache.getFileCache(file);
      const tags = new Set<string>();
      const fmTags = cache?.frontmatter?.tags;
      if (Array.isArray(fmTags)) fmTags.forEach((t) => tags.add(String(t)));
      else if (fmTags != null) tags.add(String(fmTags));
      cache?.tags?.forEach((t) => tags.add(t.tag.replace(/^#/, "")));
      return tags;
    };

    const matchesTags = (watchedTags: string[]) => {
      if (watchedTags.length === 0) return false;
      const fileTags = getFileTags();
      return watchedTags.some((t) => fileTags.has(t));
    };

    // Exclusions take priority
    if (matchesFolder(excludedFolders) || matchesTags(excludedTags)) return false;

    // If no inclusions defined, include everything
    if (includedFolders.length === 0 && includedTags.length === 0) return true;

    return matchesFolder(includedFolders) || matchesTags(includedTags);
  }

  async handleMetadataChange(file: TFile) {
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

  async appendStatusHistory(file: TFile, newStatus: string) {
    const today = new Date().toISOString().split("T")[0];
    const newEntry: StatusEntry = { dateSet: today, statusSet: newStatus };

    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      const history: StatusEntry[] = Array.isArray(frontmatter.status_history)
        ? frontmatter.status_history
        : [];
      history.push(newEntry);
      frontmatter.status_history = history;
    });

    console.log(`Status History: logged "${newStatus}" for ${file.name}`);
  }

  onunload() {
    console.log("Status History Plugin unloaded");
  }
}

// ─── Settings Tab ────────────────────────────────────────────────────────────

class StatusHistorySettingTab extends PluginSettingTab {
  plugin: StatusHistoryPlugin;

  constructor(app: App, plugin: StatusHistoryPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
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

  private renderListSection(
    containerEl: HTMLElement,
    heading: string,
    description: string,
    placeholder: string,
    getItems: () => string[],
    onAdd: (val: string) => Promise<void>,
    onRemove: (val: string) => Promise<void>
  ) {
    containerEl.createEl("h3", { text: heading });
    containerEl.createEl("p", { text: description, cls: "setting-item-description" });

    const listEl = containerEl.createDiv();
    const renderList = () => {
      listEl.empty();
      for (const item of getItems()) {
        new Setting(listEl).setName(item).addButton((btn) =>
          btn
            .setIcon("trash")
            .setTooltip("Remove")
            .onClick(async () => {
              await onRemove(item);
              renderList();
            })
        );
      }
    };
    renderList();

    let input: TextComponent;
    const addItem = async () => {
      const vals = input.getValue().split(",").map((v) => v.trim()).filter((v) => v && !getItems().includes(v));
      if (vals.length === 0) return;
      for (const val of vals) await onAdd(val);
      input.setValue("");
      renderList();
    };

    new Setting(containerEl)
      .addText((text) => {
        input = text;
        text.setPlaceholder(placeholder);
        text.inputEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter") addItem();
        });
      })
      .addButton((btn) => btn.setButtonText("Add").onClick(addItem));
  }
}
