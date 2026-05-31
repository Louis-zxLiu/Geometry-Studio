#include "common.hpp"

#include <algorithm>

#include <pybind11/numpy.h>
#include <pybind11/pybind11.h>

namespace py = pybind11;
using surface_fastpath::PipelineInputs;
using surface_fastpath::PipelineOutputs;
using surface_fastpath::PolygonPipelineInputs;
using surface_fastpath::PolygonPipelineOutputs;
using surface_fastpath::run_face_pipeline;
using surface_fastpath::run_polygon_pipeline;

namespace {

py::array_t<double> vector_to_array_1d(std::vector<double>&& values) {
    py::array_t<double> out(values.size());
    auto view = out.mutable_unchecked<1>();
    for (py::ssize_t i = 0; i < view.shape(0); ++i) {
        view(i) = values[static_cast<std::size_t>(i)];
    }
    return out;
}

py::array_t<std::int64_t> vector_to_array_i64(std::vector<std::int64_t>&& values) {
    py::array_t<std::int64_t> out(values.size());
    auto view = out.mutable_unchecked<1>();
    for (py::ssize_t i = 0; i < view.shape(0); ++i) {
        view(i) = values[static_cast<std::size_t>(i)];
    }
    return out;
}

py::array_t<double> reshape_faces(
    std::vector<double>&& values,
    std::int64_t num_faces,
    std::int64_t verts_per_face
) {
    py::array_t<double> out({num_faces, verts_per_face, static_cast<std::int64_t>(2)});
    auto view = out.mutable_unchecked<3>();
    std::size_t offset = 0;
    for (std::int64_t face = 0; face < num_faces; ++face) {
        for (std::int64_t point = 0; point < verts_per_face; ++point) {
            view(face, point, 0) = values[offset++];
            view(face, point, 1) = values[offset++];
        }
    }
    return out;
}

py::array_t<double> reshape_rgba(std::vector<double>&& values, std::int64_t num_faces) {
    py::array_t<double> out({num_faces, static_cast<std::int64_t>(4)});
    auto view = out.mutable_unchecked<2>();
    std::size_t offset = 0;
    for (std::int64_t face = 0; face < num_faces; ++face) {
        for (std::int64_t channel = 0; channel < 4; ++channel) {
            view(face, channel) = values[offset++];
        }
    }
    return out;
}

py::array_t<double> reshape_points(std::vector<double>&& values) {
    const std::int64_t num_points = static_cast<std::int64_t>(values.size() / 2);
    py::array_t<double> out({num_points, static_cast<std::int64_t>(2)});
    auto view = out.mutable_unchecked<2>();
    std::size_t offset = 0;
    for (std::int64_t point = 0; point < num_points; ++point) {
        view(point, 0) = values[offset++];
        view(point, 1) = values[offset++];
    }
    return out;
}

py::dict build_closed_path_buffers(
    py::array_t<double, py::array::c_style | py::array::forcecast> verts,
    bool closed
) {
    if (verts.ndim() != 3 || verts.shape(2) != 2) {
        throw std::runtime_error("verts must have shape (num_faces, verts_per_face, 2)");
    }

    const py::ssize_t num_faces = verts.shape(0);
    const py::ssize_t verts_per_face = verts.shape(1);
    const py::ssize_t out_points = closed ? verts_per_face + 1 : verts_per_face;

    py::array_t<double> verts_out({num_faces, out_points, static_cast<py::ssize_t>(2)});
    auto src = verts.unchecked<3>();
    auto dst = verts_out.mutable_unchecked<3>();

    for (py::ssize_t face = 0; face < num_faces; ++face) {
        for (py::ssize_t point = 0; point < verts_per_face; ++point) {
            dst(face, point, 0) = src(face, point, 0);
            dst(face, point, 1) = src(face, point, 1);
        }
        if (closed) {
            dst(face, out_points - 1, 0) = src(face, 0, 0);
            dst(face, out_points - 1, 1) = src(face, 0, 1);
        }
    }

    py::dict payload;
    payload["verts"] = verts_out;
    if (closed) {
        py::array_t<std::uint8_t> codes(out_points);
        auto codes_view = codes.mutable_unchecked<1>();
        for (py::ssize_t i = 0; i < out_points; ++i) {
            codes_view(i) = static_cast<std::uint8_t>(py::module_::import("matplotlib.path").attr("Path").attr("LINETO").cast<int>());
        }
        codes_view(0) = static_cast<std::uint8_t>(py::module_::import("matplotlib.path").attr("Path").attr("MOVETO").cast<int>());
        codes_view(out_points - 1) = static_cast<std::uint8_t>(py::module_::import("matplotlib.path").attr("Path").attr("CLOSEPOLY").cast<int>());
        payload["codes"] = codes;
    } else {
        payload["codes"] = py::none();
    }
    return payload;
}

bool update_paths_vertices(
    py::iterable paths,
    py::array_t<double, py::array::c_style | py::array::forcecast> verts,
    bool closed
) {
    if (verts.ndim() != 3 || verts.shape(2) != 2) {
        throw std::runtime_error("verts must have shape (num_faces, verts_per_face, 2)");
    }

    const py::ssize_t num_faces = verts.shape(0);
    const py::ssize_t verts_per_face = verts.shape(1);
    const py::ssize_t expected_rows = closed ? verts_per_face + 1 : verts_per_face;

    auto verts_view = verts.unchecked<3>();
    py::ssize_t path_index = 0;
    for (py::handle path_obj : paths) {
        if (path_index >= num_faces) {
            return false;
        }

        py::object vertices_obj = path_obj.attr("_vertices");
        py::array vertices_array = py::cast<py::array>(vertices_obj);
        if (vertices_array.ndim() != 2 || vertices_array.shape(0) != expected_rows ||
            vertices_array.shape(1) != 2) {
            return false;
        }

        auto dst = vertices_array.mutable_unchecked<double, 2>();
        for (py::ssize_t point = 0; point < verts_per_face; ++point) {
            dst(point, 0) = verts_view(path_index, point, 0);
            dst(point, 1) = verts_view(path_index, point, 1);
        }

        if (closed) {
            dst(expected_rows - 1, 0) = verts_view(path_index, 0, 0);
            dst(expected_rows - 1, 1) = verts_view(path_index, 0, 1);
        }

        ++path_index;
    }

    return path_index == num_faces;
}

bool update_paths_vertices_variable(
    py::iterable paths,
    py::array_t<double, py::array::c_style | py::array::forcecast> verts_flat,
    py::array_t<std::int64_t, py::array::c_style | py::array::forcecast> face_starts,
    py::array_t<std::int64_t, py::array::c_style | py::array::forcecast> face_lengths,
    bool closed
) {
    if (verts_flat.ndim() != 2 || verts_flat.shape(1) != 2) {
        throw std::runtime_error("verts_flat must have shape (num_points, 2)");
    }
    if (face_starts.ndim() != 1 || face_lengths.ndim() != 1 ||
        face_starts.shape(0) != face_lengths.shape(0)) {
        throw std::runtime_error("face_starts and face_lengths must be matching 1D arrays");
    }

    auto verts_view = verts_flat.unchecked<2>();
    auto starts_view = face_starts.unchecked<1>();
    auto lengths_view = face_lengths.unchecked<1>();

    py::ssize_t path_index = 0;
    for (py::handle path_obj : paths) {
        if (path_index >= face_lengths.shape(0)) {
            return false;
        }

        const py::ssize_t start = static_cast<py::ssize_t>(starts_view(path_index));
        const py::ssize_t length = static_cast<py::ssize_t>(lengths_view(path_index));
        const py::ssize_t min_rows = closed ? length + 1 : length;

        py::object vertices_obj = path_obj.attr("_vertices");
        py::array vertices_array = py::cast<py::array>(vertices_obj);
        if (vertices_array.ndim() != 2 || vertices_array.shape(0) < min_rows ||
            vertices_array.shape(1) != 2) {
            return false;
        }

        auto dst = vertices_array.mutable_unchecked<double, 2>();
        for (py::ssize_t point = 0; point < length; ++point) {
            dst(point, 0) = verts_view(start + point, 0);
            dst(point, 1) = verts_view(start + point, 1);
        }
        const py::ssize_t close_row = vertices_array.shape(0) - 1;
        const py::ssize_t fill_until = closed ? close_row : vertices_array.shape(0);
        for (py::ssize_t point = length; point < fill_until; ++point) {
            dst(point, 0) = verts_view(start + length - 1, 0);
            dst(point, 1) = verts_view(start + length - 1, 1);
        }
        if (closed) {
            dst(close_row, 0) = verts_view(start, 0);
            dst(close_row, 1) = verts_view(start, 1);
        }

        ++path_index;
    }
    return path_index == face_lengths.shape(0);
}

py::dict process_uniform_faces(
    py::array_t<double, py::array::c_style | py::array::forcecast> txs,
    py::array_t<double, py::array::c_style | py::array::forcecast> tys,
    py::array_t<double, py::array::c_style | py::array::forcecast> tzs,
    py::array_t<double, py::array::c_style | py::array::forcecast> x3d,
    py::array_t<double, py::array::c_style | py::array::forcecast> y3d,
    py::array_t<double, py::array::c_style | py::array::forcecast> z3d,
    py::array_t<std::int64_t, py::array::c_style | py::array::forcecast> starts,
    std::int64_t verts_per_face,
    py::array_t<double, py::array::c_style | py::array::forcecast> facecolors,
    py::array_t<double, py::array::c_style | py::array::forcecast> edgecolors,
    bool reorder_colors,
    bool enable_lighting,
    py::tuple light_dir,
    double ambient,
    double diffuse,
    int threads
) {
    if (light_dir.size() != 3) {
        throw std::runtime_error("light_dir must have 3 values");
    }
    if (facecolors.ndim() != 2 || facecolors.shape(1) != 4) {
        throw std::runtime_error("facecolors must have shape (n, 4)");
    }
    if (edgecolors.ndim() != 2 || edgecolors.shape(1) != 4) {
        throw std::runtime_error("edgecolors must have shape (n, 4)");
    }

    PipelineInputs inputs{
        txs.data(),
        tys.data(),
        tzs.data(),
        x3d.data(),
        y3d.data(),
        z3d.data(),
        starts.data(),
        facecolors.data(),
        edgecolors.data(),
        starts.shape(0),
        verts_per_face,
        facecolors.shape(0),
        edgecolors.shape(0),
        reorder_colors,
        enable_lighting,
        {
            light_dir[0].cast<double>(),
            light_dir[1].cast<double>(),
            light_dir[2].cast<double>(),
        },
        ambient,
        diffuse,
        threads,
    };

    PipelineOutputs outputs = run_face_pipeline(inputs);
    py::dict payload;
    payload["verts"] = reshape_faces(
        std::move(outputs.verts),
        inputs.num_faces,
        inputs.verts_per_face
    );
    payload["indices"] = vector_to_array_i64(std::move(outputs.indices));
    payload["zkeys"] = vector_to_array_1d(std::move(outputs.zkeys));
    payload["lighting"] = vector_to_array_1d(std::move(outputs.lighting));
    payload["facecolors"] = reshape_rgba(std::move(outputs.facecolors), inputs.num_faces);
    payload["edgecolors"] = reshape_rgba(std::move(outputs.edgecolors), inputs.num_faces);
    if (tzs.size() > 0) {
        auto tzs_view = tzs.unchecked<1>();
        double min_tz = tzs_view(0);
        for (py::ssize_t i = 1; i < tzs_view.shape(0); ++i) {
            min_tz = std::min(min_tz, tzs_view(i));
        }
        payload["min_tz"] = min_tz;
    } else {
        payload["min_tz"] = py::float_(0.0);
    }
    return payload;
}

py::dict process_polygon_faces(
    py::array_t<double, py::array::c_style | py::array::forcecast> txs,
    py::array_t<double, py::array::c_style | py::array::forcecast> tys,
    py::array_t<double, py::array::c_style | py::array::forcecast> tzs,
    py::array_t<double, py::array::c_style | py::array::forcecast> x3d,
    py::array_t<double, py::array::c_style | py::array::forcecast> y3d,
    py::array_t<double, py::array::c_style | py::array::forcecast> z3d,
    py::array_t<std::int64_t, py::array::c_style | py::array::forcecast> starts,
    py::array_t<std::int64_t, py::array::c_style | py::array::forcecast> lengths,
    py::array_t<double, py::array::c_style | py::array::forcecast> facecolors,
    py::array_t<double, py::array::c_style | py::array::forcecast> edgecolors,
    bool reorder_colors,
    bool enable_lighting,
    py::tuple light_dir,
    double ambient,
    double diffuse,
    int threads
) {
    if (light_dir.size() != 3) {
        throw std::runtime_error("light_dir must have 3 values");
    }
    if (facecolors.ndim() != 2 || facecolors.shape(1) != 4) {
        throw std::runtime_error("facecolors must have shape (n, 4)");
    }
    if (edgecolors.ndim() != 2 || edgecolors.shape(1) != 4) {
        throw std::runtime_error("edgecolors must have shape (n, 4)");
    }
    if (starts.ndim() != 1 || lengths.ndim() != 1 || starts.shape(0) != lengths.shape(0)) {
        throw std::runtime_error("starts and lengths must be matching 1D arrays");
    }

    PolygonPipelineInputs inputs{
        txs.data(),
        tys.data(),
        tzs.data(),
        x3d.data(),
        y3d.data(),
        z3d.data(),
        starts.data(),
        lengths.data(),
        facecolors.data(),
        edgecolors.data(),
        starts.shape(0),
        facecolors.shape(0),
        edgecolors.shape(0),
        reorder_colors,
        enable_lighting,
        {
            light_dir[0].cast<double>(),
            light_dir[1].cast<double>(),
            light_dir[2].cast<double>(),
        },
        ambient,
        diffuse,
        threads,
    };

    PolygonPipelineOutputs outputs = run_polygon_pipeline(inputs);
    py::dict payload;
    payload["verts_flat"] = reshape_points(std::move(outputs.verts_flat));
    payload["face_starts"] = vector_to_array_i64(std::move(outputs.face_starts));
    payload["face_lengths"] = vector_to_array_i64(std::move(outputs.face_lengths));
    payload["indices"] = vector_to_array_i64(std::move(outputs.indices));
    payload["zkeys"] = vector_to_array_1d(std::move(outputs.zkeys));
    payload["lighting"] = vector_to_array_1d(std::move(outputs.lighting));
    payload["facecolors"] = reshape_rgba(std::move(outputs.facecolors), inputs.num_faces);
    payload["edgecolors"] = reshape_rgba(std::move(outputs.edgecolors), inputs.num_faces);
    if (tzs.size() > 0) {
        auto tzs_view = tzs.unchecked<1>();
        double min_tz = tzs_view(0);
        for (py::ssize_t i = 1; i < tzs_view.shape(0); ++i) {
            min_tz = std::min(min_tz, tzs_view(i));
        }
        payload["min_tz"] = min_tz;
    } else {
        payload["min_tz"] = py::float_(0.0);
    }
    return payload;
}

}  // namespace

PYBIND11_MODULE(_surface_fastpath, m) {
    m.doc() = "Tri/quad Matplotlib surface face pipeline accelerator";
    m.def(
        "process_uniform_faces",
        &process_uniform_faces,
        py::arg("txs"),
        py::arg("tys"),
        py::arg("tzs"),
        py::arg("x3d"),
        py::arg("y3d"),
        py::arg("z3d"),
        py::arg("starts"),
        py::arg("verts_per_face"),
        py::arg("facecolors"),
        py::arg("edgecolors"),
        py::arg("reorder_colors") = true,
        py::arg("enable_lighting") = true,
        py::arg("light_dir") = py::make_tuple(0.25, 0.4, 1.0),
        py::arg("ambient") = 0.35,
        py::arg("diffuse") = 0.65,
        py::arg("threads") = 0
    );
    m.def(
        "update_paths_vertices",
        &update_paths_vertices,
        py::arg("paths"),
        py::arg("verts"),
        py::arg("closed") = true
    );
    m.def(
        "update_paths_vertices_variable",
        &update_paths_vertices_variable,
        py::arg("paths"),
        py::arg("verts_flat"),
        py::arg("face_starts"),
        py::arg("face_lengths"),
        py::arg("closed") = true
    );
    m.def(
        "build_closed_path_buffers",
        &build_closed_path_buffers,
        py::arg("verts"),
        py::arg("closed") = true
    );
    m.def(
        "process_polygon_faces",
        &process_polygon_faces,
        py::arg("txs"),
        py::arg("tys"),
        py::arg("tzs"),
        py::arg("x3d"),
        py::arg("y3d"),
        py::arg("z3d"),
        py::arg("starts"),
        py::arg("lengths"),
        py::arg("facecolors"),
        py::arg("edgecolors"),
        py::arg("reorder_colors") = true,
        py::arg("enable_lighting") = true,
        py::arg("light_dir") = py::make_tuple(0.25, 0.4, 1.0),
        py::arg("ambient") = 0.35,
        py::arg("diffuse") = 0.65,
        py::arg("threads") = 0
    );
}
