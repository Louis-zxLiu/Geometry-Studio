import os
from pathlib import Path


def _configure_windows_dll_path() -> None:
    if not hasattr(os, "add_dll_directory"):
        return
    package_dir = Path(__file__).resolve().parent
    runtime_root = package_dir.parents[3]
    candidates = [
        Path("D:/msys2/mingw64/bin"),
        runtime_root / "DLLs",
        package_dir,
    ]
    for candidate in candidates:
        if candidate.exists():
            os.add_dll_directory(str(candidate))


_configure_windows_dll_path()

from ._surface_fastpath import (
    build_closed_path_buffers,
    process_polygon_faces,
    process_uniform_faces,
    update_paths_vertices,
    update_paths_vertices_variable,
)

__all__ = [
    "build_closed_path_buffers",
    "process_polygon_faces",
    "process_uniform_faces",
    "update_paths_vertices",
    "update_paths_vertices_variable",
]
