import express from 'express'
import multer from 'multer'
import sharp from 'sharp'
import path from 'node:path'
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'

const ROOT = process.env.WMM_ROOT ? path.resolve(process.env.WMM_ROOT) : process.cwd()
const MAPS_DIR = path.join(ROOT, 'maps')
const FONTS_DIR = path.join(ROOT, 'fonts')
const DATA_DIR = path.join(ROOT, 'data')
const PROJECTS_DIR = path.join(DATA_DIR, 'projects')
const THUMBS_DIR = path.join(DATA_DIR, 'thumbs')
const CLIENT_DIR = path.join(ROOT, 'dist', 'client')
const PORT = Number(process.env.PORT ?? 4310)
const PROJECT_IMPORT_ENABLED = process.env.WMM_IMPORT_ENABLED === 'true'
const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp'])
const SUPPORTED_PROJECT_EXTENSION = '.wmm'
const SUPPORTED_FONT_FAMILIES = new Set(['IBM Plex Sans', 'Brunson', 'IBM Plex Mono'])

await Promise.all([
  fs.mkdir(MAPS_DIR, { recursive: true }),
  fs.mkdir(path.join(MAPS_DIR, 'archive'), { recursive: true }),
  fs.mkdir(FONTS_DIR, { recursive: true }),
  fs.mkdir(PROJECTS_DIR, { recursive: true }),
  fs.mkdir(THUMBS_DIR, { recursive: true }),
])

type MapRecord = {
  id: string
  file: string
  name: string
  locale: 'fr' | 'en'
  version: number
  mapKey: string
  width: number
  height: number
  url: string
  thumbUrl: string
  annotations: number
  updatedAt: string | null
}

type MapVersionRecord = {
  file: string
  name: string
  locale: 'fr' | 'en'
  version: number
  width: number
  height: number
  url: string
}

type StoredAnnotation = {
  id: string
  type: 'rect' | 'ellipse' | 'line' | 'arrow' | 'text'
  x: number
  y: number
  w: number
  h: number
  stroke: string
  fill: string | null
  fillOpacity: number
  strokeWidth: number
  opacity: number
  hidden: boolean
  text?: string
  fontSize?: number
  fontFamily?: string
}

type StoredProject = {
  version: 1
  map: string
  annotations: StoredAnnotation[]
  updatedAt: string
}

const metadataCache = new Map<string, { mtimeMs: number; width: number; height: number }>()
const projectUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 50 },
  fileFilter: (_request, file, callback) => {
    callback(null, path.extname(file.originalname).toLowerCase() === SUPPORTED_PROJECT_EXTENSION)
  },
})

function mapId(file: string): string {
  return createHash('sha1').update(mapIdentity(file)).digest('hex').slice(0, 16)
}

function projectPath(id: string): string {
  return path.join(PROJECTS_DIR, `${id}.json`)
}

function parseMapName(file: string): { locale: 'fr' | 'en'; baseName: string; version: number } {
  const stem = path.basename(file, path.extname(file))
  const match = /^(?:(FR|EN)_)?(.+?)(?:_v(\d+))?$/i.exec(stem)
  const locale = match?.[1]?.toLowerCase() === 'en' ? 'en' : 'fr'
  return {
    locale,
    baseName: (match?.[2] ?? stem).replace(/[-_]+/g, ' ').trim(),
    version: Number(match?.[3] ?? 1),
  }
}

function mapIdentity(file: string): string {
  const parsed = parseMapName(file)
  return `${parsed.locale}:${parsed.baseName.toLocaleLowerCase('fr')}`
}

function publicName(file: string): string {
  return parseMapName(file).baseName
}

async function readImageSize(filePath: string, mtimeMs: number) {
  const cached = metadataCache.get(filePath)
  if (cached?.mtimeMs === mtimeMs) return cached
  const metadata = await sharp(filePath).metadata()
  if (!metadata.width || !metadata.height) throw new Error(`Dimensions illisibles : ${filePath}`)
  const record = { mtimeMs, width: metadata.width, height: metadata.height }
  metadataCache.set(filePath, record)
  return record
}

async function readProject(id: string, legacyId?: string): Promise<StoredProject | null> {
  try {
    const raw = await fs.readFile(projectPath(id), 'utf8')
    const parsed = JSON.parse(raw) as StoredProject
    if (parsed.version !== 1 || !Array.isArray(parsed.annotations)) return null
    return parsed
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' && legacyId && legacyId !== id) {
      return readProject(legacyId)
    }
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

async function scanMaps(): Promise<MapRecord[]> {
  const entries = await fs.readdir(MAPS_DIR, { withFileTypes: true })
  const files = entries
    .filter((entry) => entry.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))

  const maps = await Promise.all(
    files.map(async (file): Promise<MapRecord | null> => {
      try {
        const fullPath = path.join(MAPS_DIR, file)
        const stat = await fs.stat(fullPath)
        const size = await readImageSize(fullPath, stat.mtimeMs)
        const id = mapId(file)
        const parsedName = parseMapName(file)
        const project = await readProject(id, createHash('sha1').update(file).digest('hex').slice(0, 16))
        return {
          id,
          file,
          name: publicName(file),
          locale: parsedName.locale,
          version: parsedName.version,
          mapKey: mapIdentity(file),
          width: size.width,
          height: size.height,
          url: `/maps/${encodeURIComponent(file)}`,
          thumbUrl: `/api/thumbs/${id}`,
          annotations: project?.annotations.length ?? 0,
          updatedAt: project?.updatedAt ?? null,
        }
      } catch (error) {
        console.warn(`[wmm] Carte ignorée : ${file}`, error)
        return null
      }
    }),
  )

  return maps.filter((map): map is MapRecord => map !== null)
}

async function scanArchiveVersions(map: MapRecord): Promise<MapVersionRecord[]> {
  const archiveDir = path.join(MAPS_DIR, 'archive')
  const entries = await fs.readdir(archiveDir, { withFileTypes: true })
  const versions: MapVersionRecord[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue
    if (mapIdentity(entry.name) !== map.mapKey) continue
    const relativeFile = path.join('archive', entry.name).split(path.sep).join('/')
    const fullPath = path.join(MAPS_DIR, relativeFile)
    const stat = await fs.stat(fullPath)
    const size = await readImageSize(fullPath, stat.mtimeMs)
    const parsedName = parseMapName(entry.name)
    versions.push({
      file: relativeFile,
      name: parsedName.baseName,
      locale: parsedName.locale,
      version: parsedName.version,
      width: size.width,
      height: size.height,
      url: `/maps/${relativeFile.split('/').map(encodeURIComponent).join('/')}`,
    })
  }
  return versions
}

async function findMap(id: string): Promise<MapRecord | null> {
  return (await scanMaps()).find((map) => map.id === id) ?? null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

function validateAnnotations(value: unknown): StoredAnnotation[] {
  if (!Array.isArray(value)) throw new Error('Le projet ne contient pas de liste d’annotations.')
  if (value.length > 2000) throw new Error('Trop d’annotations dans ce projet.')

  const ids = new Set<string>()
  return value.map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') throw new Error(`Annotation ${index + 1} invalide.`)
    const item = candidate as Record<string, unknown>
    const type = item.type
    if (!['rect', 'ellipse', 'line', 'arrow', 'text'].includes(String(type))) {
      throw new Error(`Type d’annotation inconnu (${String(type)}).`)
    }
    if (typeof item.id !== 'string' || !item.id || item.id.length > 80 || ids.has(item.id)) {
      throw new Error(`Identifiant d’annotation invalide (${index + 1}).`)
    }
    ids.add(item.id)
    if (!isFiniteNumber(item.x) || !isFiniteNumber(item.y) || !isFiniteNumber(item.w) || !isFiniteNumber(item.h)) {
      throw new Error(`Géométrie invalide (${index + 1}).`)
    }
    if (!isColor(item.stroke)) throw new Error(`Couleur invalide (${index + 1}).`)
    if (item.fill !== null && !isColor(item.fill)) throw new Error(`Remplissage invalide (${index + 1}).`)
    if (!isFiniteNumber(item.strokeWidth) || item.strokeWidth < 0 || item.strokeWidth > 100) {
      throw new Error(`Épaisseur invalide (${index + 1}).`)
    }
    if (!isFiniteNumber(item.opacity) || item.opacity < 0 || item.opacity > 1) {
      throw new Error(`Opacité invalide (${index + 1}).`)
    }
    if (!isFiniteNumber(item.fillOpacity) || item.fillOpacity < 0 || item.fillOpacity > 1) {
      throw new Error(`Opacité de remplissage invalide (${index + 1}).`)
    }

    const annotation: StoredAnnotation = {
      id: item.id,
      type: type as StoredAnnotation['type'],
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      stroke: item.stroke,
      fill: item.fill as string | null,
      fillOpacity: item.fillOpacity,
      strokeWidth: item.strokeWidth,
      opacity: item.opacity,
      hidden: item.hidden === true,
    }

    if (annotation.type === 'text') {
      annotation.text = typeof item.text === 'string' ? item.text.slice(0, 500) : ''
      annotation.fontSize = isFiniteNumber(item.fontSize) ? Math.min(Math.max(item.fontSize, 6), 300) : 28
      annotation.fontFamily =
        typeof item.fontFamily === 'string' && SUPPORTED_FONT_FAMILIES.has(item.fontFamily)
          ? item.fontFamily
          : 'IBM Plex Sans'
    }

    return annotation
  })
}

async function writeProject(id: string, map: MapRecord, annotations: StoredAnnotation[]): Promise<StoredProject> {
  const project: StoredProject = {
    version: 1,
    map: map.file,
    annotations,
    updatedAt: new Date().toISOString(),
  }

  const destination = projectPath(id)
  const temporary = `${destination}.${process.pid}.tmp`
  await fs.writeFile(temporary, JSON.stringify(project, null, 2), 'utf8')
  await fs.rename(temporary, destination)
  return project
}

function parseWmmProject(buffer: Buffer): { mapFile: string | null; annotations: StoredAnnotation[] } {
  let parsed: unknown
  try {
    parsed = JSON.parse(buffer.toString('utf8'))
  } catch {
    throw new Error('Un fichier .wmm n’est pas un JSON valide.')
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('Le fichier .wmm est invalide.')
  const candidate = parsed as Record<string, unknown>
  return {
    mapFile: typeof candidate.map === 'string' ? candidate.map : null,
    annotations: validateAnnotations(candidate.annotations),
  }
}

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '8mb' }))

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, version: 1 })
})

app.get('/api/maps', async (_request, response, next) => {
  try {
    response.json({ maps: await scanMaps() })
  } catch (error) {
    next(error)
  }
})

app.get('/api/maps/:id/project', async (request, response, next) => {
  try {
    const map = await findMap(request.params.id)
    if (!map) {
      response.status(404).json({ error: 'Carte introuvable.' })
      return
    }
    const project = await readProject(map.id)
    response.json(
      project ?? {
        version: 1,
        map: map.file,
        annotations: [],
        updatedAt: null,
      },
    )
  } catch (error) {
    next(error)
  }
})

app.get('/api/maps/:id/versions', async (request, response, next) => {
  try {
    const map = await findMap(request.params.id)
    if (!map) {
      response.status(404).json({ error: 'Carte introuvable.' })
      return
    }
    const current: MapVersionRecord = {
      file: map.file,
      name: map.name,
      locale: map.locale,
      version: map.version,
      width: map.width,
      height: map.height,
      url: map.url,
    }
    const archived = await scanArchiveVersions(map)
    response.json({ versions: [current, ...archived].sort((a, b) => b.version - a.version) })
  } catch (error) {
    next(error)
  }
})

app.put('/api/maps/:id/project', async (request, response, next) => {
  try {
    const map = await findMap(request.params.id)
    if (!map) {
      response.status(404).json({ error: 'Carte introuvable.' })
      return
    }
    let annotations: StoredAnnotation[]
    try {
      annotations = validateAnnotations(request.body?.annotations)
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : 'Projet invalide.' })
      return
    }
    const project = await writeProject(map.id, map, annotations)
    response.json({ project })
  } catch (error) {
    next(error)
  }
})

app.post(
  '/api/projects/import',
  (_request, response, next) => {
    if (!PROJECT_IMPORT_ENABLED) {
      response.status(404).json({ error: 'L’import de projets est désactivé sur ce serveur.' })
      return
    }
    next()
  },
  projectUpload.array('projects', 50),
  async (request, response, next) => {
    try {
      const files = request.files
      if (!Array.isArray(files) || files.length === 0) {
        response.status(400).json({ error: 'Aucun fichier .wmm fourni.' })
        return
      }
      const maps = await scanMaps()
      const imported: Array<{ file: string; map: string; annotations: number }> = []
      for (const file of files) {
        const parsed = parseWmmProject(file.buffer)
        const byProjectName = maps.find((map) => map.mapKey === mapIdentity(file.originalname))
        const byExplicitMap = parsed.mapFile ? maps.find((map) => map.file === parsed.mapFile) : null
        const map = byProjectName ?? byExplicitMap
        if (!map) throw new Error(`Aucune carte active ne correspond à « ${file.originalname} ».`)
        await writeProject(map.id, map, parsed.annotations)
        imported.push({ file: file.originalname, map: map.file, annotations: parsed.annotations.length })
      }
      response.json({ imported })
    } catch (error) {
      next(error)
    }
  },
)

app.get('/api/thumbs/:id', async (request, response, next) => {
  try {
    const map = await findMap(request.params.id)
    if (!map) {
      response.status(404).end()
      return
    }

    const source = path.join(MAPS_DIR, map.file)
    const cachePath = path.join(THUMBS_DIR, `${map.id}.webp`)
    const [sourceStat, cacheStat] = await Promise.all([
      fs.stat(source),
      fs.stat(cachePath).catch(() => null),
    ])

    if (!cacheStat || cacheStat.mtimeMs < sourceStat.mtimeMs) {
      await sharp(source)
        .rotate()
        .resize({ width: 640, height: 400, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 76 })
        .toFile(cachePath)
    }

    response.setHeader('Cache-Control', 'public, max-age=3600')
    response.sendFile(cachePath)
  } catch (error) {
    next(error)
  }
})

app.use('/maps', express.static(MAPS_DIR, { index: false, maxAge: '1h' }))
app.use('/fonts', express.static(FONTS_DIR, { index: false, maxAge: '1h' }))

if (await fs.stat(CLIENT_DIR).then(() => true).catch(() => false)) {
  app.use(express.static(CLIENT_DIR, { index: false }))
  app.use((request, response, next) => {
    if (request.method !== 'GET' || !request.accepts('html')) {
      next()
      return
    }
    response.sendFile(path.join(CLIENT_DIR, 'index.html'))
  })
}

app.use((_request, response) => {
  response.status(404).json({ error: 'Route introuvable.' })
})

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error('[wmm]', error)
  if (error instanceof multer.MulterError) {
    response.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Un fichier .wmm dépasse 8 Mo.' : 'Import .wmm invalide.' })
    return
  }
  const message = error instanceof Error ? error.message : 'Erreur interne.'
  response.status(500).json({ error: message })
})

app.listen(PORT, () => {
  console.log(`[wmm] Wiki Map Maker — http://localhost:${PORT}`)
})
