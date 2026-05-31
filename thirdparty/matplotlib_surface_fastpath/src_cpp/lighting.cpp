#include "common.hpp"

#include <algorithm>
#include <cmath>

namespace surface_fastpath {

namespace {

struct Vec3 {
    double x;
    double y;
    double z;
};

Vec3 normalized(Vec3 v) {
    const double mag = std::sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    if (mag == 0.0) {
        return {0.0, 0.0, 1.0};
    }
    return {v.x / mag, v.y / mag, v.z / mag};
}

Vec3 cross(Vec3 a, Vec3 b) {
    return {
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x,
    };
}

}  // namespace

double compute_face_lighting(
    const PipelineInputs& inputs,
    std::int64_t start,
    std::int64_t verts_per_face
) {
    if (!inputs.enable_lighting || verts_per_face < 3) {
        return 1.0;
    }

    const Vec3 p0{inputs.x3d[start], inputs.y3d[start], inputs.z3d[start]};
    const Vec3 p1{
        inputs.x3d[start + 1],
        inputs.y3d[start + 1],
        inputs.z3d[start + 1],
    };
    const Vec3 p2{
        inputs.x3d[start + 2],
        inputs.y3d[start + 2],
        inputs.z3d[start + 2],
    };

    const Vec3 e1{p1.x - p0.x, p1.y - p0.y, p1.z - p0.z};
    const Vec3 e2{p2.x - p0.x, p2.y - p0.y, p2.z - p0.z};
    const Vec3 normal = normalized(cross(e1, e2));
    const Vec3 light = normalized({
        inputs.light_dir[0],
        inputs.light_dir[1],
        inputs.light_dir[2],
    });

    const double lambert =
        std::max(0.0, normal.x * light.x + normal.y * light.y + normal.z * light.z);
    return std::clamp(inputs.ambient + inputs.diffuse * lambert, 0.0, 1.0);
}

double compute_polygon_face_lighting(
    const PolygonPipelineInputs& inputs,
    std::int64_t start,
    std::int64_t verts_per_face
) {
    if (!inputs.enable_lighting || verts_per_face < 3) {
        return 1.0;
    }

    const Vec3 p0{inputs.x3d[start], inputs.y3d[start], inputs.z3d[start]};
    const Vec3 p1{
        inputs.x3d[start + 1],
        inputs.y3d[start + 1],
        inputs.z3d[start + 1],
    };
    const Vec3 p2{
        inputs.x3d[start + 2],
        inputs.y3d[start + 2],
        inputs.z3d[start + 2],
    };

    const Vec3 e1{p1.x - p0.x, p1.y - p0.y, p1.z - p0.z};
    const Vec3 e2{p2.x - p0.x, p2.y - p0.y, p2.z - p0.z};
    const Vec3 normal = normalized(cross(e1, e2));
    const Vec3 light = normalized({
        inputs.light_dir[0],
        inputs.light_dir[1],
        inputs.light_dir[2],
    });

    const double lambert =
        std::max(0.0, normal.x * light.x + normal.y * light.y + normal.z * light.z);
    return std::clamp(inputs.ambient + inputs.diffuse * lambert, 0.0, 1.0);
}

}  // namespace surface_fastpath
