import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { UNITS, unitStatus, type DemoState } from './model'

export type System = 'architecture' | 'plumbing' | 'electrical' | 'hvac' | 'furniture'
export interface SceneOptions { floor: number; exploded: boolean; xray: boolean; plan: boolean; systems: Set<System>; selected: string; coloring: boolean; phase: number }
interface Batch { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial; transforms: THREE.Matrix4[]; units: string[]; floor: number; system: System }
const palette = { approved: '#7fba9c', blocked: '#dd8069', review: '#e5bf72', active: '#a6bcc1', planned: '#d1d7d2' }

/** Procedural demonstration geometry. No inferred or fabricated real project information. */
export class BuildingScene {
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  floors: THREE.Group[] = []
  roof = new THREE.Group()
  targets: THREE.InstancedMesh[] = []
  markers: { unit: string; group: THREE.Group; floor: number }[] = []
  private mats = new Map<string, THREE.MeshStandardMaterial>()
  private geos = new Map<string, THREE.BufferGeometry>()
  private batches = new Map<string, Batch>()
  private roomMeshes: { mesh: THREE.Mesh; unit: string; floor: number }[] = []
  private frameId = 0
  private resizeObserver: ResizeObserver
  private options: SceneOptions
  private pointerStart = new THREE.Vector2()
  private targetPosition: THREE.Vector3 | null = null
  private targetLook: THREE.Vector3 | null = null
  private selection = new THREE.Group()
  private disposed = false
  private host: HTMLElement
  count = 0
  onSelect: (id: string) => void
  onStats: (count: number, calls: number) => void
  constructor(host: HTMLElement, onSelect: (id: string) => void, onStats: (count: number, calls: number) => void, options: SceneOptions) {
    this.host = host
    this.onSelect = onSelect; this.onStats = onStats; this.options = options
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6))
    this.renderer.setClearColor('#e5eae7')
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.4
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.domElement.setAttribute('aria-label', 'Interactive six-storey apartment building. Drag to orbit, scroll to zoom, or select a unit from the unit list.')
    this.renderer.domElement.setAttribute('role', 'img')
    host.appendChild(this.renderer.domElement)
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 250)
    this.camera.position.set(44, 31, 44)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.set(0, 9, 0)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.075
    this.controls.maxPolarAngle = Math.PI / 2.04
    this.controls.minDistance = 5; this.controls.maxDistance = 115
    this.controls.addEventListener('start', this.cancelFlight)
    this.scene.add(new THREE.HemisphereLight('#f9fffc', '#7a847a', 2.4))
    const sun = new THREE.DirectionalLight('#fff0da', 3.2)
    sun.position.set(-22, 45, 24); sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 40, bottom: -30, far: 120 })
    sun.shadow.normalBias = 0.045; sun.shadow.bias = -0.0001
    this.scene.add(sun)
    const fill = new THREE.DirectionalLight('#cce2ec', 1.5); fill.position.set(24, 12, -24); this.scene.add(fill)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), this.material('ground', '#e5eae7'))
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.56; ground.receiveShadow = true; this.scene.add(ground)
    const grid = new THREE.GridHelper(130, 65, '#b5c2bc', '#cdd6d1'); grid.position.y = -0.54; this.scene.add(grid)
    for (let f = 0; f < 6; f++) { const g = new THREE.Group(); g.position.y = f * 3.6; this.floors.push(g); this.scene.add(g) }
    this.build()
    this.flush()
    this.scene.add(this.roof)
    this.roof.position.y = 21.6
    this.scene.add(this.selection)
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(6.85, 3.3, 7.1)), new THREE.LineBasicMaterial({ color: '#17765d', transparent: true, opacity: 0.9, depthTest: false }))
    outline.position.y = 1.65; outline.renderOrder = 4; this.selection.add(outline)
    this.resizeObserver = new ResizeObserver(this.resize); this.resizeObserver.observe(host)
    this.renderer.domElement.addEventListener('pointerdown', this.pointerDown)
    this.renderer.domElement.addEventListener('pointerup', this.pointerUp)
    this.resize(); this.update(options); this.animate()
  }
  private material(key: string, color: string, extra: THREE.MeshStandardMaterialParameters = {}) {
    if (!this.mats.has(key)) this.mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: .72, metalness: .05, ...extra }))
    return this.mats.get(key)!
  }
  private geometry(kind: string) {
    if (!this.geos.has(kind)) this.geos.set(kind, kind === 'cylinder' ? new THREE.CylinderGeometry(.5, .5, 1, 10) : kind === 'sphere' ? new THREE.SphereGeometry(.5, 10, 7) : kind === 'cone' ? new THREE.ConeGeometry(.5, 1, 7) : new THREE.BoxGeometry(1, 1, 1))
    return this.geos.get(kind)!
  }
  private piece(floor: number, system: System, unit: string, kind: string, mat: string, color: string, p: number[], s: number[], rotation?: THREE.Quaternion) {
    const key = `${floor}-${system}-${mat}-${kind}`
    if (!this.batches.has(key)) this.batches.set(key, { geometry: this.geometry(kind), material: this.material(mat, color, mat === 'glass' ? { transparent: true, opacity: .24, metalness: .2, roughness: .25, depthWrite: false } : mat === 'water' || mat === 'hot' ? { roughness: .3, metalness: .35 } : {}), transforms: [], units: [], floor, system })
    const batch = this.batches.get(key)!
    batch.transforms.push(new THREE.Matrix4().compose(new THREE.Vector3(...p), rotation || new THREE.Quaternion(), new THREE.Vector3(...s)))
    batch.units.push(unit); this.count++
  }
  private box(f: number, sys: System, u: string, mat: string, color: string, p: number[], s: number[]) { this.piece(f, sys, u, 'box', mat, color, p, s) }
  private pipe(f: number, sys: System, u: string, mat: string, color: string, points: number[][], radius = .07) {
    for (let i = 1; i < points.length; i++) {
      const a = new THREE.Vector3(...points[i - 1]), b = new THREE.Vector3(...points[i]), d = b.clone().sub(a)
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize())
      this.piece(f, sys, u, 'cylinder', mat, color, a.clone().add(b).multiplyScalar(.5).toArray(), [radius * 2, d.length(), radius * 2], q)
      this.piece(f, sys, u, 'sphere', mat, color, b.toArray(), [radius * 2.15, radius * 2.15, radius * 2.15])
    }
  }
  private build() {
    // Architectural shell and central circulation, including visible stair flights and lift doors.
    for (let f = 0; f < 6; f++) {
      this.box(f, 'architecture', '', 'slab', '#c4cbbf', [0, -.12, 0], [29.8, .24, 20])
      this.box(f, 'architecture', '', 'edge', '#eeeee3', [0, -.06, 10], [30.1, .22, .18])
      this.box(f, 'architecture', '', 'corridor', '#cdc8b8', [0, .015, 0], [28, .05, 3.4])
      for (const x of [-14, -7, 0, 7, 14]) for (const z of [-9, 9]) this.box(f, 'architecture', '', 'column', '#d9ded2', [x, 1.65, z], [.22, 3.4, .24])
      for (const z of [-9.1, 9.1]) this.box(f, 'architecture', '', 'beam', '#dddcd0', [0, 3.34, z], [28.4, .28, .25])
      for (const x of [-14, 14]) this.box(f, 'architecture', '', 'beam', '#dddcd0', [x, 3.34, 0], [.25, .28, 18.4])
      // End stairwell is deliberately cut open to show the flight.
      for (let j = 0; j < 16; j++) this.box(f, 'architecture', '', 'stair', '#b0b7ad', [-13.5 + j * .17, .15 + j * .2, 0], [.28, .2, 1.65])
      this.box(f, 'architecture', '', 'core', '#b5bcb4', [13.8, 1.6, 0], [.3, 3.2, 3.1])
      this.box(f, 'architecture', '', 'metal', '#72878a', [13.55, 1.2, 0], [.12, 2.4, 1.7])
      this.box(f, 'architecture', '', 'dark', '#465856', [13.47, 1.2, 0], [.06, 2.4, .04])
      // Service mains and distinct water risers.
      for (let i = 0; i < 4; i++) {
        const x = -10.5 + i * 7
        this.pipe(f, 'plumbing', '', 'water', '#3f8dbc', [[x, .1, -.6], [x, 3.6, -.6]], .11)
        this.pipe(f, 'plumbing', '', 'hot', '#c77951', [[x + .28, .1, -.6], [x + .28, 3.6, -.6]], .08)
      }
      this.pipe(f, 'plumbing', '', 'water', '#3f8dbc', [[-13.5, 2.8, -.6], [13.5, 2.8, -.6]], .1)
      this.pipe(f, 'plumbing', '', 'hot', '#c77951', [[-13.5, 2.8, -.3], [13.5, 2.8, -.3]], .08)
      this.box(f, 'hvac', '', 'duct', '#81a4a1', [0, 3, .6], [27.2, .32, .5])
      this.pipe(f, 'electrical', '', 'electrical', '#c5a553', [[-13, 2.95, 1.22], [13, 2.95, 1.22]], .07)
    }
    for (const u of UNITS) {
      const f = u.floor - 1, x = u.x, z = u.z, dir = z > 0 ? 1 : -1
      const slab = new THREE.Mesh(new THREE.BoxGeometry(6.7, .065, 7.05), new THREE.MeshStandardMaterial({ color: '#cdd9c9', roughness: .92 }))
      slab.position.set(x, .04, z); slab.receiveShadow = true; slab.userData.unit = u.id
      this.floors[f].add(slab); this.roomMeshes.push({ mesh: slab, unit: u.id, floor: f })
      // Unit dividing walls, low front cutaway, back glazing and timber privacy fins.
      this.box(f, 'architecture', u.id, 'wall', '#e6e5d9', [x - 3.45, 1.4, z], [.14, 2.8, 7.2])
      this.box(f, 'architecture', u.id, 'wall', '#e6e5d9', [x + 1, .6, z + dir * 1.1], [.12, 1.2, 4.9])
      this.box(f, 'architecture', u.id, 'wall', '#e6e5d9', [x - 1.1, .65, z - dir * 1.05], [4.3, 1.3, .12])
      this.box(f, 'architecture', u.id, 'lintel', '#cecdbd', [x, 2.9, z - dir * 3.5], [6.8, .3, .16])
      this.box(f, 'architecture', u.id, 'door', '#9e8a6c', [x + 2, 1.1, z - dir * 3.5], [.95, 2.2, .1])
      this.box(f, 'architecture', u.id, 'handle', '#4b5755', [x + 2.35, 1.05, z - dir * 3.43], [.035, .16, .06])
      for (let j = 0; j < 4; j++) {
        const wx = x - 2.55 + j * 1.7
        this.box(f, 'architecture', u.id, 'frame', '#526460', [wx, 1.7, z + dir * 3.65], [.055, 3.05, .07])
        if (dir < 0) this.box(f, 'architecture', u.id, 'glass', '#9cbdbe', [wx + .8, 1.7, z + dir * 3.65], [1.6, 2.9, .04])
      }
      // Balcony rail, deck and planters.
      this.box(f, 'architecture', u.id, 'balcony', '#bbb5a0', [x, .0, z + dir * 4.1], [6.9, .15, .85])
      this.box(f, 'architecture', u.id, 'glass', '#9cbdbe', [x, .58, z + dir * 4.5], [6.8, 1.0, .04])
      this.box(f, 'architecture', u.id, 'rail', '#516763', [x, 1.09, z + dir * 4.5], [6.8, .055, .055])
      for (let j = 0; j < 5; j++) this.box(f, 'architecture', u.id, 'rail', '#516763', [x - 3.35 + j * 1.675, .58, z + dir * 4.5], [.035, 1, .035])
      // Bedroom: bed, pillows, bedside tables and a rug.
      this.box(f, 'furniture', u.id, 'rug', '#b1b6a2', [x + 2, .1, z + dir * 1.3], [2.45, .025, 3.2])
      this.box(f, 'furniture', u.id, 'wood', '#ad9575', [x + 2, .27, z + dir * 1.5], [1.75, .35, 2.25])
      this.box(f, 'furniture', u.id, 'linen', '#f0eee0', [x + 2, .5, z + dir * 1.5], [1.72, .22, 2.2])
      this.box(f, 'furniture', u.id, 'blanket', f % 2 ? '#7e9b90' : '#7e9b90', [x + 2, .63, z + dir * 1.9], [1.74, .07, 1.2])
      for (const dx of [-.43, .43]) this.box(f, 'furniture', u.id, 'linen', '#f0eee0', [x + 2 + dx, .66, z + dir * .8], [.65, .15, .42])
      this.box(f, 'furniture', u.id, 'wood', '#ad9575', [x + 3.1, .35, z + dir * .8], [.38, .55, .5])
      // Living room sofa, cushions and table.
      this.box(f, 'furniture', u.id, 'sofa', '#a1afa3', [x - 1.8, .4, z + dir * 2.3], [2.5, .65, .9])
      this.box(f, 'furniture', u.id, 'sofa', '#a1afa3', [x - 1.8, .78, z + dir * 2.65], [2.5, .6, .2])
      for (const dx of [-.8, 0, .8]) this.box(f, 'furniture', u.id, 'cushion', '#c6cbbb', [x - 1.8 + dx, .78, z + dir * 2.3], [.67, .13, .6])
      this.box(f, 'furniture', u.id, 'wood', '#ad9575', [x - 1.7, .36, z + dir * .8], [1.35, .09, .7])
      for (const dx of [-.5, .5]) this.box(f, 'furniture', u.id, 'dark', '#465856', [x - 1.7 + dx, .2, z + dir * .8], [.07, .3, .5])
      // Kitchen cabinets, worktop, sink and four-burner hob.
      this.box(f, 'furniture', u.id, 'cabinet', '#b5b09a', [x - 2.7, .53, z - dir * 2.2], [.9, .9, 2.3])
      this.box(f, 'furniture', u.id, 'counter', '#eeeee5', [x - 2.7, 1.01, z - dir * 2.2], [1, .075, 2.4])
      this.box(f, 'furniture', u.id, 'sink', '#83948e', [x - 2.7, 1.06, z - dir * 1.7], [.65, .03, .65])
      this.box(f, 'furniture', u.id, 'dark', '#465856', [x - 2.7, 1.06, z - dir * 2.65], [.65, .035, .65])
      for (const dx of [-.17, .17]) for (const dz of [-.17, .17]) this.piece(f, 'furniture', u.id, 'cylinder', 'metal', '#72878a', [x - 2.7 + dx, 1.1, z - dir * 2.65 + dz], [.19, .03, .19])
      // Bathroom fixtures and tiled wet wall.
      this.box(f, 'furniture', u.id, 'tile', '#c6d5cd', [x, .12, z - dir * 2.2], [2.2, .05, 2.4])
      this.piece(f, 'furniture', u.id, 'sphere', 'porcelain', '#f3f2e8', [x - .55, .37, z - dir * 2.1], [.62, .6, .83])
      this.box(f, 'furniture', u.id, 'porcelain', '#f3f2e8', [x - .55, .62, z - dir * 2.5], [.55, .55, .26])
      this.box(f, 'furniture', u.id, 'counter', '#eeeee5', [x + .45, .85, z - dir * 2.75], [.8, .18, .55])
      this.pipe(f, 'furniture', u.id, 'metal', '#72878a', [[x + .45, .95, z - dir * 2.9], [x + .45, 1.17, z - dir * 2.9], [x + .45, 1.17, z - dir * 2.7]], .023)
      // Water distribution, waste branches, valve bodies and handles.
      for (let j = 0; j < 2; j++) {
        const px = x + j * .22, mat = j ? 'hot' : 'water', color = j ? '#c77951' : '#3f8dbc'
        this.pipe(f, 'plumbing', u.id, mat, color, [[px, 2.8, -.6 + j * .3], [px, 2.8, z - dir * 2.85], [px, .78, z - dir * 2.85], [x + .45, .78, z - dir * 2.85]], .055)
        this.pipe(f, 'plumbing', u.id, mat, color, [[px, 1, z - dir * 2.85], [x - 2.7, 1, z - dir * 2.85], [x - 2.7, 1, z - dir * 1.7]], .045)
        this.piece(f, 'plumbing', u.id, 'cylinder', 'valve', '#c3ac63', [px, 1.5, z - dir * 2.85], [.2, .18, .2])
        this.box(f, 'plumbing', u.id, mat, color, [px, 1.52, z - dir * 2.7], [.3, .05, .05])
      }
      this.pipe(f, 'plumbing', u.id, 'waste', '#7d7892', [[x - .55, .28, z - dir * 2.1], [x - .55, .28, z - dir * 3.0], [x - .55, .28, dir * 1.2]], .1)
      // Duct branch, diffusers, cable trays, sockets and light fixtures.
      this.box(f, 'hvac', u.id, 'duct', '#81a4a1', [x + 1.15, 2.92, z / 2], [.3, .24, Math.abs(z)])
      for (const dx of [-1.7, 2]) {
        this.box(f, 'hvac', u.id, 'duct', '#81a4a1', [x + (dx + 1.15) / 2, 2.92, z + dir * .7], [Math.abs(dx - 1.15), .22, .25])
        this.box(f, 'hvac', u.id, 'vent', '#5e7d7b', [x + dx, 2.77, z + dir * .7], [.65, .06, .45])
        for (let j = 0; j < 4; j++) this.box(f, 'hvac', u.id, 'porcelain', '#f3f2e8', [x + dx, 2.73, z + dir * .7 - .15 + j * .1], [.6, .02, .035])
      }
      this.pipe(f, 'electrical', u.id, 'electrical', '#c5a553', [[x + 2.7, 2.95, 1.22], [x + 2.7, 2.95, z], [x + 2.7, .4, z]], .04)
      for (const dx of [-1.8, 2]) {
        this.piece(f, 'electrical', u.id, 'cylinder', 'light', '#eedba6', [x + dx, 2.88, z + dir * 1.4], [.45, .07, .45])
        this.box(f, 'electrical', u.id, 'outlet', '#e4dfc3', [x + dx, .45, z - dir * 1.15], [.16, .22, .08])
      }
    }
    // Plinth, landscape, street furniture and rooftop services.
    this.box(-1, 'architecture', '', 'plinth', '#bac2b8', [0, -.33, 0], [35, .35, 24])
    this.box(-1, 'architecture', '', 'path', '#d3d6c8', [0, -.42, 15], [40, .15, 4])
    for (const x of [-19, 19]) for (const z of [-11, 0, 11]) {
      this.box(-1, 'architecture', '', 'planter', '#a4ad9f', [x, -.1, z], [2.3, .65, 2.3])
      this.piece(-1, 'architecture', '', 'cylinder', 'trunk', '#897659', [x, 1.35, z], [.2, 2.8, .2])
      this.piece(-1, 'architecture', '', 'sphere', 'leaves', '#6f8d67', [x, 3.1, z], [3.5, 4.1, 3.5])
      this.piece(-1, 'architecture', '', 'sphere', 'leaves2', '#829974', [x + .5, 4.0, z + .25], [2.7, 2.7, 2.7])
    }
    for (const x of [-8, 8]) {
      this.box(-1, 'architecture', '', 'wood', '#ad9575', [x, .1, 15], [3, .2, .6])
      for (const dx of [-1.1, 1.1]) this.box(-1, 'architecture', '', 'dark', '#465856', [x + dx, -.13, 15], [.1, .4, .6])
    }
    this.box(6, 'architecture', '', 'roof', '#c7ccbc', [0, .05, 0], [30, .18, 20])
    for (const x of [-14.8, 14.8]) this.box(6, 'architecture', '', 'wall', '#e6e5d9', [x, .35, 0], [.15, .6, 20])
    for (const z of [-9.9, 9.9]) this.box(6, 'architecture', '', 'wall', '#e6e5d9', [0, .35, z], [30, .6, .15])
    for (let j = 0; j < 4; j++) {
      this.box(6, 'hvac', '', 'plant', '#9aa9a0', [-9 + j * 3, .7, -4], [2.15, 1.15, 3])
      for (let k = 0; k < 2; k++) this.piece(6, 'hvac', '', 'cylinder', 'fan', '#435c5c', [-9 + j * 3, 1.3, -4.6 + k * 1.2], [.85, .07, .85])
    }
    for (let j = 0; j < 8; j++) this.box(6, 'architecture', '', 'solar', '#456375', [-10 + (j % 4) * 3, .45, 3 + Math.floor(j / 4) * 2.4], [2.7, .12, 1.9])
    for (const x of [8, 13]) for (const z of [-3, 5]) this.box(6, 'architecture', '', 'wood', '#ad9575', [x, 1.35, z], [.13, 2.6, .13])
    for (let j = 0; j < 12; j++) this.box(6, 'architecture', '', 'wood', '#ad9575', [7.7 + j * .51, 2.7, 1], [.12, .18, 8.6])
    for (const x of [8, 12]) this.box(6, 'architecture', '', 'leaves', '#6f8d67', [x, .35, 7.3], [2.5, .45, 1.2])
  }
  private flush() {
    for (const b of this.batches.values()) {
      const mesh = new THREE.InstancedMesh(b.geometry, b.material, b.transforms.length)
      b.transforms.forEach((m, i) => mesh.setMatrixAt(i, m))
      mesh.userData = { units: b.units, system: b.system, floor: b.floor }
      mesh.castShadow = !b.material.transparent; mesh.receiveShadow = true
      if (b.floor === -1) this.scene.add(mesh)
      else if (b.floor === 6) this.roof.add(mesh)
      else this.floors[b.floor].add(mesh)
      this.targets.push(mesh)
    }
    this.batches.clear()
  }
  setState(state: DemoState) {
    for (const r of this.roomMeshes) {
      delete r.mesh.userData.customColor
      const status = unitStatus(state, r.unit)
      r.mesh.userData.status = status
      ;(r.mesh.material as THREE.MeshStandardMaterial).color.set(this.options.coloring ? palette[status] : '#d4d6c6')
    }
    for (const m of this.markers) { this.scene.remove(m.group); m.group.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose() } }) }
    this.markers = []
    const flagged = UNITS.filter(u => ['blocked', 'review'].includes(unitStatus(state, u.id))).slice(0, 10)
    for (const u of flagged) {
      const status = unitStatus(state, u.id), group = new THREE.Group()
      const material = new THREE.MeshStandardMaterial({ color: palette[status], emissive: palette[status], emissiveIntensity: .3, roughness: .4 })
      const ball = new THREE.Mesh(new THREE.SphereGeometry(.3, 14, 10), material)
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .8, 6), material.clone()); stem.position.y = -.55
      ball.userData.unit = u.id; stem.userData.unit = u.id
      group.add(ball, stem); group.position.set(u.x, (u.floor - 1) * 3.6 + 2, u.z + 3)
      this.scene.add(group); this.markers.push({ unit: u.id, group, floor: u.floor - 1 })
    }
    this.update(this.options)
  }
  /** Presentation adapter for the new workspace's independent status dimensions. */
  setAppearance(rooms: Record<string, { color: string; marker?: boolean }>) {
    for (const r of this.roomMeshes) {
      r.mesh.userData.customColor = rooms[r.unit]?.color || '#e2e8f0'
    }
    for (const m of this.markers) {
      this.scene.remove(m.group)
      m.group.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose() } })
    }
    this.markers = []
    for (const u of UNITS.filter(u => rooms[u.id]?.marker)) {
      const group = new THREE.Group(), color = rooms[u.id].color
      const material = new THREE.MeshStandardMaterial({ color, roughness: .4 })
      const ball = new THREE.Mesh(new THREE.SphereGeometry(.3, 14, 10), material)
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .8, 6), material.clone())
      stem.position.y = -.55; ball.userData.unit = u.id; stem.userData.unit = u.id
      group.add(ball, stem); group.position.set(u.x, (u.floor - 1) * 3.6 + 2, u.z + 3)
      this.scene.add(group); this.markers.push({ unit: u.id, group, floor: u.floor - 1 })
    }
    this.update(this.options)
  }
  update(options: SceneOptions) {
    this.options = options
    for (let i = 0; i < 6; i++) {
      const g = this.floors[i]; g.visible = (!options.floor || options.floor === i + 1) && i < options.phase
      g.position.y = options.floor ? 0 : i * (options.exploded ? 6.4 : 3.6)
      for (const child of g.children) if (child instanceof THREE.InstancedMesh) child.visible = options.systems.has(child.userData.system)
    }
    this.roof.visible = !options.floor && !options.exploded && !options.xray && options.phase === 6
    for (const child of this.roof.children) child.visible = options.systems.has(child.userData.system)
    for (const [key, mat] of this.mats) if (['wall', 'column', 'beam', 'lintel'].includes(key)) {
      mat.transparent = options.xray; mat.opacity = options.xray ? .14 : 1; mat.depthWrite = !options.xray
    }
    for (const r of this.roomMeshes) (r.mesh.material as THREE.MeshStandardMaterial).color.set(options.coloring ? r.mesh.userData.customColor || palette[r.mesh.userData.status as keyof typeof palette] || '#d4d6c6' : '#d4d6c6')
    for (const m of this.markers) {
      m.group.visible = (!options.floor || options.floor === m.floor + 1) && m.floor < options.phase
      m.group.position.y = (options.floor ? 0 : m.floor * (options.exploded ? 6.4 : 3.6)) + 2
    }
    const unit = UNITS.find(u => u.id === options.selected)
    this.selection.visible = !!unit && (!options.floor || options.floor === unit.floor) && unit.floor <= options.phase
    if (unit) this.selection.position.set(unit.x, options.floor ? 0 : (unit.floor - 1) * (options.exploded ? 6.4 : 3.6), unit.z)
  }
  frame(plan = this.options.plan) {
    const single = !!this.options.floor, exploded = this.options.exploded
    this.fly(plan ? [0, single ? 42 : 66, .01] : single ? [30, 30, 34] : exploded ? [53, 42, 53] : [44, 31, 44], [0, single ? 0 : exploded ? 16 : 9, 0])
  }
  focus(id: string) {
    const u = UNITS.find(v => v.id === id); if (!u) return
    const y = this.options.floor ? 0 : (u.floor - 1) * (this.options.exploded ? 6.4 : 3.6)
    this.fly([u.x + 9, y + 8, u.z + (u.z > 0 ? 12 : -12)], [u.x, y + 1, u.z])
  }
  zoom(factor: number) { this.camera.position.sub(this.controls.target).multiplyScalar(factor).add(this.controls.target); this.controls.update() }
  snapshot() { this.renderer.render(this.scene, this.camera); return this.renderer.domElement.toDataURL('image/png') }
  private fly(position: number[], look: number[]) { this.targetPosition = new THREE.Vector3(...position); this.targetLook = new THREE.Vector3(...look) }
  private cancelFlight = () => { this.targetPosition = null; this.targetLook = null }
  private pointerDown = (e: PointerEvent) => { this.pointerStart.set(e.clientX, e.clientY) }
  private pointerUp = (e: PointerEvent) => {
    if (this.pointerStart.distanceTo(new THREE.Vector2(e.clientX, e.clientY)) > 5) return
    const rect = this.renderer.domElement.getBoundingClientRect(), ray = new THREE.Raycaster()
    ray.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1), this.camera)
    const hits = ray.intersectObjects([...this.targets, ...this.roomMeshes.map(r => r.mesh), ...this.markers.map(m => m.group)], true)
    for (const hit of hits) {
      let visible = true; for (let p: THREE.Object3D | null = hit.object; p; p = p.parent) if (!p.visible) visible = false
      if (!visible) continue
      const id = hit.object.userData.unit || (hit.instanceId !== undefined ? hit.object.userData.units?.[hit.instanceId] : undefined)
      if (id) { this.onSelect(id); return }
    }
  }
  private resize = () => {
    const w = this.host.clientWidth, h = this.host.clientHeight
    if (!w || !h) return
    this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix()
  }
  private animate = () => {
    if (this.disposed) return
    this.frameId = requestAnimationFrame(this.animate)
    if (this.targetPosition && this.targetLook) {
      this.camera.position.lerp(this.targetPosition, .075); this.controls.target.lerp(this.targetLook, .075)
      if (this.camera.position.distanceTo(this.targetPosition) < .02) this.cancelFlight()
    }
    this.controls.update(); this.renderer.render(this.scene, this.camera)
    if (this.onStats) { this.onStats(this.count, this.renderer.info.render.calls); this.onStats = null as unknown as typeof this.onStats }
  }
  dispose() {
    this.disposed = true; cancelAnimationFrame(this.frameId); this.resizeObserver.disconnect(); this.controls.dispose()
    this.renderer.domElement.removeEventListener('pointerdown', this.pointerDown); this.renderer.domElement.removeEventListener('pointerup', this.pointerUp)
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>()
    this.scene.traverse(o => { if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) { geometries.add(o.geometry); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)) } })
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); this.renderer.dispose(); this.renderer.domElement.remove()
  }
}
