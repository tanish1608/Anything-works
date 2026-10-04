"""Photo intake: metadata (EXIF time, GPS), content hash and perceptual hash for reuse detection."""

import hashlib
import io
from datetime import UTC, datetime

from PIL import ExifTags, Image, ImageOps

MAX_SIDE = 2560  # stored originals are kept as uploaded; this only bounds analysis copies


def dhash(img: Image.Image, size: int = 8) -> str:
    """64-bit difference hash: robust to resizing/recompression, so a re-uploaded photo is caught even
    after the phone re-encodes it."""
    g = img.convert("L").resize((size + 1, size), Image.Resampling.LANCZOS)
    px = list(g.getdata())
    bits = 0
    for row in range(size):
        for col in range(size):
            bits = (bits << 1) | (1 if px[row * (size + 1) + col] > px[row * (size + 1) + col + 1] else 0)
    return f"{bits:016x}"


def hamming(a: str, b: str) -> int:
    return bin(int(a, 16) ^ int(b, 16)).count("1")


def _gps(exif) -> tuple[float | None, float | None]:
    try:
        gps = exif.get_ifd(ExifTags.IFD.GPSInfo)
        if not gps:
            return None, None

        def conv(v, ref):
            d, m, s = (float(x) for x in v)
            out = d + m / 60 + s / 3600
            return -out if ref in ("S", "W") else out

        return conv(gps[2], gps.get(1, "N")), conv(gps[4], gps.get(3, "E"))
    except Exception:  # noqa: BLE001
        return None, None


def inspect_photo(data: bytes) -> dict:
    """Raises ValueError if the bytes aren't a readable image."""
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Exception as e:  # noqa: BLE001
        raise ValueError("not a readable image") from e
    exif = img.getexif()
    t = None
    raw = exif.get_ifd(ExifTags.IFD.Exif).get(36867) or exif.get(306)  # DateTimeOriginal, DateTime
    if raw:
        try:
            t = datetime.strptime(str(raw).strip("\x00"), "%Y:%m:%d %H:%M:%S").replace(tzinfo=UTC)
        except ValueError:
            t = None
    lat, lon = _gps(exif)
    upright = ImageOps.exif_transpose(img)
    return {"sha256": hashlib.sha256(data).hexdigest(), "phash": dhash(upright), "width": upright.width,
            "height": upright.height, "exif_time": t, "gps_lat": lat, "gps_lon": lon,
            "content_type": Image.MIME.get(img.format or "", "application/octet-stream")}


def analysis_copy(data: bytes, max_side: int = 1568) -> bytes:
    """Upright JPEG no bigger than max_side (what we send to the vision model)."""
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
    img.thumbnail((max_side, max_side))
    out = io.BytesIO()
    img.save(out, "JPEG", quality=85)
    return out.getvalue()
