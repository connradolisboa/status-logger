# Status History

An [Obsidian](https://obsidian.md) plugin that automatically logs `status` frontmatter changes with timestamps, and lets you visualize status over time as a chart.

## Features

- **Automatic logging** — When a note's `status` frontmatter field changes, the plugin appends an entry to `status_history` with the new status and today's date.
- **Scoped tracking** — Include or exclude specific folders and tags to control which notes are tracked.
- **Chart insertion** — Insert a `dataviewjs` chart block that visualizes status history across multiple notes over time (requires [Dataview](https://github.com/blacksmithgu/obsidian-dataview) and [Obsidian Charts](https://github.com/phibr0/obsidian-charts)).

## How It Works

The plugin watches the metadata cache. When a file's `status` field changes (and the file is in scope), it appends a new entry to the note's `status_history` frontmatter list:

```yaml
status: Active
status_history:
  - dateSet: "2025-01-15"
    statusSet: Backlog
  - dateSet: "2025-03-02"
    statusSet: Active
```

The first time a status is seen for a note, no entry is logged (it becomes the baseline). Every subsequent change is recorded.

## Installation

1. Download `main.js` and `manifest.json` from the [latest release](https://github.com/connradolisboa/status-logger/releases).
2. Place them in your vault under `.obsidian/plugins/status-history/`.
3. Enable the plugin in **Settings → Community Plugins**.

## Usage

### Tracking status changes

Just set a `status` field in any note's frontmatter. The plugin tracks it automatically based on your filter settings.

Supported status values for the chart:

| Status | Chart level |
|---|---|
| Inactive | 1 |
| New | 1 |
| Cancelled | 1 |
| Backlog | 2 |
| Ongoing | 3 |
| Active | 4 |
| Done | 5 |

### Inserting a chart

Run the command **"Insert status chart"** from the command palette. A modal will appear where you can configure:

- **Folder** — Filter pages by a vault folder path (e.g. `Projects`).
- **Tags** — Filter pages by tags, comma-separated without `#` (e.g. `area, project`).
- **Period** — Time interval for the X axis: Week, Month, Quarter, or Year.
- **Start / End date** — Date range for the chart (`YYYY-MM-DD`).

The chart is inserted as a `dataviewjs` code block at the cursor position.

> **Requirements:** [Dataview](https://github.com/blacksmithgu/obsidian-dataview) and [Obsidian Charts](https://github.com/phibr0/obsidian-charts) must be installed and enabled.

### Chart behavior

- Each note is a line on the chart, colored by its `color` frontmatter field (Todoist color names supported, e.g. `blue`, `green`, `grape`).
- Notes created after a period's end are not shown for that period.
- Notes with no history yet show as `Inactive`.
- Point shapes distinguish `Inactive` (circle), `New` (triangle), and `Cancelled` (cross).

## Settings

Open **Settings → Status History** to configure:

### File Filters

| Setting | Description |
|---|---|
| Included Folders | Only track files inside these folders. Leave empty to track all files. |
| Included Tags | Only track files with these tags. Leave empty to track all files. |
| Excluded Folders | Never track files inside these folders. Takes priority over inclusions. |
| Excluded Tags | Never track files with these tags. Takes priority over inclusions. |

You can enter multiple values separated by commas, or add them one at a time.

### Chart Defaults

Default values pre-filled when opening the "Insert status chart" modal. These are also saved automatically each time you insert a chart.

## Notes

- The plugin uses `processFrontMatter` internally, so all edits go through Obsidian's frontmatter API and are non-destructive.
- The `previousStatuses` map is persisted in the plugin data file so status baselines survive vault restarts.

## License

ISC
