from __future__ import annotations

from dataclasses import dataclass
from typing import Tuple

import numpy as np
import matplotlib.path as mpath
from matplotlib.collections import PolyCollection
from mpl_toolkits.mplot3d import proj3d

from ._backend import (
    process_polygon_faces,
    process_uniform_faces,
    update_paths_vertices,
    update_paths_vertices_variable,
)


@dataclass(slots=True)
class SurfaceFastPathOptions:
    threads: int = 0
    reorder_colors: bool = True
    enable_lighting: bool = True
    reuse_paths: bool = True
    light_dir: Tuple[float, float, float] = (0.25, 0.4, 1.0)
    ambient: float = 0.35
    diffuse: float = 0.65


def supports_surface_fastpath(surface) -> tuple[bool, str]:
    segslices = getattr(surface, "_segslices", None)
    if not segslices:
        return False, "missing _segslices"
    lengths = sorted({int(sl.stop - sl.start) for sl in segslices})
    if any(length < 3 for length in lengths):
        return False, f"unsupported face sizes={lengths}"
    verts_per_face = lengths[0]
    if verts_per_face not in (3, 4):
        if len(lengths) == 1:
            return False, f"unsupported verts_per_face={verts_per_face}"
    if getattr(surface, "_codes3d", None) is not None:
        return False, "codes3d path unsupported"
    if getattr(surface, "_axlim_clip", False):
        return False, "axlim clip path unsupported"
    vec = getattr(surface, "_vec", None)
    if vec is None or np.asarray(vec).ndim != 2:
        return False, "missing projected source vector"
    return True, "ok"


def _sync_scalarmappable(surface) -> None:
    if surface._A is not None:
        surface.update_scalarmappable()
        if surface._face_is_mapped:
            surface._facecolor3d = surface._facecolors
        if surface._edge_is_mapped:
            surface._edgecolor3d = surface._edgecolors


def _face_layout(surface) -> tuple[np.ndarray, np.ndarray]:
    starts = np.array([segment.start for segment in surface._segslices], dtype=np.int64)
    lengths = np.array(
        [segment.stop - segment.start for segment in surface._segslices],
        dtype=np.int64,
    )
    return starts, lengths


def _color_array(colors, num_faces: int) -> np.ndarray:
    arr = np.asarray(colors, dtype=np.float64)
    if arr.size == 0:
        return np.empty((0, 4), dtype=np.float64)
    if arr.ndim == 1:
        arr = arr.reshape(1, -1)
    if arr.shape[0] == 1:
        return np.repeat(arr, num_faces, axis=0)
    if arr.shape[0] == num_faces:
        return np.ascontiguousarray(arr, dtype=np.float64)
    raise ValueError(
        f"expected color rows to be 0, 1, or {num_faces}, got {arr.shape[0]}"
    )


def _extract_xyz(surface) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    vec = np.ascontiguousarray(np.asarray(surface._vec, dtype=np.float64))
    return vec[0], vec[1], vec[2]


def _return_zorder(surface, tzs: np.ndarray) -> float:
    if surface._sort_zpos is not None:
        zvec = np.array([[0.0], [0.0], [surface._sort_zpos], [1.0]], dtype=np.float64)
        ztrans = proj3d._proj_transform_vec(zvec, surface.axes.M)
        return float(ztrans[2][0])
    if tzs.size > 0:
        return float(np.min(tzs))
    return float("nan")


def _build_face_payload(surface, options: SurfaceFastPathOptions) -> dict:
    _sync_scalarmappable(surface)

    starts, lengths = _face_layout(surface)
    txs, tys, tzs = proj3d._proj_transform_vec(surface._vec, surface.axes.M)
    x3d, y3d, z3d = _extract_xyz(surface)

    num_faces = int(starts.shape[0])
    facecolors = _color_array(surface._facecolor3d, num_faces)
    edgecolors = _color_array(surface._edgecolor3d, num_faces)
    if edgecolors.shape[0] == 0:
        edgecolors = facecolors

    arrays = dict(
        txs=np.ascontiguousarray(txs, dtype=np.float64),
        tys=np.ascontiguousarray(tys, dtype=np.float64),
        tzs=np.ascontiguousarray(tzs, dtype=np.float64),
        x3d=np.ascontiguousarray(x3d, dtype=np.float64),
        y3d=np.ascontiguousarray(y3d, dtype=np.float64),
        z3d=np.ascontiguousarray(z3d, dtype=np.float64),
        starts=starts,
        facecolors=np.ascontiguousarray(facecolors, dtype=np.float64),
        edgecolors=np.ascontiguousarray(edgecolors, dtype=np.float64),
        reorder_colors=options.reorder_colors,
        enable_lighting=options.enable_lighting,
        light_dir=options.light_dir,
        ambient=options.ambient,
        diffuse=options.diffuse,
        threads=options.threads,
    )
    unique_lengths = np.unique(lengths)
    if unique_lengths.size == 1 and int(unique_lengths[0]) in (3, 4):
        payload = process_uniform_faces(
            **arrays,
            verts_per_face=int(unique_lengths[0]),
        )
        payload["layout"] = "uniform"
        return payload

    payload = process_polygon_faces(
        **arrays,
        lengths=np.ascontiguousarray(lengths, dtype=np.int64),
    )
    payload["layout"] = "variable"
    return payload


def _variable_verts_list(payload: dict) -> list[np.ndarray]:
    verts_flat = np.asarray(payload["verts_flat"], dtype=np.float64)
    starts = np.asarray(payload["face_starts"], dtype=np.int64)
    lengths = np.asarray(payload["face_lengths"], dtype=np.int64)
    return [
        np.ascontiguousarray(verts_flat[start:start + length], dtype=np.float64)
        for start, length in zip(starts.tolist(), lengths.tolist())
    ]


def _build_padded_variable_paths(payload: dict, closed: bool):
    verts_flat = np.asarray(payload["verts_flat"], dtype=np.float64)
    starts = np.asarray(payload["face_starts"], dtype=np.int64)
    lengths = np.asarray(payload["face_lengths"], dtype=np.int64)
    max_len = int(lengths.max(initial=0))
    if max_len <= 0:
        return [], 0

    if closed:
        rows = max_len + 1
        codes = np.full(rows, mpath.Path.LINETO, dtype=np.uint8)
        codes[0] = mpath.Path.MOVETO
        codes[-1] = mpath.Path.CLOSEPOLY
    else:
        rows = max_len
        codes = None

    paths = []
    for start, length in zip(starts.tolist(), lengths.tolist()):
        xy = verts_flat[start:start + length]
        padded = np.empty((rows, 2), dtype=np.float64)
        padded[:length] = xy
        fill_until = rows - 1 if closed else rows
        if length < fill_until:
            padded[length:fill_until] = xy[-1]
        if closed:
            padded[-1] = xy[0]
            paths.append(mpath.Path(padded, codes))
        else:
            paths.append(mpath.Path(padded))
    return paths, max_len


def install_projection_override(surface, options: SurfaceFastPathOptions):
    original = surface.do_3d_projection
    path_cache = {
        "initialized": False,
        "layout": None,
        "verts_per_face": None,
        "num_faces": None,
        "face_lengths": None,
    }

    def fast_do_3d_projection():
        payload = _build_face_payload(surface, options)
        surface._facecolors2d = payload["facecolors"]
        surface._edgecolors2d = payload["edgecolors"]

        if payload["layout"] == "uniform":
            reuse_ready = (
                options.reuse_paths
                and path_cache["initialized"]
                and path_cache["layout"] == "uniform"
                and path_cache["verts_per_face"] == int(payload["verts"].shape[1])
                and path_cache["num_faces"] == int(payload["verts"].shape[0])
                and hasattr(surface, "_paths")
            )

            if reuse_ready:
                updated = update_paths_vertices(surface._paths, payload["verts"], closed=surface._closed)
                if not updated:
                    PolyCollection.set_verts(surface, payload["verts"], surface._closed)
            else:
                PolyCollection.set_verts(surface, payload["verts"], surface._closed)
                path_cache["initialized"] = True
                path_cache["layout"] = "uniform"
                path_cache["verts_per_face"] = int(payload["verts"].shape[1])
                path_cache["num_faces"] = int(payload["verts"].shape[0])
                path_cache["face_lengths"] = None
        else:
            face_lengths = np.asarray(payload["face_lengths"], dtype=np.int64)
            reuse_ready = (
                options.reuse_paths
                and path_cache["initialized"]
                and path_cache["layout"] == "variable"
                and path_cache["num_faces"] == int(face_lengths.shape[0])
                and path_cache["verts_per_face"] == int(face_lengths.max(initial=0))
                and hasattr(surface, "_paths")
            )
            if reuse_ready:
                updated = update_paths_vertices_variable(
                    surface._paths,
                    payload["verts_flat"],
                    payload["face_starts"],
                    face_lengths,
                    closed=surface._closed,
                )
                if not updated:
                    surface._paths, path_cache["verts_per_face"] = _build_padded_variable_paths(
                        payload,
                        surface._closed,
                    )
            else:
                surface._paths, path_cache["verts_per_face"] = _build_padded_variable_paths(
                    payload,
                    surface._closed,
                )
                path_cache["initialized"] = True
                path_cache["layout"] = "variable"
                path_cache["num_faces"] = int(face_lengths.shape[0])
                path_cache["face_lengths"] = None

        surface.stale = True
        if len(surface._edgecolor3d) != len(surface._facecolors2d):
            surface._edgecolors2d = surface._edgecolor3d
        return _return_zorder(surface, np.asarray([payload["min_tz"]], dtype=np.float64))

    surface.do_3d_projection = fast_do_3d_projection
    return original


def restore_projection_override(surface, original) -> None:
    surface.do_3d_projection = original
