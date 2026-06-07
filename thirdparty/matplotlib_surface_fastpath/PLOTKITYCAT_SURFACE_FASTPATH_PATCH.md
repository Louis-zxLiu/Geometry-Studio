# PlotKityCat Surface Fast Path Patch

## What this patch does

This patch accelerates Matplotlib 3D surface redraw for regular triangle and quad
surface meshes.

It targets the expensive redraw pipeline in `plot_surface(...)` and similar surface
artists:

- C++ batch rebuild for face payload
- C++ sorting, lighting, and color reorder
- reuse of existing Matplotlib `Path` objects instead of rebuilding them every frame

In practice, the patch is designed for interactive rotation and repeated redraw of:

- spheres
- planes
- regular height fields
- other uniform tri/quad surface meshes

## What it does not try to solve

This is a focused surface patch, not a general rewrite of all `mplot3d` artists.

Current fast path intentionally avoids some complex internal branches, such as:

- `axlim_clip`
- `codes3d`
- non-uniform polygon sizes

If the artist does not match the fast-path assumptions, it should not be patched.

## Recommended API

For normal use, keep the call site to one line:

```python
from mpl_surface_fastpath import enable_fast_surface

surface = ax.plot_surface(...)
enable_fast_surface(surface)
```

This enables the full optimized path:

- C++ face rebuild
- lighting and color reorder
- path reuse
- automatic/default threading

If the application wants automatic patching for all new 3D surfaces, use the
global API:

```python
from mpl_surface_fastpath import enable_fast_surface_globally

enable_fast_surface_globally()
```

After that, new `ax.plot_surface(...)` and `ax.plot_trisurf(...)` calls are
patched automatically.

To remove the patch from the artist:

```python
from mpl_surface_fastpath import disable_fast_surface

disable_fast_surface(surface)
```

## Advanced API

The advanced entry point exists for tuning and troubleshooting:

```python
from mpl_surface_fastpath import enable_fast_surface_advanced

enable_fast_surface_advanced(
    surface,
    threads=8,
    reorder_colors=True,
    enable_lighting=True,
    reuse_paths=True,
)
```

There is also a global advanced entry point:

```python
from mpl_surface_fastpath import enable_fast_surface_globally_advanced

enable_fast_surface_globally_advanced(
    threads=8,
    reorder_colors=True,
    enable_lighting=True,
    reuse_paths=True,
)
```

Use the advanced API when the software author wants to control:

- `threads`
  number of worker threads for the C++ face pipeline
- `reorder_colors`
  whether reordered face and edge colors are handled inside the fast path
- `enable_lighting`
  whether face lighting stays in the fast path
- `reuse_paths`
  whether existing Matplotlib `Path` objects are reused instead of rebuilt
- `light_dir`, `ambient`, `diffuse`
  lighting controls for the fast path

## Files that must ship in runtime

The runtime package needs the Python package files:

- `mpl_surface_fastpath/__init__.py`
- `mpl_surface_fastpath/_backend.py`
- `mpl_surface_fastpath/adapter.py`
- `mpl_surface_fastpath/install.py`
- compiled extension:
  - `_surface_fastpath.cp313-win_amd64.pyd` for Python 3.13 runtime

The runtime also needs the MinGW/OpenMP DLLs used by the compiled extension:

- `libgomp-1.dll`
- `libstdc++-6.dll`
- `libgcc_s_seh-1.dll`
- `libwinpthread-1.dll`

## Runtime integration note

PlotKityCat currently ships a Python 3.13 runtime.

Keep the runtime package aligned with that ABI and include the matching
`_surface_fastpath.cp313-win_amd64.pyd`.

The repository may still keep other builds such as `cp312` for development
reference, but only the ABI-matching binary should be injected into the shipped
runtime.

## Minimal usage example

```python
import matplotlib.pyplot as plt
from mpl_surface_fastpath import enable_fast_surface

fig = plt.figure()
ax = fig.add_subplot(111, projection="3d")
surface = ax.plot_surface(x, y, z)
enable_fast_surface(surface)
plt.show()
```

## Current status

This patch is suitable for targeted runtime integration in PlotKityCat.

It is already effective for interactive redraw of regular surfaces, but it should
still be treated as a targeted optimization patch rather than a general public
Matplotlib extension.
