#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <stdexcept>
#include <vector>

namespace surface_fastpath {

struct FaceSortKey {
    double z_key;
    std::int64_t face_index;
};

struct PipelineInputs {
    const double* txs;
    const double* tys;
    const double* tzs;
    const double* x3d;
    const double* y3d;
    const double* z3d;
    const std::int64_t* starts;
    const double* facecolors;
    const double* edgecolors;
    std::int64_t num_faces;
    std::int64_t verts_per_face;
    std::int64_t facecolor_rows;
    std::int64_t edgecolor_rows;
    bool reorder_colors;
    bool enable_lighting;
    std::array<double, 3> light_dir;
    double ambient;
    double diffuse;
    int threads;
};

struct PipelineOutputs {
    std::vector<double> verts;
    std::vector<std::int64_t> indices;
    std::vector<double> zkeys;
    std::vector<double> lighting;
    std::vector<double> facecolors;
    std::vector<double> edgecolors;
};

struct PolygonPipelineInputs {
    const double* txs;
    const double* tys;
    const double* tzs;
    const double* x3d;
    const double* y3d;
    const double* z3d;
    const std::int64_t* starts;
    const std::int64_t* lengths;
    const double* facecolors;
    const double* edgecolors;
    std::int64_t num_faces;
    std::int64_t facecolor_rows;
    std::int64_t edgecolor_rows;
    bool reorder_colors;
    bool enable_lighting;
    std::array<double, 3> light_dir;
    double ambient;
    double diffuse;
    int threads;
};

struct PolygonPipelineOutputs {
    std::vector<double> verts_flat;
    std::vector<std::int64_t> face_starts;
    std::vector<std::int64_t> face_lengths;
    std::vector<std::int64_t> indices;
    std::vector<double> zkeys;
    std::vector<double> lighting;
    std::vector<double> facecolors;
    std::vector<double> edgecolors;
};

PipelineOutputs run_face_pipeline(const PipelineInputs& inputs);
PolygonPipelineOutputs run_polygon_pipeline(const PolygonPipelineInputs& inputs);

double compute_face_lighting(
    const PipelineInputs& inputs,
    std::int64_t start,
    std::int64_t verts_per_face
);

double compute_polygon_face_lighting(
    const PolygonPipelineInputs& inputs,
    std::int64_t start,
    std::int64_t verts_per_face
);

}  // namespace surface_fastpath
