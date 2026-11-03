# WMM — Wiki Map Maker

WMM is a map editor for the Escape from Tarkov wiki. It loads map images from
`maps/`, lets you add zones, lines, arrows, and labels, then exports the result
as PNG, SVG, or a reusable WMM project.

## Getting started

Requirements: Node.js 20.19 or newer.

```bash
npm install
npm run dev
```

- Web interface: <http://localhost:5173>
- Local API: <http://localhost:4310>

To run the production build:

```bash
npm run build
npm start
```

The application and API are then available at <http://localhost:4310>.

## Maps

PNG, JPG, and WebP files in the repository's `maps/` directory are loaded into
the library. Older versions can be kept in `maps/archive/`; archived files are
not shown in the active library. After adding a map through a pull request,
click the refresh button in the interface.

Active map files use this naming convention:

```text
FR_<name>_v<version>.png
EN_<name>_v<version>.png
```

For example: `FR_Point_Zéro_v2.png` and `EN_Ground_Zero_v2.png`. The language
and version are detected automatically. The logical map name stays stable
between versions, so layers remain attached when the background is updated.

The repository includes a fictional example map, `Bois — exemple.png`.

## Editing

- Rectangle, ellipse, line, arrow, and text tools.
- Font selector, including the custom `Brunson` font in `fonts/`.
- Exact color presets, custom colors, optional fills, stroke width, and opacity.
- Selection, moving, and direct resizing on the map.
- Multi-selection with Shift.
- Layer visibility controls.
- Undo and redo.
- Automatic project saving in `data/projects/`.
- French and English interface, switchable from the header.

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| `V` | Select |
| `H` | Pan the view |
| `R` / `O` | Rectangle / ellipse |
| `L` / `A` | Line / arrow |
| `T` | Text |
| `Space` + drag | Pan the view |
| Mouse wheel | Zoom under the cursor |
| `Shift` while drawing | Constrain proportions or angle |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` | Redo |
| `Ctrl/Cmd + D` | Duplicate |
| `Delete` | Delete selection |
| `Ctrl/Cmd + S` | Save now |
| `0` | Fit map to view |

## Export

The **Export** dialog provides:

- **PNG**: full map at source resolution or 2× resolution, limited to 80 MP.
- **SVG**: vector layers with the background embedded, or layers only on a
  transparent background.
- **WMM**: editable layers saved as a `.wmm` file for batch import.

Hidden annotations are excluded from visual exports.

## Importing WMM projects

WMM projects can be imported in batches from the interface. A project file
should use the same logical map name and language as its target map, for
example:

```text
FR_Point_Zero_v2.wmm
EN_Point_Zero_v2.wmm
```

The `.wmm` file contains the editable annotations, including positions, colors,
text, and fonts. A flattened PNG cannot restore individual editable objects.

The HTTP import endpoint is:

```text
POST /api/projects/import
```

Imports are disabled by default. To enable them with a `.env` file:

```dotenv
WMM_IMPORT_ENABLED=true
```

The production start command automatically loads `.env` when it exists:

```bash
npm run build
npm start
```

The application only uses this variable to enable or disable the endpoint.
Never commit `.env` or private configuration files to the repository.

You can start from the provided [`.env.example`](./.env.example):

```bash
cp .env.example .env
npm start
```

## Data layout

```text
maps/                      Active map backgrounds
maps/archive/              Archived backgrounds, excluded from the library
data/projects/<id>.json    Saved projects, one per logical map
data/thumbs/               Automatically generated thumbnails
fonts/Brunson.ttf          Font available for text and exports
```

Projects are linked to a map by its logical name and language, not by its
background version. Changing `v1` to `v2` therefore keeps the existing layers.

## Stack

- Node.js, Express 5, TypeScript
- React 19, Vite
- Sharp for thumbnails and image dimensions
- Native SVG in the editor, Canvas 2D for PNG export

```bash
npm run typecheck
npm run build
npm run generate:example
```

## Project structure

```text
server/         Express API, map loading, and project storage
src/            React interface and editor
src/lib/        Annotation model, history, exports, and translations
scripts/        Example map generation
```
