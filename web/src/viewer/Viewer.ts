/**
 * SiteViewer: framework-free three.js viewer with a small command/event API so it can be embedded
 * anywhere (React page today; a Flutter WebView or native shell later via viewer/bridge.ts).
 *
 * Commands: loadLayers, setElementState, setVisible, setColors, select, flyTo, frame, getViewpoint,
 *           setSection, setWalkMode, pick, setMarkers, snapshot, dispose
 * Events:   select(elementId | null), pick({elementId, point}), marker(id), walkchange(on)
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { SELECTION_COLOR } from "./colors";
import { DIRECTIONS, fitBounds, type ViewDirection } from "./spatialMath";
import { applyDisplayOffset } from "./explosion";

export interface LayerData {
  discipline: string;
  context: boolean;
  data: ArrayBuffer;
}

export interface Viewpoint {
  position: [number, number, number];
  target: [number, number, number];
  section?: SectionBox | null;
}

/** Section box as fractions (0..1) of the model bounds on each axis (three.js axes, Y up). */
export interface SectionBox {
  min: [number, number, number];
  max: [number, number, number];
}

export interface Marker {
  id: string;
  position: [number, number, number];
  color: string;
  label?: string;
  elementId?: string;
}

type Events = {
  select: (id: string | null) => void;
  pick: (hit: {
    elementId: string | null;
    point: [number, number, number];
  }) => void;
  marker: (id: string) => void;
  walkchange: (on: boolean) => void;
};

const CONTEXT_OPACITY = 0.18;

export class SiteViewer {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  private orbit: OrbitControls;
  private walk: PointerLockControls | null = null;
  private walkKeys = new Set<string>();
  private meshes = new Map<string, THREE.Mesh[]>();
  private contextIds = new Set<string>();
  private root = new THREE.Group();
  private markerGroup = new THREE.Group();
  private bounds = new THREE.Box3();
  private clipPlanes: THREE.Plane[] = [];
  private section: SectionBox | null = null;
  private selected: string | null = null;
  private colors = new Map<string, string>();
  private listeners = new Map<keyof Events, Set<(...args: never[]) => void>>();
  private dirty = true;
  private raf = 0;
  private lastFrame = performance.now();
  private ro: ResizeObserver;
  private pickMode = false;
  private downAt: { x: number; y: number } | null = null;
  private flight: { from: Viewpoint; to: Viewpoint; t: number } | null = null;
  private container: HTMLElement;
  private loadGeneration = 0;
  private ghostContext = true;
  private displayOffsets = new Map<string, number>();
  private explosion: {
    from: Map<string, number>;
    to: Map<string, number>;
    t: number;
    resolve: () => void;
  } | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;
    this.camera = new THREE.PerspectiveCamera(55, w / h, 0.05, 5000);
    this.camera.position.set(20, 20, 20);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.localClippingEnabled = true;
    this.renderer.setClearColor(0xeef1f5);
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = "none";

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(30, 50, 20);
    this.scene.add(sun);
    this.scene.add(this.root, this.markerGroup);

    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.enableDamping = true;
    this.orbit.minDistance = 0.005;
    this.orbit.addEventListener("change", () => this.invalidate());
    this.orbit.addEventListener("start", () => {
      this.flight = null;
    });

    const el = this.renderer.domElement;
    el.addEventListener(
      "pointerdown",
      (e) => (this.downAt = { x: e.clientX, y: e.clientY }),
    );
    el.addEventListener("pointerup", (e) => this.onPointerUp(e));
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKey);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.loop();
  }

  // ------------------------------------------------------------------ events
  on<K extends keyof Events>(type: K, fn: Events[K]): () => void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    const set = this.listeners.get(type)!;
    set.add(fn as (...args: never[]) => void);
    return () => set.delete(fn as (...args: never[]) => void);
  }
  private emit<K extends keyof Events>(
    type: K,
    ...args: Parameters<Events[K]>
  ) {
    this.listeners
      .get(type)
      ?.forEach((fn) =>
        (fn as unknown as (...a: Parameters<Events[K]>) => void)(...args),
      );
  }

  // ------------------------------------------------------------------ loading
  async loadLayers(layers: LayerData[]): Promise<void> {
    const generation = ++this.loadGeneration;
    const next = new THREE.Group();
    const meshes = new Map<string, THREE.Mesh[]>();
    const contextIds = new Set<string>();
    const loader = new GLTFLoader();
    try {
      for (const layer of layers) {
        const gltf = await loader.parseAsync(layer.data, "");
        gltf.scene.traverse((o) => {
          if (!(o as THREE.Mesh).isMesh) return;
          const mesh = o as THREE.Mesh;
          const id = mesh.name || mesh.parent?.name || "";
          mesh.userData = {
            elementId: id,
            discipline: layer.discipline,
            context: layer.context,
          };
          const original = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];
          original.forEach((m) => m.dispose());
          mesh.material = new THREE.MeshLambertMaterial({
            color: 0xcccccc,
            side: THREE.DoubleSide,
            transparent: layer.context && this.ghostContext,
            opacity: layer.context && this.ghostContext ? CONTEXT_OPACITY : 1,
            depthWrite: !(layer.context && this.ghostContext),
            clippingPlanes: this.clipPlanes,
          });
          meshes.set(id, [...(meshes.get(id) ?? []), mesh]);
          if (layer.context) contextIds.add(id);
        });
        next.add(gltf.scene);
      }
      if (generation !== this.loadGeneration) {
        this.disposeGroup(next);
        return;
      }
      this.clear();
      this.root.add(...[...next.children]);
      this.meshes = meshes;
      this.contextIds = contextIds;
      this.root.updateMatrixWorld(true);
      this.bounds.copy(this.modelBounds());
      this.applySection();
      this.frame();
    } catch (error) {
      this.disposeGroup(next);
      throw error;
    }
  }

  private allMeshes() {
    return [...this.meshes.values()].flat();
  }
  private disposeGroup(group: THREE.Group) {
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      (Array.isArray(m.material) ? m.material : [m.material]).forEach((mat) =>
        mat.dispose(),
      );
    });
    group.clear();
  }

  /** Bounds of the building itself: ignores the "other" layer (survey markers, geo-reference
   *  proxies) and elements whose centre is far from the rest, which would otherwise wreck framing. */
  private modelBounds(): THREE.Box3 {
    let meshes = this.allMeshes().filter(
      (m) => m.userData.discipline !== "other",
    );
    if (!meshes.length) meshes = this.allMeshes();
    const centers = meshes.map((m) =>
      new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()),
    );
    const med = (k: "x" | "y" | "z") => {
      const v = centers.map((c) => c[k]).sort((a, b) => a - b);
      return v[Math.floor(v.length / 2)] ?? 0;
    };
    const m = new THREE.Vector3(med("x"), med("y"), med("z"));
    const d = centers.map((c) => c.distanceTo(m)).sort((a, b) => a - b);
    const cutoff = Math.max((d[Math.floor(d.length * 0.9)] ?? 0) * 3, 5);
    const box = new THREE.Box3();
    meshes.forEach(
      (mesh, i) =>
        centers[i].distanceTo(m) <= cutoff && box.expandByObject(mesh),
    );
    return box;
  }

  clear() {
    this.explosion?.resolve();
    this.explosion = null;
    this.displayOffsets.clear();
    this.loadGeneration++;
    this.disposeGroup(this.root);
    this.disposeGroup(this.markerGroup);
    this.meshes.clear();
    this.contextIds.clear();
    this.selected = null;
    this.flight = null;
    this.invalidate();
  }

  get elementIds(): string[] {
    return [...this.meshes.keys()];
  }

  // ------------------------------------------------------------------ appearance
  /** Exploded floors are reversible presentation transforms, never a design revision. */
  setExplodedOffsets(
    offsets: Map<string, number>,
    animate = true,
  ): Promise<void> {
    this.explosion?.resolve();
    this.explosion = null;
    const changed = [...offsets].some(
      ([id, value]) =>
        Math.abs(value - (this.displayOffsets.get(id) || 0)) > 0.0001,
    );
    if (!changed) return Promise.resolve();
    if (!animate) {
      this.displayOffsets = new Map(offsets);
      this.applyExplosion();
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.explosion = {
        from: new Map(this.displayOffsets),
        to: new Map(offsets),
        t: 0,
        resolve,
      };
      this.invalidate();
    });
  }
  private applyExplosion(recomputeBounds = true) {
    this.meshes.forEach((meshes, id) =>
      meshes.forEach((mesh) =>
        applyDisplayOffset(mesh, this.displayOffsets.get(id) || 0),
      ),
    );
    this.markerGroup.children.forEach((marker) => {
      const point = marker.userData.canonicalPoint as number[] | undefined;
      if (point)
        marker.position.set(
          point[0],
          point[1] + (this.displayOffsets.get(marker.userData.elementId) || 0),
          point[2],
        );
    });
    if (recomputeBounds) {
      this.bounds.copy(this.modelBounds());
      this.applySection();
    }
    this.invalidate();
  }
  /** Solid context avoids alpha overlap; ghost mode remains an explicit inspection option. */
  setGhostContext(ghost: boolean) {
    this.ghostContext = ghost;
    this.meshes.forEach((meshes) =>
      meshes.forEach((m) => {
        const mat = m.material as THREE.MeshLambertMaterial;
        const translucent = ghost && m.userData.context;
        mat.transparent = !!translucent;
        mat.opacity = translucent ? CONTEXT_OPACITY : 1;
        mat.depthWrite = !translucent;
        mat.needsUpdate = true;
      }),
    );
    this.invalidate();
  }
  /** Show only these element ids (null = all). Context elements follow the same rule. */
  setVisible(ids: Set<string> | null) {
    this.meshes.forEach((ms, id) =>
      ms.forEach((m) => (m.visible = ids === null || ids.has(id))),
    );
    this.invalidate();
  }

  setColors(colors: Map<string, string>) {
    this.colors = colors;
    this.meshes.forEach((ms, id) => ms.forEach((m) => this.paint(m, id)));
    this.invalidate();
  }

  private paint(m: THREE.Mesh, id: string) {
    const mat = m.material as THREE.MeshLambertMaterial;
    mat.color.set(
      id === this.selected
        ? SELECTION_COLOR
        : (this.colors.get(id) ?? "#cccccc"),
    );
    mat.emissive.set(id === this.selected ? 0x220055 : 0x000000);
  }

  select(id: string | null, emit = false) {
    const prev = this.selected;
    this.selected = id && this.meshes.has(id) ? id : null;
    for (const x of [prev, this.selected])
      if (x && this.meshes.has(x))
        this.meshes.get(x)!.forEach((m) => this.paint(m, x));
    this.invalidate();
    if (emit) this.emit("select", this.selected);
  }

  // ------------------------------------------------------------------ camera
  frame(ids?: string[], direction: ViewDirection = "iso") {
    const box = new THREE.Box3();
    if (ids?.length)
      ids.forEach((id) =>
        this.meshes.get(id)?.forEach((m) => box.expandByObject(m)),
      );
    else box.copy(this.bounds);
    if (box.isEmpty()) return;
    const fitted = fitBounds(
      box,
      this.camera.fov,
      this.camera.aspect,
      DIRECTIONS[direction],
    );
    this.camera.near = fitted.near;
    this.camera.far = Math.max(
      100,
      this.bounds.getSize(new THREE.Vector3()).length() * 10,
    );
    this.camera.updateProjectionMatrix();
    this.flyTo(fitted);
  }

  zoom(factor: number) {
    const offset = this.camera.position
      .clone()
      .sub(this.orbit.target)
      .multiplyScalar(factor);
    if (offset.length() < 0.005) offset.setLength(0.005);
    this.flight = null;
    this.camera.position.copy(this.orbit.target).add(offset);
    this.orbit.update();
    this.invalidate();
  }

  getViewpoint(): Viewpoint {
    return {
      position: this.camera.position.toArray() as Viewpoint["position"],
      target: this.orbit.target.toArray() as Viewpoint["target"],
      section: this.section,
    };
  }

  flyTo(vp: Viewpoint, animate = true) {
    if (vp.section !== undefined) this.setSection(vp.section);
    if (this.walk?.isLocked) this.walk.unlock();
    if (!animate) {
      this.flight = null;
      this.camera.position.fromArray(vp.position);
      this.orbit.target.fromArray(vp.target);
      this.orbit.update();
      this.invalidate();
      return;
    }
    this.flight = { from: this.getViewpoint(), to: vp, t: 0 };
    this.invalidate();
  }

  // ------------------------------------------------------------------ section box
  setSection(box: SectionBox | null) {
    this.section = box;
    this.applySection();
  }

  private applySection() {
    this.clipPlanes.length = 0;
    if (this.section && !this.bounds.isEmpty()) {
      const { min, max } = this.bounds;
      const lo = (i: 0 | 1 | 2) =>
        min.getComponent(i) +
        (max.getComponent(i) - min.getComponent(i)) * this.section!.min[i];
      const hi = (i: 0 | 1 | 2) =>
        min.getComponent(i) +
        (max.getComponent(i) - min.getComponent(i)) * this.section!.max[i];
      const axes = [
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0, 0, 1),
      ];
      ([0, 1, 2] as const).forEach((i) => {
        this.clipPlanes.push(new THREE.Plane(axes[i].clone(), -lo(i) + 1e-4));
        this.clipPlanes.push(
          new THREE.Plane(axes[i].clone().negate(), hi(i) + 1e-4),
        );
      });
    }
    this.invalidate();
  }

  // ------------------------------------------------------------------ picking
  /** When on, the next click emits 'pick' (used to drop issue pins) instead of selecting. */
  setPickMode(on: boolean) {
    this.pickMode = on;
    this.renderer.domElement.style.cursor = on ? "crosshair" : "";
  }

  pickAt(
    clientX: number,
    clientY: number,
  ): { elementId: string | null; point: [number, number, number] } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const markerHit = ray.intersectObjects(this.markerGroup.children, false)[0];
    if (markerHit && !this.pickMode && this.insideSection(markerHit.point)) {
      this.emit("marker", markerHit.object.userData.markerId);
      return null;
    }
    const candidates = this.allMeshes().filter(
      (m) => m.visible && (!m.userData.context || !this.ghostContext),
    );
    const hits = ray
      .intersectObjects(candidates, false)
      .filter((h) => this.insideSection(h.point));
    const hit = hits[0];
    if (!hit) return null;
    return {
      elementId: hit.object.userData.elementId,
      point: [
        hit.point.x,
        hit.point.y -
          (this.displayOffsets.get(hit.object.userData.elementId) || 0),
        hit.point.z,
      ],
    };
  }

  private insideSection(p: THREE.Vector3) {
    return this.clipPlanes.every((pl) => pl.distanceToPoint(p) >= -1e-3);
  }

  private onPointerUp(e: PointerEvent) {
    if (
      !this.downAt ||
      Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 5
    )
      return;
    if (this.walk?.isLocked) return;
    const hit = this.pickAt(e.clientX, e.clientY);
    if (this.pickMode) {
      if (hit) this.emit("pick", hit);
      return;
    }
    this.select(hit?.elementId ?? null, true);
  }

  // ------------------------------------------------------------------ markers (issue pins)
  setMarkers(markers: Marker[]) {
    this.disposeGroup(this.markerGroup);
    for (const m of markers) {
      const s = new THREE.Mesh(
        new THREE.SphereGeometry(1, 12, 8),
        new THREE.MeshBasicMaterial({
          color: m.color,
          depthTest: false,
          clippingPlanes: this.clipPlanes,
        }),
      );
      s.position.set(
        m.position[0],
        m.position[1] + (this.displayOffsets.get(m.elementId || "") || 0),
        m.position[2],
      );
      s.renderOrder = 10;
      s.userData = {
        markerId: m.id,
        elementId: m.elementId,
        canonicalPoint: [...m.position],
      };
      this.markerGroup.add(s);
    }
    this.sizeMarkers();
    this.markerGroup.updateMatrixWorld(true);
    this.invalidate();
  }

  /** Keep pins legible without a six-centimetre marker hiding a 35mm fitting at close range. */
  private sizeMarkers() {
    const height = this.container.clientHeight || 600;
    const factor =
      (10 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / height;
    this.markerGroup.children.forEach((marker) =>
      marker.scale.setScalar(
        Math.max(
          0.00005,
          marker.position.distanceTo(this.camera.position) * factor,
        ),
      ),
    );
  }

  // ------------------------------------------------------------------ walk mode
  setWalkMode(on: boolean) {
    if (on) {
      if (!this.walk) {
        this.walk = new PointerLockControls(
          this.camera,
          this.renderer.domElement,
        );
        this.walk.addEventListener("change", () => this.invalidate());
        this.walk.addEventListener("unlock", () => {
          this.orbit.enabled = true;
          const dir = this.camera.getWorldDirection(new THREE.Vector3());
          this.orbit.target.copy(this.camera.position).addScaledVector(dir, 2);
          this.emit("walkchange", false);
        });
        this.walk.addEventListener("lock", () => this.emit("walkchange", true));
      }
      this.orbit.enabled = false;
      // Drop to eye height above the lowest visible floor in the current view.
      const floor = this.bounds.isEmpty() ? 0 : this.bounds.min.y;
      if (this.camera.position.y > floor + 20)
        this.camera.position.set(
          this.orbit.target.x,
          floor + 1.6,
          this.orbit.target.z + 4,
        );
      this.walk.lock();
    } else this.walk?.unlock();
  }

  /** Step the walk camera (also used by on-screen buttons on touch devices). */
  walkStep(forward: number, right: number, turn = 0) {
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    dir.y = 0;
    dir.normalize();
    const side = new THREE.Vector3()
      .crossVectors(dir, this.camera.up)
      .normalize();
    this.camera.position
      .addScaledVector(dir, forward)
      .addScaledVector(side, right);
    if (turn) this.camera.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), turn);
    if (!this.walk?.isLocked) {
      const d = this.camera.getWorldDirection(new THREE.Vector3());
      this.orbit.target.copy(this.camera.position).addScaledVector(d, 2);
    }
    this.invalidate();
  }

  private onKey = (e: KeyboardEvent) => {
    if (!this.walk?.isLocked) return;
    const k = e.key.toLowerCase();
    if (e.type === "keydown") this.walkKeys.add(k);
    else this.walkKeys.delete(k);
    this.invalidate();
  };

  // ------------------------------------------------------------------ snapshot
  snapshot(type = "image/jpeg", quality = 0.85): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL(type, quality);
  }

  // ------------------------------------------------------------------ render loop
  invalidate() {
    this.dirty = true;
  }

  private resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.invalidate();
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min((now - this.lastFrame) / 1000, 0.1);
    this.lastFrame = now;
    if (this.explosion) {
      const f = this.explosion;
      f.t = Math.min(1, f.t + dt / 0.45);
      const eased = f.t * f.t * (3 - 2 * f.t);
      this.displayOffsets = new Map(
        [...f.to].map(([id, to]) => [
          id,
          (f.from.get(id) || 0) + (to - (f.from.get(id) || 0)) * eased,
        ]),
      );
      this.applyExplosion(f.t === 1);
      if (f.t === 1) {
        this.explosion = null;
        f.resolve();
      }
    }
    if (this.flight) {
      const f = this.flight;
      f.t = Math.min(1, f.t + dt / 0.6);
      const e = f.t < 0.5 ? 2 * f.t * f.t : 1 - (-2 * f.t + 2) ** 2 / 2;
      this.camera.position.lerpVectors(
        new THREE.Vector3(...f.from.position),
        new THREE.Vector3(...f.to.position),
        e,
      );
      this.orbit.target.lerpVectors(
        new THREE.Vector3(...f.from.target),
        new THREE.Vector3(...f.to.target),
        e,
      );
      if (f.t >= 1) this.flight = null;
      this.dirty = true;
    }
    if (this.walk?.isLocked && this.walkKeys.size) {
      const speed = (this.walkKeys.has("shift") ? 6 : 2.5) * dt;
      const fwd =
        (this.walkKeys.has("w") || this.walkKeys.has("arrowup") ? 1 : 0) -
        (this.walkKeys.has("s") || this.walkKeys.has("arrowdown") ? 1 : 0);
      const rt =
        (this.walkKeys.has("d") || this.walkKeys.has("arrowright") ? 1 : 0) -
        (this.walkKeys.has("a") || this.walkKeys.has("arrowleft") ? 1 : 0);
      this.walkStep(fwd * speed, rt * speed);
    }
    if (!this.walk?.isLocked) {
      if (this.orbit.update()) this.dirty = true;
    }
    if (this.dirty) {
      this.dirty = false;
      this.sizeMarkers();
      this.renderer.render(this.scene, this.camera);
    }
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKey);
    this.walk?.dispose();
    this.orbit.dispose();
    this.clear();
    this.listeners.clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
