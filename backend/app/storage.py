"""Object storage behind a tiny interface. Local filesystem now; an S3/MinIO implementation can
replace it without touching callers (keys are opaque strings like "projects/<id>/models/v1/arch.glb")."""

import shutil
from pathlib import Path

from app.config import get_settings


class LocalStorage:
    def __init__(self, root: str):
        self.root = Path(root).resolve()

    def _path(self, key: str) -> Path:
        p = (self.root / key).resolve()
        if not p.is_relative_to(self.root):
            raise ValueError("invalid storage key")
        return p

    def put_bytes(self, key: str, data: bytes) -> str:
        p = self._path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
        return key

    def put_file(self, key: str, src: str | Path) -> str:
        p = self._path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, p)
        return key

    def get_bytes(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def local_path(self, key: str) -> Path:
        return self._path(key)

    def exists(self, key: str) -> bool:
        return self._path(key).exists()


_storage: LocalStorage | None = None


def get_storage() -> LocalStorage:
    global _storage
    if _storage is None or str(_storage.root) != str(Path(get_settings().storage_dir).resolve()):
        _storage = LocalStorage(get_settings().storage_dir)
    return _storage
