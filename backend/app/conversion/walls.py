"""Wall detection: pair parallel face lines into centrelines, merge, bridge openings, clean up junctions."""

import math
from dataclasses import dataclass, field

from shapely.geometry import LineString, Point
from shapely.strtree import STRtree

from app.conversion.reader import Pt, Seg

MIN_T, MAX_T = 0.05, 0.46  # wall thickness range (m): 2" partitions .. 18" masonry
ANGLE_TOL = math.radians(2.0)
MIN_OVERLAP = 0.15
MAX_BRIDGE = 2.6  # widest opening we bridge (double doors, big windows)


@dataclass
class Opening:
    start: float  # distance from wall start (m)
    end: float
    kind: str = "opening"  # door | window | opening
    confidence: float = 0.6
    evidence: str = ""


@dataclass
class Wall:
    a: Pt
    b: Pt
    thickness: float
    confidence: float = 0.9
    openings: list[Opening] = field(default_factory=list)

    @property
    def length(self) -> float:
        return math.dist(self.a, self.b)

    @property
    def dir(self) -> tuple[float, float]:
        L = self.length or 1.0
        return ((self.b[0] - self.a[0]) / L, (self.b[1] - self.a[1]) / L)

    def line(self) -> LineString:
        return LineString([self.a, self.b])


def _angle(s: Seg) -> float:
    return math.atan2(s.b[1] - s.a[1], s.b[0] - s.a[0]) % math.pi


def _ang_diff(a: float, b: float) -> float:
    d = abs(a - b) % math.pi
    return min(d, math.pi - d)


def _project(p: Pt, origin: Pt, u: tuple[float, float]) -> float:
    return (p[0] - origin[0]) * u[0] + (p[1] - origin[1]) * u[1]


def pair_faces(segs: list[Seg]) -> list[tuple[Wall, int, int]]:
    """Return candidate centrelines from pairs of parallel segments at wall-thickness distance."""
    segs = [s for s in segs if s.length >= MIN_OVERLAP]
    if not segs:
        return []
    tree = STRtree([LineString([s.a, s.b]) for s in segs])
    angles = [_angle(s) for s in segs]
    cands = []
    for i, s in enumerate(segs):
        u = ((s.b[0] - s.a[0]) / s.length, (s.b[1] - s.a[1]) / s.length)
        n = (-u[1], u[0])
        for j in tree.query(LineString([s.a, s.b]).buffer(MAX_T)):
            j = int(j)
            if j <= i or _ang_diff(angles[i], angles[j]) > ANGLE_TOL:
                continue
            o = segs[j]
            d1, d2 = _project(o.a, s.a, n), _project(o.b, s.a, n)
            d = (d1 + d2) / 2
            if not (MIN_T <= abs(d) <= MAX_T) or abs(d1 - d2) > 0.02:
                continue
            t0, t1 = sorted((_project(o.a, s.a, u), _project(o.b, s.a, u)))
            lo, hi = max(0.0, t0), min(s.length, t1)
            if hi - lo < MIN_OVERLAP:
                continue
            mid = d / 2
            a = (s.a[0] + u[0] * lo + n[0] * mid, s.a[1] + u[1] * lo + n[1] * mid)
            b = (s.a[0] + u[0] * hi + n[0] * mid, s.a[1] + u[1] * hi + n[1] * mid)
            cands.append((Wall(a, b, round(abs(d), 4)), i, j, lo, hi))
    # Greedy: thinner pairs first; a stretch of a face line can only belong to one wall.
    cands.sort(key=lambda c: (c[0].thickness, -(c[4] - c[3])))
    used: dict[int, list[tuple[float, float]]] = {}
    out = []
    for w, i, j, lo, hi in cands:
        def covered(k, lo_k, hi_k):
            return sum(max(0.0, min(hi_k, h) - max(lo_k, lo_)) for lo_, h in used.get(k, [])) > 0.5 * (hi_k - lo_k)
        sj = segs[j]
        uj = ((sj.b[0] - sj.a[0]) / sj.length, (sj.b[1] - sj.a[1]) / sj.length)
        pj = sorted((_project(w.a, sj.a, uj), _project(w.b, sj.a, uj)))
        if covered(i, lo, hi) or covered(j, *pj):
            continue
        used.setdefault(i, []).append((lo, hi))
        used.setdefault(j, []).append(tuple(pj))
        out.append((w, i, j))
    return out


def merge_collinear(walls: list[Wall], gap: float = 0.03) -> list[Wall]:
    """Merge centrelines on the same line with the same thickness that overlap or touch."""
    groups: list[list[Wall]] = []
    for w in walls:
        for g in groups:
            r = g[0]
            if abs(r.thickness - w.thickness) > 0.025 or _ang_diff(math.atan2(*r.dir[::-1]), math.atan2(*w.dir[::-1])) > ANGLE_TOL:
                continue
            n = (-r.dir[1], r.dir[0])
            if abs(_project(w.a, r.a, n)) < 0.02 and abs(_project(w.b, r.a, n)) < 0.02:
                g.append(w)
                break
        else:
            groups.append([w])
    out = []
    for g in groups:
        r = g[0]
        u = r.dir
        spans = sorted(tuple(sorted((_project(w.a, r.a, u), _project(w.b, r.a, u)))) for w in g)
        thick = sum(w.thickness * w.length for w in g) / max(sum(w.length for w in g), 1e-9)
        merged = [list(spans[0])]
        for lo, hi in spans[1:]:
            if lo <= merged[-1][1] + gap:
                merged[-1][1] = max(merged[-1][1], hi)
            else:
                merged.append([lo, hi])
        for lo, hi in merged:
            out.append(Wall((r.a[0] + u[0] * lo, r.a[1] + u[1] * lo), (r.a[0] + u[0] * hi, r.a[1] + u[1] * hi),
                            round(thick, 4)))
    return out


def bridge_openings(walls: list[Wall], evidence: list[tuple[str, object]]) -> list[Wall]:
    """Join collinear pieces separated by a gap that is an opening (door/window symbol in the gap, or a gap
    narrow enough to be a cased opening). Records the opening on the joined wall."""
    walls = list(walls)
    changed = True
    while changed:
        changed = False
        for i in range(len(walls)):
            for j in range(len(walls)):
                if i == j:
                    continue
                w1, w2 = walls[i], walls[j]
                if abs(w1.thickness - w2.thickness) > 0.03:
                    continue
                if _ang_diff(math.atan2(*w1.dir[::-1]), math.atan2(*w2.dir[::-1])) > ANGLE_TOL:
                    continue
                u, n = w1.dir, (-w1.dir[1], w1.dir[0])
                if abs(_project(w2.a, w1.a, n)) > 0.03 or abs(_project(w2.b, w1.a, n)) > 0.03:
                    continue
                s2 = sorted((_project(w2.a, w1.a, u), _project(w2.b, w1.a, u)))
                g0, g1 = w1.length, s2[0]
                if not (0.5 <= g1 - g0 <= MAX_BRIDGE):
                    continue
                gap_mid = ((g0 + g1) / 2)
                gp = Point(w1.a[0] + u[0] * gap_mid, w1.a[1] + u[1] * gap_mid)
                gap_line = LineString([(w1.a[0] + u[0] * g0, w1.a[1] + u[1] * g0), (w1.a[0] + u[0] * g1, w1.a[1] + u[1] * g1)])
                kind, conf, ev = None, 0.0, ""
                for k, geom in evidence:
                    if geom.distance(gap_line) <= max(w1.thickness, 0.15) and geom.distance(gp) <= (g1 - g0):
                        kind, conf, ev = k, 0.9, f"{k} symbol in gap"
                        break
                if kind is None:
                    if g1 - g0 <= 1.85:  # cased openings up to ~6'
                        kind, conf, ev = "opening", 0.5, "gap without symbol"
                    else:
                        continue
                ops = list(w1.openings) + [Opening(g0, g1, kind, conf, ev)] + [
                    Opening(o.start + s2[0], o.end + s2[0], o.kind, o.confidence, o.evidence) for o in w2.openings]
                end = s2[1]
                nw = Wall(w1.a, (w1.a[0] + u[0] * end, w1.a[1] + u[1] * end),
                          round((w1.thickness * w1.length + w2.thickness * w2.length) / (w1.length + w2.length), 4),
                          min(w1.confidence, w2.confidence), ops)
                walls = [w for k, w in enumerate(walls) if k not in (i, j)] + [nw]
                changed = True
                break
            if changed:
                break
    return walls


def _line_intersection(p: Pt, r: tuple[float, float], q: Pt, s: tuple[float, float]) -> tuple[float, float] | None:
    cross = r[0] * s[1] - r[1] * s[0]
    if abs(cross) < 1e-9:
        return None
    t = ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / cross
    u = ((q[0] - p[0]) * r[1] - (q[1] - p[1]) * r[0]) / cross
    return t, u


def extend_to_junctions(walls: list[Wall]) -> list[Wall]:
    """Pair-detected centrelines stop at the inside face at corners and tees; extend them to meet the
    other wall's centreline so the plan closes into rooms."""
    for w in walls:
        for end in ("a", "b"):
            p = getattr(w, end)
            other_end = w.b if end == "a" else w.a
            d = (p[0] - other_end[0], p[1] - other_end[1])
            L = math.hypot(*d) or 1.0
            d = (d[0] / L, d[1] / L)  # outward direction at this end
            best = None
            for o in walls:
                if o is w or _ang_diff(math.atan2(*o.dir[::-1]), math.atan2(*d[::-1])) < math.radians(20):
                    continue
                res = _line_intersection(p, d, o.a, o.dir)
                if res is None:
                    continue
                t, u = res
                reach = max(w.thickness, o.thickness) + 0.06
                if -0.02 <= t <= reach and -reach <= u <= o.length + reach and (best is None or t < best[0]):
                    best = (t, u, o)
            if best:
                t, u, o = best
                newp = (p[0] + d[0] * t, p[1] + d[1] * t)
                if end == "a":
                    shift = math.dist(newp, w.a) * (1 if t > 0 else -1)
                    w.openings = [Opening(op.start + shift, op.end + shift, op.kind, op.confidence, op.evidence)
                                  for op in w.openings]
                    w.a = newp
                else:
                    w.b = newp
                # extend the other wall too when the junction is beyond its end (L corners)
                if u < 0 or u > o.length:
                    if u < 0:
                        shift = -u
                        o.openings = [Opening(op.start + shift, op.end + shift, op.kind, op.confidence, op.evidence)
                                      for op in o.openings]
                        o.a = newp
                    else:
                        o.b = newp
    return walls


def detect_walls(segs: list[Seg], evidence: list[tuple[str, object]]) -> tuple[list[Wall], dict]:
    segs = [s for s in segs if s.length >= MIN_OVERLAP]  # same filter as pair_faces, so indices line up
    pairs = pair_faces(segs)
    used = {i for _, i, _ in pairs} | {j for _, _, j in pairs}
    # Gaps narrower than any door are junction artefacts (a crossing wall interrupts one face line).
    walls = merge_collinear([w for w, _, _ in pairs], gap=0.5)
    walls = [w for w in walls if w.length >= 0.2]
    walls = bridge_openings(walls, evidence)
    walls = extend_to_junctions(walls)
    walls = merge_collinear_keep_openings(walls)
    for w in walls:
        w.confidence = round(min(0.95, 0.6 + 0.1 * min(w.length, 3.5)), 2)
    unpaired = [s for k, s in enumerate(segs) if k not in used and s.length > 0.5]
    return walls, {"face_lines": len(segs), "paired": len(used), "unpaired_long_lines": len(unpaired)}


def merge_collinear_keep_openings(walls: list[Wall]) -> list[Wall]:
    """After junction extension, collinear pieces may now touch; join them keeping their openings."""
    out = list(walls)
    changed = True
    while changed:
        changed = False
        for i, w1 in enumerate(out):
            for j, w2 in enumerate(out):
                if i >= j or abs(w1.thickness - w2.thickness) > 0.03:
                    continue
                if _ang_diff(math.atan2(*w1.dir[::-1]), math.atan2(*w2.dir[::-1])) > ANGLE_TOL:
                    continue
                u, n = w1.dir, (-w1.dir[1], w1.dir[0])
                if abs(_project(w2.a, w1.a, n)) > 0.03 or abs(_project(w2.b, w1.a, n)) > 0.03:
                    continue
                pa, pb = _project(w2.a, w1.a, u), _project(w2.b, w1.a, u)
                lo2, hi2 = min(pa, pb), max(pa, pb)
                if lo2 > w1.length + 0.03 or hi2 < -0.03:
                    continue
                lo, hi = min(0.0, lo2), max(w1.length, hi2)
                flip = pa > pb
                ops = [Opening(o.start - lo, o.end - lo, o.kind, o.confidence, o.evidence) for o in w1.openings]
                for o in w2.openings:
                    s0 = (pa - o.end) if flip else (pa + o.start)
                    s1 = (pa - o.start) if flip else (pa + o.end)
                    ops.append(Opening(s0 - lo, s1 - lo, o.kind, o.confidence, o.evidence))
                nw = Wall((w1.a[0] + u[0] * lo, w1.a[1] + u[1] * lo), (w1.a[0] + u[0] * hi, w1.a[1] + u[1] * hi),
                          w1.thickness, min(w1.confidence, w2.confidence), sorted(ops, key=lambda o: o.start))
                out = [w for k, w in enumerate(out) if k not in (i, j)] + [nw]
                changed = True
                break
            if changed:
                break
    return out
