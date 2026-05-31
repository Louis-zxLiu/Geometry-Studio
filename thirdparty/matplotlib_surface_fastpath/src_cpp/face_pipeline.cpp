#include "common.hpp"

#include <algorithm>
#include <cmath>
#include <numeric>

#ifdef _OPENMP
#include <omp.h>
#endif

namespace surface_fastpath {

namespace {

int effective_threads(int requested, std::int64_t num_faces) {
    if (requested > 0) {
        return requested;
    }
#ifdef _OPENMP
    if (num_faces >= 128) {
        return omp_get_max_threads();
    }
#endif
    return 1;
}

void shade_rgba(const double* src, double factor, double* dst) {
    dst[0] = src[0] * factor;
    dst[1] = src[1] * factor;
    dst[2] = src[2] * factor;
    dst[3] = src[3];
}

}  // namespace

PipelineOutputs run_face_pipeline(const PipelineInputs& inputs) {
    if (inputs.verts_per_face != 3 && inputs.verts_per_face != 4) {
        throw std::runtime_error("verts_per_face must be 3 or 4");
    }

    PipelineOutputs outputs;
    outputs.verts.resize(
        static_cast<std::size_t>(inputs.num_faces * inputs.verts_per_face * 2)
    );
    outputs.indices.resize(static_cast<std::size_t>(inputs.num_faces));
    outputs.zkeys.resize(static_cast<std::size_t>(inputs.num_faces));
    outputs.lighting.resize(static_cast<std::size_t>(inputs.num_faces), 1.0);
    outputs.facecolors.resize(static_cast<std::size_t>(inputs.num_faces * 4));
    outputs.edgecolors.resize(static_cast<std::size_t>(inputs.num_faces * 4));

    std::vector<FaceSortKey> sort_keys(static_cast<std::size_t>(inputs.num_faces));
    const int num_threads = effective_threads(inputs.threads, inputs.num_faces);

#ifdef _OPENMP
#pragma omp parallel for if (num_threads > 1) num_threads(num_threads)
#endif
    for (std::int64_t face = 0; face < inputs.num_faces; ++face) {
        const std::int64_t start = inputs.starts[face];
        double z_sum = 0.0;
        for (std::int64_t point = 0; point < inputs.verts_per_face; ++point) {
            z_sum += inputs.tzs[start + point];
        }
        sort_keys[static_cast<std::size_t>(face)] = {
            z_sum / static_cast<double>(inputs.verts_per_face),
            face,
        };
        outputs.lighting[static_cast<std::size_t>(face)] =
            compute_face_lighting(inputs, start, inputs.verts_per_face);
    }

    std::sort(
        sort_keys.begin(),
        sort_keys.end(),
        [](const FaceSortKey& left, const FaceSortKey& right) {
            return left.z_key > right.z_key;
        }
    );

#ifdef _OPENMP
#pragma omp parallel for if (num_threads > 1) num_threads(num_threads)
#endif
    for (std::int64_t sorted_face = 0; sorted_face < inputs.num_faces; ++sorted_face) {
        const auto& sort_key = sort_keys[static_cast<std::size_t>(sorted_face)];
        const std::int64_t source_face = sort_key.face_index;
        const std::int64_t start = inputs.starts[source_face];
        const std::size_t out_index = static_cast<std::size_t>(sorted_face);

        outputs.indices[out_index] = source_face;
        outputs.zkeys[out_index] = sort_key.z_key;

        for (std::int64_t point = 0; point < inputs.verts_per_face; ++point) {
            const std::size_t out_base = static_cast<std::size_t>(
                (sorted_face * inputs.verts_per_face + point) * 2
            );
            outputs.verts[out_base] = inputs.txs[start + point];
            outputs.verts[out_base + 1] = inputs.tys[start + point];
        }

        const double lighting = outputs.lighting[static_cast<std::size_t>(source_face)];
        const std::int64_t facecolor_row =
            inputs.facecolor_rows == 0 ? -1 : std::min<std::int64_t>(inputs.facecolor_rows - 1, source_face);
        const std::int64_t edgecolor_row =
            inputs.edgecolor_rows == 0 ? facecolor_row : std::min<std::int64_t>(inputs.edgecolor_rows - 1, source_face);

        double* out_face = &outputs.facecolors[out_index * 4];
        double* out_edge = &outputs.edgecolors[out_index * 4];

        if (inputs.reorder_colors && facecolor_row >= 0) {
            shade_rgba(inputs.facecolors + facecolor_row * 4, lighting, out_face);
        } else {
            out_face[0] = 0.0;
            out_face[1] = 0.0;
            out_face[2] = 0.0;
            out_face[3] = 0.0;
        }

        if (inputs.reorder_colors && edgecolor_row >= 0) {
            shade_rgba(inputs.edgecolors + edgecolor_row * 4, lighting, out_edge);
        } else {
            out_edge[0] = out_face[0];
            out_edge[1] = out_face[1];
            out_edge[2] = out_face[2];
            out_edge[3] = out_face[3];
        }
    }

    return outputs;
}

PolygonPipelineOutputs run_polygon_pipeline(const PolygonPipelineInputs& inputs) {
    PolygonPipelineOutputs outputs;
    outputs.face_starts.resize(static_cast<std::size_t>(inputs.num_faces));
    outputs.face_lengths.resize(static_cast<std::size_t>(inputs.num_faces));
    outputs.indices.resize(static_cast<std::size_t>(inputs.num_faces));
    outputs.zkeys.resize(static_cast<std::size_t>(inputs.num_faces));
    outputs.lighting.resize(static_cast<std::size_t>(inputs.num_faces), 1.0);
    outputs.facecolors.resize(static_cast<std::size_t>(inputs.num_faces * 4));
    outputs.edgecolors.resize(static_cast<std::size_t>(inputs.num_faces * 4));

    std::vector<FaceSortKey> sort_keys(static_cast<std::size_t>(inputs.num_faces));
    const int num_threads = effective_threads(inputs.threads, inputs.num_faces);

#ifdef _OPENMP
#pragma omp parallel for if (num_threads > 1) num_threads(num_threads)
#endif
    for (std::int64_t face = 0; face < inputs.num_faces; ++face) {
        const std::int64_t start = inputs.starts[face];
        const std::int64_t length = inputs.lengths[face];
        double z_sum = 0.0;
        for (std::int64_t point = 0; point < length; ++point) {
            z_sum += inputs.tzs[start + point];
        }
        sort_keys[static_cast<std::size_t>(face)] = {
            z_sum / static_cast<double>(length),
            face,
        };
        outputs.lighting[static_cast<std::size_t>(face)] =
            compute_polygon_face_lighting(inputs, start, length);
    }

    std::sort(
        sort_keys.begin(),
        sort_keys.end(),
        [](const FaceSortKey& left, const FaceSortKey& right) {
            return left.z_key > right.z_key;
        }
    );

    std::size_t total_points = 0;
    for (std::int64_t face = 0; face < inputs.num_faces; ++face) {
        const auto source_face = sort_keys[static_cast<std::size_t>(face)].face_index;
        total_points += static_cast<std::size_t>(inputs.lengths[source_face]);
    }
    outputs.verts_flat.resize(total_points * 2);

#ifdef _OPENMP
#pragma omp parallel for if (num_threads > 1) num_threads(num_threads)
#endif
    for (std::int64_t sorted_face = 0; sorted_face < inputs.num_faces; ++sorted_face) {
        const auto& sort_key = sort_keys[static_cast<std::size_t>(sorted_face)];
        const std::int64_t source_face = sort_key.face_index;
        const std::int64_t length = inputs.lengths[source_face];
        outputs.indices[static_cast<std::size_t>(sorted_face)] = source_face;
        outputs.zkeys[static_cast<std::size_t>(sorted_face)] = sort_key.z_key;
        outputs.face_lengths[static_cast<std::size_t>(sorted_face)] = length;

        const double lighting = outputs.lighting[static_cast<std::size_t>(source_face)];
        const std::int64_t facecolor_row =
            inputs.facecolor_rows == 0 ? -1 : std::min<std::int64_t>(inputs.facecolor_rows - 1, source_face);
        const std::int64_t edgecolor_row =
            inputs.edgecolor_rows == 0 ? facecolor_row : std::min<std::int64_t>(inputs.edgecolor_rows - 1, source_face);

        double* out_face = &outputs.facecolors[static_cast<std::size_t>(sorted_face) * 4];
        double* out_edge = &outputs.edgecolors[static_cast<std::size_t>(sorted_face) * 4];

        if (inputs.reorder_colors && facecolor_row >= 0) {
            shade_rgba(inputs.facecolors + facecolor_row * 4, lighting, out_face);
        } else {
            out_face[0] = 0.0;
            out_face[1] = 0.0;
            out_face[2] = 0.0;
            out_face[3] = 0.0;
        }

        if (inputs.reorder_colors && edgecolor_row >= 0) {
            shade_rgba(inputs.edgecolors + edgecolor_row * 4, lighting, out_edge);
        } else {
            out_edge[0] = out_face[0];
            out_edge[1] = out_face[1];
            out_edge[2] = out_face[2];
            out_edge[3] = out_face[3];
        }
    }

    std::size_t out_point_offset = 0;
    for (std::int64_t sorted_face = 0; sorted_face < inputs.num_faces; ++sorted_face) {
        const auto source_face = outputs.indices[static_cast<std::size_t>(sorted_face)];
        const std::int64_t start = inputs.starts[source_face];
        const std::int64_t length = outputs.face_lengths[static_cast<std::size_t>(sorted_face)];
        outputs.face_starts[static_cast<std::size_t>(sorted_face)] =
            static_cast<std::int64_t>(out_point_offset);
        for (std::int64_t point = 0; point < length; ++point) {
            const std::size_t out_base = (out_point_offset + static_cast<std::size_t>(point)) * 2;
            outputs.verts_flat[out_base] = inputs.txs[start + point];
            outputs.verts_flat[out_base + 1] = inputs.tys[start + point];
        }
        out_point_offset += static_cast<std::size_t>(length);
    }

    return outputs;
}

}  // namespace surface_fastpath
