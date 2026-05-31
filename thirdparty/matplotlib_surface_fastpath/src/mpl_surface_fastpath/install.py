from __future__ import annotations

import matplotlib.path as mpath
import numpy as np
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
from mpl_toolkits.mplot3d import axes3d

from ._backend import build_closed_path_buffers
from .adapter import (
    SurfaceFastPathOptions,
    _build_face_payload,
    _return_zorder,
    _variable_verts_list,
    install_projection_override,
    restore_projection_override,
    supports_surface_fastpath,
)


_GLOBAL_PATCH_STATE = {
    "enabled": False,
    "original_add_collection3d": None,
    "options": None,
    "original_plot_surface": None,
    "original_plot_trisurf": None,
}


def install_surface_fastpath(surface, options: SurfaceFastPathOptions | None = None):
    ok, reason = supports_surface_fastpath(surface)
    if not ok:
        raise ValueError(f"surface fast path unsupported: {reason}")
    opts = options or SurfaceFastPathOptions()
    original = install_projection_override(surface, opts)
    return {"surface": surface, "original": original, "options": opts}


def restore_surface_fastpath(state) -> None:
    restore_projection_override(state["surface"], state["original"])


def install_surface_fastpath_cpp_rebuild(
    surface,
    options: SurfaceFastPathOptions | None = None,
):
    ok, reason = supports_surface_fastpath(surface)
    if not ok:
        raise ValueError(f"surface fast path unsupported: {reason}")

    opts = options or SurfaceFastPathOptions()
    original = surface.do_3d_projection

    def cpp_path_do_3d_projection():
        payload = _build_face_payload(surface, opts)
        surface._facecolors2d = payload["facecolors"]
        surface._edgecolors2d = payload["edgecolors"]

        if payload["layout"] == "uniform":
            buffers = build_closed_path_buffers(payload["verts"], closed=surface._closed)
            verts_pad = np.asarray(buffers["verts"], dtype=np.float64)
            codes = buffers["codes"]
            surface._paths = [mpath.Path(xy, codes) for xy in verts_pad]
        else:
            verts_list = _variable_verts_list(payload)
            if surface._closed:
                path_mod = mpath.Path
                close_code = path_mod.CLOSEPOLY
                line_code = path_mod.LINETO
                move_code = path_mod.MOVETO
                paths = []
                for xy in verts_list:
                    padded = np.empty((xy.shape[0] + 1, 2), dtype=np.float64)
                    padded[:-1] = xy
                    padded[-1] = xy[0]
                    codes = np.full(xy.shape[0] + 1, line_code, dtype=np.uint8)
                    codes[0] = move_code
                    codes[-1] = close_code
                    paths.append(mpath.Path(padded, codes))
                surface._paths = paths
            else:
                surface._paths = [mpath.Path(xy) for xy in verts_list]
        surface.stale = True

        if len(surface._edgecolor3d) != len(surface._facecolors2d):
            surface._edgecolors2d = surface._edgecolor3d

        return _return_zorder(surface, np.asarray([payload["min_tz"]], dtype=np.float64))

    surface.do_3d_projection = cpp_path_do_3d_projection
    return {"surface": surface, "original": original, "options": opts}


def enable_fast_surface(surface):
    state = install_surface_fastpath(surface, SurfaceFastPathOptions())
    setattr(surface, "_mpl_surface_fastpath_state", state)
    setattr(surface, "_mpl_surface_fastpath_reason", "enabled")
    return state


def disable_fast_surface(surface) -> None:
    state = getattr(surface, "_mpl_surface_fastpath_state", None)
    if state is None:
        return
    restore_surface_fastpath(state)
    delattr(surface, "_mpl_surface_fastpath_state")


def enable_fast_surface_advanced(
    surface,
    *,
    threads: int = 0,
    reorder_colors: bool = True,
    enable_lighting: bool = True,
    reuse_paths: bool = True,
    light_dir=(0.25, 0.4, 1.0),
    ambient: float = 0.35,
    diffuse: float = 0.65,
):
    options = SurfaceFastPathOptions(
        threads=threads,
        reorder_colors=reorder_colors,
        enable_lighting=enable_lighting,
        reuse_paths=reuse_paths,
        light_dir=light_dir,
        ambient=ambient,
        diffuse=diffuse,
    )
    state = install_surface_fastpath(surface, options)
    setattr(surface, "_mpl_surface_fastpath_state", state)
    setattr(surface, "_mpl_surface_fastpath_reason", "enabled")
    return state


def enable_fast_surface_globally():
    enable_fast_surface_globally_advanced()


def _try_install_fastpath(surface, options: SurfaceFastPathOptions):
    state = getattr(surface, "_mpl_surface_fastpath_state", None)
    if state is not None:
        setattr(surface, "_mpl_surface_fastpath_reason", "enabled")
        return state

    try:
        state = install_surface_fastpath(surface, options)
        setattr(surface, "_mpl_surface_fastpath_state", state)
        setattr(surface, "_mpl_surface_fastpath_reason", "enabled")
        return state
    except Exception as exc:
        setattr(surface, "_mpl_surface_fastpath_reason", str(exc))
        return None


def disable_fast_surface_globally() -> None:
    if not _GLOBAL_PATCH_STATE["enabled"]:
        return
    axes3d.Axes3D.add_collection3d = _GLOBAL_PATCH_STATE["original_add_collection3d"]
    axes3d.Axes3D.plot_surface = _GLOBAL_PATCH_STATE["original_plot_surface"]
    axes3d.Axes3D.plot_trisurf = _GLOBAL_PATCH_STATE["original_plot_trisurf"]
    _GLOBAL_PATCH_STATE["enabled"] = False
    _GLOBAL_PATCH_STATE["original_add_collection3d"] = None
    _GLOBAL_PATCH_STATE["options"] = None
    _GLOBAL_PATCH_STATE["original_plot_surface"] = None
    _GLOBAL_PATCH_STATE["original_plot_trisurf"] = None


def enable_fast_surface_globally_advanced(
    *,
    threads: int = 0,
    reorder_colors: bool = True,
    enable_lighting: bool = True,
    reuse_paths: bool = True,
    light_dir=(0.25, 0.4, 1.0),
    ambient: float = 0.35,
    diffuse: float = 0.65,
):
    disable_fast_surface_globally()

    options = SurfaceFastPathOptions(
        threads=threads,
        reorder_colors=reorder_colors,
        enable_lighting=enable_lighting,
        reuse_paths=reuse_paths,
        light_dir=light_dir,
        ambient=ambient,
        diffuse=diffuse,
    )

    original_plot_surface = axes3d.Axes3D.plot_surface
    original_plot_trisurf = axes3d.Axes3D.plot_trisurf
    original_add_collection3d = axes3d.Axes3D.add_collection3d

    def patched_add_collection3d(self, col, *args, **kwargs):
        collection = original_add_collection3d(self, col, *args, **kwargs)
        if isinstance(collection, Poly3DCollection):
            _try_install_fastpath(collection, options)
        return collection

    def patched_plot_surface(self, *args, **kwargs):
        surface = original_plot_surface(self, *args, **kwargs)
        _try_install_fastpath(surface, options)
        return surface

    def patched_plot_trisurf(self, *args, **kwargs):
        surface = original_plot_trisurf(self, *args, **kwargs)
        _try_install_fastpath(surface, options)
        return surface

    axes3d.Axes3D.add_collection3d = patched_add_collection3d
    axes3d.Axes3D.plot_surface = patched_plot_surface
    axes3d.Axes3D.plot_trisurf = patched_plot_trisurf

    _GLOBAL_PATCH_STATE["enabled"] = True
    _GLOBAL_PATCH_STATE["original_add_collection3d"] = original_add_collection3d
    _GLOBAL_PATCH_STATE["options"] = options
    _GLOBAL_PATCH_STATE["original_plot_surface"] = original_plot_surface
    _GLOBAL_PATCH_STATE["original_plot_trisurf"] = original_plot_trisurf
