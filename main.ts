import { App, Plugin, TFile, parseYaml, stringifyYaml } from "obsidian";

interface StatusEntry {
  dateSet: string;
  statusSet: string;
}

export default class StatusHistoryPlugin extends Plugin {
  // Track previous status values to detect changes
  private previousStatuses: Map<string, string> = new Map();

  async onload() {
    console.log("Status History Plugin loaded");

    // Load initial statuses for all open files
    this.app.workspace.onLayoutReady(() => {
      this.loadAllStatuses();
    });

    // Watch for metadata changes (property edits)
    this.registerEvent(
      this.app.metadataCache.on("changed", (file: TFile) => {
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

  async handleMetadataChange(file: TFile) {
    const cache = this.app.metadataCache.getFileCache(file);
    const newStatus = cache?.frontmatter?.status;

    if (!newStatus) return;

    const previousStatus = this.previousStatuses.get(file.path);

    // Only act if status actually changed
    if (previousStatus === newStatus) return;

    // Update our tracked status
    this.previousStatuses.set(file.path, newStatus);

    // Skip if this is the first time we're seeing this file
    if (!previousStatus) return;

    await this.appendStatusHistory(file, newStatus);
  }

  async appendStatusHistory(file: TFile, newStatus: string) {
    const content = await this.app.vault.read(file);
    const today = new Date().toISOString().split("T")[0];

    const newEntry: StatusEntry = {
      dateSet: today,
      statusSet: newStatus,
    };

    // Check if frontmatter exists
    const hasFrontmatter = content.startsWith("---");
    if (!hasFrontmatter) return;

    const endOfFrontmatter = content.indexOf("---", 3);
    if (endOfFrontmatter === -1) return;

    const frontmatterStr = content.slice(3, endOfFrontmatter).trim();
    const body = content.slice(endOfFrontmatter + 3);

    let frontmatter: Record<string, unknown>;
    try {
      frontmatter = parseYaml(frontmatterStr) ?? {};
    } catch {
      console.error("Status History: could not parse frontmatter for", file.path);
      return;
    }

    // Append to existing history or create new array
    const history: StatusEntry[] = Array.isArray(frontmatter.status_history)
      ? frontmatter.status_history
      : [];

    history.push(newEntry);
    frontmatter.status_history = history;

    const newFrontmatter = stringifyYaml(frontmatter).trim();
    const newContent = `---\n${newFrontmatter}\n---${body}`;

    await this.app.vault.modify(file, newContent);
    console.log(`Status History: logged "${newStatus}" for ${file.name}`);
  }

  onunload() {
    console.log("Status History Plugin unloaded");
  }
}