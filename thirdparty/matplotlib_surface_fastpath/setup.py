from pathlib import Path
import os
import sys

import pybind11
from pybind11.setup_helpers import build_ext
from setuptools import Extension, find_packages, setup


ROOT = Path(__file__).resolve().parent


def extension_args():
    compile_args = ["-O3", "-std=c++17"]
    link_args = []
    compiler_hint = f"{os.environ.get('CC', '')} {os.environ.get('CXX', '')}".lower()
    use_gnu_on_windows = sys.platform.startswith("win") and any(
        token in compiler_hint for token in ("g++", "gcc", "mingw")
    )

    if sys.platform.startswith("win") and not use_gnu_on_windows:
        compile_args = ["/O2", "/std:c++17", "/openmp"]
    elif sys.platform.startswith("win"):
        compile_args.extend(["-fopenmp", "-DMS_WIN64"])
        link_args.append("-fopenmp")
    elif sys.platform == "darwin":
        compile_args.extend(["-Xpreprocessor", "-fopenmp"])
        link_args.append("-lomp")
    else:
        compile_args.append("-fopenmp")
        link_args.append("-fopenmp")

    return compile_args, link_args


extra_compile_args, extra_link_args = extension_args()

ext_modules = [
    Extension(
        "mpl_surface_fastpath._surface_fastpath",
        [
            "src_cpp/module.cpp",
            "src_cpp/face_pipeline.cpp",
            "src_cpp/lighting.cpp",
        ],
        include_dirs=[pybind11.get_include()],
        extra_compile_args=extra_compile_args,
        extra_link_args=extra_link_args,
    )
]


setup(
    name="mpl-surface-fastpath",
    version="0.1.0",
    description="Compiled tri/quad surface fast path for Matplotlib mplot3d",
    packages=find_packages("src"),
    package_dir={"": "src"},
    ext_modules=ext_modules,
    cmdclass={"build_ext": build_ext},
    zip_safe=False,
)
