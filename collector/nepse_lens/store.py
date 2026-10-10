"""File layout of the `data` branch. Small, compact, append-friendly, and safe to re-run."""

from __future__ import annotations

import gzip
import json
from pathlib import Path
from typing import Any

from .aggregate import Agg, agg_from_csv, agg_to_csv


class Store:
    def __init__(self, root: str | Path):
        self.root = Path(root)

    def path(self, rel: str) -> Path:
        return self.root / rel

    def read_json(self, rel: str, default: Any = None) -> Any:
        p = self.path(rel)
        if not p.exists():
            return default
        return json.loads(p.read_text(encoding="utf-8"))

    def write_json(self, rel: str, obj: Any) -> None:
        p = self.path(rel)
        p.parent.mkdir(parents=True, exist_ok=True)
        text = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
        tmp = p.with_suffix(p.suffix + ".tmp")
        tmp.write_text(text + "\n", encoding="utf-8")
        tmp.replace(p)

    # ---- floorsheet aggregates: floorsheet/YYYY/YYYY-MM-DD.csv.gz ----
    @staticmethod
    def floorsheet_rel(day: str) -> str:
        return f"floorsheet/{day[:4]}/{day}.csv.gz"

    def has_floorsheet(self, day: str) -> bool:
        return self.path(self.floorsheet_rel(day)).exists()

    def write_floorsheet(self, day: str, agg: Agg) -> None:
        p = self.path(self.floorsheet_rel(day))
        p.parent.mkdir(parents=True, exist_ok=True)
        # mtime=0 keeps the gzip bytes identical across re-runs, so git sees no change.
        with open(p, "wb") as fh, gzip.GzipFile(fileobj=fh, mode="wb", mtime=0) as gz:
            gz.write(agg_to_csv(agg).encode("utf-8"))

    def floorsheet_days(self) -> list[str]:
        base = self.path("floorsheet")
        if not base.exists():
            return []
        return sorted(p.name.removesuffix(".csv.gz") for p in base.glob("*/*.csv.gz"))

    def load_daily(self) -> dict[str, Agg]:
        out: dict[str, Agg] = {}
        for day in self.floorsheet_days():
            with gzip.open(self.path(self.floorsheet_rel(day)), "rt", encoding="utf-8") as fh:
                out[day] = agg_from_csv(fh.read())
        return out

    # ---- manifest ----
    def manifest(self) -> dict[str, Any]:
        return self.read_json("manifest.json", {}) or {}

    def update_manifest(self, **changes: Any) -> dict[str, Any]:
        m = self.manifest()
        m.update(changes)
        m["floorsheetDays"] = self.floorsheet_days()
        if m["floorsheetDays"]:
            m["firstFloorsheetDay"] = m["floorsheetDays"][0]
        self.write_json("manifest.json", m)
        return m
