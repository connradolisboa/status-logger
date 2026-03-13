import { App, Modal, Plugin, PluginSettingTab, Setting, TextComponent, TFile } from "obsidian";

interface StatusEntry {
  dateSet: string;
  statusSet: string;
}

type PeriodType = "week" | "month" | "quarter" | "year";

interface PluginSettings {
  includedFolders: string[];
  includedTags: string[];
  excludedFolders: string[];
  excludedTags: string[];
  overwriteSameDay: boolean;
  chartDefaults: {
    folder: string;
    tags: string;
    periodType: PeriodType;
    startDate: string;
    endDate: string;
  };
}

interface PluginData {
  previousStatuses: Record<string, string>;
  settings: PluginSettings;
}

const currentYear = new Date().getFullYear();

const DEFAULT_SETTINGS: PluginSettings = {
  includedFolders: [],
  includedTags: [],
  excludedFolders: [],
  excludedTags: [],
  overwriteSameDay: false,
  chartDefaults: {
    folder: "",
    tags: "",
    periodType: "month",
    startDate: `${currentYear}-01-01`,
    endDate: `${currentYear}-12-31`,
  },
};

export default class StatusHistoryPlugin extends Plugin {
  private previousStatuses: Map<string, string> = new Map();
  settings: PluginSettings = { ...DEFAULT_SETTINGS };

  async onload() {
    console.log("Status History Plugin loaded");

    await this.load_();

    this.addSettingTab(new StatusHistorySettingTab(this.app, this));

    this.addCommand({
      id: "insert-status-chart",
      name: "Insert status chart",
      editorCallback: () => {
        new InsertChartModal(this.app, this).open();
      },
    });

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
    if (data?.settings) {
      this.settings = {
        ...DEFAULT_SETTINGS,
        ...data.settings,
        // Deep-merge chartDefaults so new fields always get a default value
        chartDefaults: {
          ...DEFAULT_SETTINGS.chartDefaults,
          ...(data.settings.chartDefaults ?? {}),
        },
      };
    }
    if (data?.previousStatuses) {
      this.previousStatuses = new Map(Object.entries(data.previousStatuses));
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
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const newEntry: StatusEntry = { dateSet: today, statusSet: newStatus };

    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      const history: StatusEntry[] = Array.isArray(frontmatter.status_history)
        ? frontmatter.status_history
        : [];
      if (this.settings.overwriteSameDay && history.length > 0 && history[history.length - 1].dateSet === today) {
        history[history.length - 1] = newEntry;
      } else {
        history.push(newEntry);
      }
      frontmatter.status_history = history;
    });

    console.log(`Status History: logged "${newStatus}" for ${file.name}`);
  }

  onunload() {
    console.log("Status History Plugin unloaded");
  }
}

// ─── Chart Helpers ───────────────────────────────────────────────────────────

function buildPagesQuery(folder: string, tags: string[]): string {
  const parts: string[] = [];
  if (folder) parts.push(`"${folder}"`);
  tags.forEach((t) => parts.push(`#${t}`));
  return parts.join(" and ");
}

function generateChartCode(
  pagesQuery: string,
  periodType: PeriodType,
  startDate: string,
  endDate: string
): string {
  const pagesArg = pagesQuery ? JSON.stringify(pagesQuery) : '""';
  return `const todoistColors = {
  "berry_red":   "#b8256f",
  "red":         "#db4035",
  "orange":      "#ff9933",
  "yellow":      "#fad000",
  "olive_green": "#afb83b",
  "lime_green":  "#7ecc49",
  "green":       "#299438",
  "mint_green":  "#6accbc",
  "teal":        "#158fad",
  "sky_blue":    "#14aaf5",
  "light_blue":  "#96c3eb",
  "blue":        "#4073ff",
  "grape":       "#884dff",
  "violet":      "#af38eb",
  "lavender":    "#eb96eb",
  "magenta":     "#e05194",
  "salmon":      "#ff8d85",
  "charcoal":    "#808080",
  "grey":        "#b8b8b8",
  "taupe":       "#ccac93"
};

const statusMap = {
  "Inactive": 1, "New": 1, "Cancelled": 1,
  "Backlog": 2,
  "Ongoing": 3,
  "Active": 4,
  "Done": 5
};

const pointShapeMap = {
  "Inactive": "circle",
  "New": "triangle",
  "Cancelled": "cross"
};

const periodType = ${JSON.stringify(periodType)};
const start = new Date(${JSON.stringify(startDate)} + "T00:00:00");
const end = new Date(${JSON.stringify(endDate)} + "T00:00:00");

// Build periods array: { label, periodEnd }
const periods = [];
if (periodType === "month") {
  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const stop = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= stop) {
    const label = cur.toLocaleString("en-US", { month: "short", year: "numeric" });
    const periodEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
    periods.push({ label, periodEnd });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
} else if (periodType === "quarter") {
  let cur = new Date(start.getFullYear(), Math.floor(start.getMonth() / 3) * 3, 1);
  while (cur <= end) {
    const q = Math.floor(cur.getMonth() / 3) + 1;
    const label = \`Q\${q} \${cur.getFullYear()}\`;
    const periodEnd = new Date(cur.getFullYear(), cur.getMonth() + 3, 0);
    periods.push({ label, periodEnd });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 3, 1);
  }
} else if (periodType === "year") {
  let cur = new Date(start.getFullYear(), 0, 1);
  while (cur.getFullYear() <= end.getFullYear()) {
    const label = String(cur.getFullYear());
    const periodEnd = new Date(cur.getFullYear(), 11, 31);
    periods.push({ label, periodEnd });
    cur = new Date(cur.getFullYear() + 1, 0, 1);
  }
} else if (periodType === "week") {
  // Align to the Monday of the week containing startDate
  let cur = new Date(start);
  const day = cur.getDay();
  cur.setDate(cur.getDate() - (day === 0 ? 6 : day - 1));
  while (cur <= end) {
    const weekEnd = new Date(cur);
    weekEnd.setDate(weekEnd.getDate() + 6);
    // ISO week number
    const d = new Date(Date.UTC(cur.getFullYear(), cur.getMonth(), cur.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    const label = \`\${d.getUTCFullYear()}-W\${String(weekNum).padStart(2, "0")}\`;
    periods.push({ label, periodEnd: weekEnd });
    cur.setDate(cur.getDate() + 7);
  }
}

const labels = periods.map(p => p.label);

const pages = dv.pages(${pagesArg});
const datasets = [];

for (let page of pages) {
  const history = page.status_history;
  const createdDate = page.date ? new Date(page.date) : null;
  const rawColor = page.color ?? "charcoal";
  const color = todoistColors[rawColor] ?? rawColor;

  const sorted = (history && Array.isArray(history))
    ? history
        .map(e => ({ date: new Date(e.dateSet + "T00:00:00"), status: e.statusSet }))
        .sort((a, b) => a.date - b.date)
    : [];

  const data = [];
  const pointStyles = [];
  const pointRadii = [];

  periods.forEach(({ periodEnd }) => {
    if (createdDate && periodEnd < createdDate) {
      data.push(null);
      pointStyles.push("circle");
      pointRadii.push(0);
      return;
    }

    let currentStatus = null;
    for (let entry of sorted) {
      if (entry.date <= periodEnd) {
        currentStatus = entry.status;
      } else {
        break;
      }
    }

    if (currentStatus === null) currentStatus = "Inactive";

    data.push(statusMap[currentStatus] ?? null);
    pointStyles.push(pointShapeMap[currentStatus] ?? "circle");
    pointRadii.push(5);
  });

  datasets.push({
    label: page.file.name,
    data: data,
    borderColor: color,
    backgroundColor: color + "33",
    pointStyle: pointStyles,
    pointRadius: pointRadii,
    tension: 0.3,
    spanGaps: true,
  });
}

const chartData = {
  type: "line",
  data: { labels: labels, datasets: datasets },
  options: {
    responsive: true,
    scales: {
      y: {
        min: 1,
        max: 5,
        ticks: {
          stepSize: 1,
          callback: val => ["","Inactive/New/Cancelled","Backlog","Ongoing","Active","Done"][val] ?? ""
        }
      }
    },
    plugins: {
      legend: { position: "bottom" },
      tooltip: {
        callbacks: {
          label: ctx => {
            const statusLabels = ["","Inactive/New/Cancelled","Backlog","Ongoing","Active","Done"];
            return \`\${ctx.dataset.label}: \${statusLabels[ctx.raw] ?? "Unknown"}\`;
          }
        }
      }
    }
  }
};

window.renderChart(chartData, this.container);`;
}

// ─── Insert Chart Modal ───────────────────────────────────────────────────────

class InsertChartModal extends Modal {
  private plugin: StatusHistoryPlugin;
  private folder: string;
  private tags: string;
  private periodType: PeriodType;
  private startDate: string;
  private endDate: string;

  constructor(app: App, plugin: StatusHistoryPlugin) {
    super(app);
    this.plugin = plugin;
    this.folder = plugin.settings.chartDefaults.folder;
    this.tags = plugin.settings.chartDefaults.tags;
    this.periodType = plugin.settings.chartDefaults.periodType;
    this.startDate = plugin.settings.chartDefaults.startDate;
    this.endDate = plugin.settings.chartDefaults.endDate;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Insert Status Chart" });

    new Setting(contentEl)
      .setName("Folder")
      .setDesc("Filter pages by folder path (e.g. Management). Leave empty for all folders.")
      .addText((text) =>
        text.setValue(this.folder).onChange((val) => (this.folder = val))
      );

    new Setting(contentEl)
      .setName("Tags")
      .setDesc("Filter pages by tags, comma-separated without # (e.g. area, project). Leave empty for all tags.")
      .addText((text) =>
        text.setValue(this.tags).onChange((val) => (this.tags = val))
      );

    new Setting(contentEl)
      .setName("Period")
      .setDesc("The time interval for each data point on the X axis.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("week", "Week")
          .addOption("month", "Month")
          .addOption("quarter", "Quarter")
          .addOption("year", "Year")
          .setValue(this.periodType)
          .onChange((val) => (this.periodType = val as PeriodType))
      );

    new Setting(contentEl)
      .setName("Start date")
      .setDesc("Start of the date range (YYYY-MM-DD).")
      .addText((text) =>
        text.setValue(this.startDate).onChange((val) => (this.startDate = val))
      );

    new Setting(contentEl)
      .setName("End date")
      .setDesc("End of the date range (YYYY-MM-DD).")
      .addText((text) =>
        text.setValue(this.endDate).onChange((val) => (this.endDate = val))
      );

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("Insert")
          .setCta()
          .onClick(async () => {
            await this.insertChart();
            this.close();
          })
      )
      .addButton((btn) =>
        btn.setButtonText("Cancel").onClick(() => this.close())
      );
  }

  onClose() {
    this.contentEl.empty();
  }

  async insertChart() {
    this.plugin.settings.chartDefaults = {
      folder: this.folder,
      tags: this.tags,
      periodType: this.periodType,
      startDate: this.startDate,
      endDate: this.endDate,
    };
    await this.plugin.save();

    const editor = this.app.workspace.activeEditor?.editor;
    if (!editor) return;

    const tags = this.tags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t);
    const pagesQuery = buildPagesQuery(this.folder.trim(), tags);
    const chartCode = generateChartCode(pagesQuery, this.periodType, this.startDate, this.endDate);

    editor.replaceRange("```dataviewjs\n" + chartCode + "\n```", editor.getCursor());
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

    new Setting(containerEl)
      .setName("Overwrite same-day entries")
      .setDesc("When enabled, only the latest status change per day is kept instead of logging every change.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.overwriteSameDay).onChange(async (value) => {
          this.plugin.settings.overwriteSameDay = value;
          await this.plugin.save();
        })
      );

    containerEl.createEl("h3", { text: "Chart Defaults" });
    containerEl.createEl("p", {
      text: "Default values pre-filled when using the 'Insert status chart' command. Updated automatically when you insert a chart.",
      cls: "setting-item-description",
    });

    new Setting(containerEl)
      .setName("Default folder")
      .setDesc("Folder path to filter pages by (e.g. Management).")
      .addText((text) =>
        text
          .setPlaceholder("e.g. Management")
          .setValue(this.plugin.settings.chartDefaults.folder)
          .onChange(async (val) => {
            this.plugin.settings.chartDefaults.folder = val;
            await this.plugin.save();
          })
      );

    new Setting(containerEl)
      .setName("Default tags")
      .setDesc("Tags to filter pages by, comma-separated without # (e.g. area, project).")
      .addText((text) =>
        text
          .setPlaceholder("e.g. area, project")
          .setValue(this.plugin.settings.chartDefaults.tags)
          .onChange(async (val) => {
            this.plugin.settings.chartDefaults.tags = val;
            await this.plugin.save();
          })
      );

    new Setting(containerEl)
      .setName("Default period")
      .setDesc("The time interval for each data point.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("week", "Week")
          .addOption("month", "Month")
          .addOption("quarter", "Quarter")
          .addOption("year", "Year")
          .setValue(this.plugin.settings.chartDefaults.periodType)
          .onChange(async (val) => {
            this.plugin.settings.chartDefaults.periodType = val as PeriodType;
            await this.plugin.save();
          })
      );

    new Setting(containerEl)
      .setName("Default start date")
      .setDesc("Start of the date range (YYYY-MM-DD).")
      .addText((text) =>
        text
          .setPlaceholder(`${currentYear}-01-01`)
          .setValue(this.plugin.settings.chartDefaults.startDate)
          .onChange(async (val) => {
            this.plugin.settings.chartDefaults.startDate = val;
            await this.plugin.save();
          })
      );

    new Setting(containerEl)
      .setName("Default end date")
      .setDesc("End of the date range (YYYY-MM-DD).")
      .addText((text) =>
        text
          .setPlaceholder(`${currentYear}-12-31`)
          .setValue(this.plugin.settings.chartDefaults.endDate)
          .onChange(async (val) => {
            this.plugin.settings.chartDefaults.endDate = val;
            await this.plugin.save();
          })
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
