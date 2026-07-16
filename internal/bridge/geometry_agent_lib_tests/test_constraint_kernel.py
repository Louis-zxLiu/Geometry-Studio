from __future__ import annotations

import math
import unittest

from geometry_agent_lib.constraint_compiler import normalize_construction, solve_and_summarize
from geometry_agent_lib.semantic_export import construction_to_scene


def solve(payload):
    construction = normalize_construction(payload, {}, review_status="test")
    return solve_and_summarize(construction)


class ConstraintKernelTest(unittest.TestCase):
    def test_midpoint_and_on_segment(self):
        construction = solve(
            {
                "objects": [
                    {"id": "A", "kind": "point", "role": "given", "label": "A", "attributes": {"x": 0, "y": 0, "fixed": True}},
                    {"id": "B", "kind": "point", "role": "given", "label": "B", "attributes": {"x": 4, "y": 0, "fixed": True}},
                    {"id": "M", "kind": "point", "role": "derived", "label": "M"},
                    {"id": "AB", "kind": "segment", "refs": ["A", "B"]},
                ],
                "constraints": [
                    {"id": "mid", "type": "midpoint", "args": {"point": "M", "a": "A", "b": "B"}},
                    {"id": "on", "type": "on", "args": {"point": "M", "object": "AB"}},
                ],
                "constructionIntent": [{"id": "i1", "summary": "M 是 AB 的中点", "objects": ["M"], "constraints": ["mid", "on"]}],
            }
        )
        self.assertLess(construction["solution"]["maxResidual"], 1e-5)
        self.assertAlmostEqual(construction["solution"]["points"]["M"]["x"], 2.0, places=5)
        self.assertAlmostEqual(construction["solution"]["points"]["M"]["y"], 0.0, places=5)

    def test_circle_tangent_and_angle(self):
        construction = solve(
            {
                "objects": [
                    {"id": "O", "kind": "point", "label": "O", "attributes": {"x": 0, "y": 0, "fixed": True}},
                    {"id": "A", "kind": "point", "label": "A", "attributes": {"x": 1, "y": 0, "fixed": True}},
                    {"id": "T", "kind": "point", "label": "T", "attributes": {"x": 1, "y": 0, "fixed": True}},
                    {"id": "P", "kind": "point", "label": "P"},
                    {"id": "c", "kind": "circle", "refs": ["O", "A"]},
                    {"id": "l", "kind": "line", "refs": ["T", "P"]},
                ],
                "constraints": [
                    {"id": "tan", "type": "tangent", "args": {"line": "l", "circle": "c", "point": "T"}},
                    {"id": "ang", "type": "angle_value", "args": {"a": "O", "vertex": "T", "c": "P", "value": 90}},
                ],
                "constructionIntent": [],
            }
        )
        self.assertLess(construction["solution"]["maxResidual"], 1e-5)
        o = construction["solution"]["points"]["O"]
        t = construction["solution"]["points"]["T"]
        p = construction["solution"]["points"]["P"]
        ot = (o["x"] - t["x"], o["y"] - t["y"])
        tp = (p["x"] - t["x"], p["y"] - t["y"])
        dot = ot[0] * tp[0] + ot[1] * tp[1]
        self.assertAlmostEqual(dot, 0.0, places=4)

    def test_ratio_concyclic_and_scene_export(self):
        construction = solve(
            {
                "objects": [
                    {"id": "A", "kind": "point", "label": "A", "attributes": {"x": 1, "y": 0, "fixed": True}},
                    {"id": "B", "kind": "point", "label": "B", "attributes": {"x": -1, "y": 0, "fixed": True}},
                    {"id": "C", "kind": "point", "label": "C", "attributes": {"x": 0, "y": 1, "fixed": True}},
                    {"id": "D", "kind": "point", "label": "D"},
                    {"id": "O", "kind": "point", "role": "auxiliary", "label": "O", "attributes": {"x": 0, "y": 0, "fixed": True}},
                    {"id": "circ", "kind": "circle", "refs": ["O", "A"]},
                    {"id": "poly", "kind": "polygon", "refs": ["A", "C", "B"]},
                ],
                "constraints": [
                    {"id": "cyc", "type": "concyclic", "args": {"points": ["A", "B", "C", "D"]}},
                    {"id": "on", "type": "on", "args": {"point": "D", "object": "circ"}},
                    {"id": "ratio", "type": "ratio", "args": {"a": "A", "b": "B", "c": "O", "d": "A", "value": 2}},
                ],
                "constructionIntent": [],
            }
        )
        self.assertLess(construction["solution"]["maxResidual"], 1e-5)
        d = construction["solution"]["points"]["D"]
        self.assertAlmostEqual(math.hypot(d["x"], d["y"]), 1.0, places=4)
        scene = construction_to_scene(construction, {"problemText": "测试", "constraints": []})
        self.assertEqual(len(scene["circles"]), 1)
        self.assertEqual(scene["circles"][0]["through"], "A")
        self.assertEqual(scene["polygons"][0]["points"], ["A", "C", "B"])

    def test_arc_and_three_point_circumcircle_are_exported(self):
        construction = solve(
            {
                "objects": [
                    {"id": "O", "kind": "point", "label": "O", "attributes": {"x": 0, "y": 0, "fixed": True}},
                    {"id": "A", "kind": "point", "label": "A", "attributes": {"x": -1, "y": 0, "fixed": True}},
                    {"id": "B", "kind": "point", "label": "B", "attributes": {"x": 1, "y": 0, "fixed": True}},
                    {"id": "T", "kind": "point", "label": "T", "attributes": {"x": 0, "y": 1, "fixed": True}},
                    {"id": "D", "kind": "point", "label": "D", "attributes": {"x": 0.5, "y": 0.5, "fixed": True}},
                    {"id": "P", "kind": "point", "label": "P", "attributes": {"x": -0.5, "y": 0.5, "fixed": True}},
                    {"id": "Omega_circle", "kind": "circle", "refs": ["O", "A"], "label": "Omega_circle"},
                    {"id": "Omega", "kind": "arc", "refs": ["O", "A", "B"], "label": "Ω"},
                    {"id": "circ_TDP", "kind": "circle", "refs": ["T", "D", "P"], "label": "circ(TDP)"},
                ],
                "constraints": [
                    {"id": "a_on", "type": "on", "args": {"point": "T", "object": "Omega_circle"}},
                    {"id": "d_on", "type": "on", "args": {"point": "D", "object": "circ_TDP"}},
                    {"id": "p_on", "type": "on", "args": {"point": "P", "object": "circ_TDP"}},
                ],
                "constructionIntent": [],
            }
        )
        self.assertLess(construction["solution"]["maxResidual"], 1e-5)
        scene = construction_to_scene(construction, {"problemText": "半圆弧与外接圆", "constraints": []})
        self.assertEqual(scene["arcs"][0]["id"], "Omega")
        circumcircle = {circle["id"]: circle for circle in scene["circles"]}["circ_TDP"]
        self.assertTrue(circumcircle["center"].startswith("__center_"))
        self.assertGreater(circumcircle["radius"], 0)

    def test_near_collinear_three_point_circumcircle_is_rejected(self):
        construction = solve(
            {
                "objects": [
                    {"id": "A", "kind": "point", "label": "A", "attributes": {"x": 6.13453968, "y": 6.70531487, "fixed": True}},
                    {"id": "B", "kind": "point", "label": "B", "attributes": {"x": -2.74151453, "y": -3.68009342, "fixed": True}},
                    {"id": "C", "kind": "point", "label": "C", "attributes": {"x": 3.06065011, "y": 3.10849151, "fixed": True}},
                    {"id": "circ_ABC", "kind": "circle", "refs": ["A", "B", "C"], "label": "circ(ABC)"},
                ],
                "constraints": [],
                "constructionIntent": [],
            }
        )
        self.assertFalse(construction["validation"]["solverOk"])
        failed = construction["validation"]["failedItems"]
        self.assertTrue(
            any(item["target"] == "quality_circ_ABC_nondegenerate" for item in failed),
            failed,
        )
        self.assertTrue(any("nearly collinear" in item["message"] for item in failed), failed)

    def test_xy_without_fixed_is_initializer_only(self):
        construction = solve(
            {
                "objects": [
                    {"id": "A", "kind": "point", "label": "A", "attributes": {"x": 0, "y": 0, "fixed": True}},
                    {"id": "B", "kind": "point", "label": "B", "attributes": {"x": 2, "y": 0, "fixed": True}},
                    {"id": "P", "kind": "point", "label": "P", "attributes": {"x": 100, "y": 100}},
                    {"id": "AB", "kind": "segment", "refs": ["A", "B"]},
                ],
                "constraints": [
                    {"id": "p_on", "type": "on", "args": {"point": "P", "object": "AB"}},
                    {"id": "ap", "type": "distance_equals", "args": {"left": ["A", "P"], "value": 1}},
                ],
                "constructionIntent": [],
            }
        )
        self.assertLess(construction["solution"]["maxResidual"], 1e-5)
        self.assertAlmostEqual(construction["solution"]["points"]["P"]["x"], 1.0, places=4)
        self.assertAlmostEqual(construction["solution"]["points"]["P"]["y"], 0.0, places=4)

    def test_circumcenter_and_opposite_sides_predicates(self):
        construction = solve(
            {
                "objects": [
                    {"id": "A", "kind": "point", "label": "A", "attributes": {"x": -1, "y": 0, "fixed": True}},
                    {"id": "B", "kind": "point", "label": "B", "attributes": {"x": 1, "y": 0, "fixed": True}},
                    {"id": "C", "kind": "point", "label": "C", "attributes": {"x": 0, "y": 1, "fixed": True}},
                    {"id": "D", "kind": "point", "label": "D", "attributes": {"x": 0, "y": -1, "fixed": True}},
                    {"id": "K", "kind": "point", "label": "K"},
                    {"id": "AB", "kind": "line", "refs": ["A", "B"]},
                ],
                "constraints": [
                    {"id": "center", "type": "circumcenter", "args": {"center": "K", "points": ["A", "C", "D"]}},
                    {"id": "side", "type": "opposite_sides", "args": {"first": "C", "second": "D", "line": "AB"}},
                ],
                "constructionIntent": [],
            }
        )
        self.assertLess(construction["solution"]["maxResidual"], 1e-5)
        self.assertAlmostEqual(construction["solution"]["points"]["K"]["x"], 0.0, places=4)
        self.assertAlmostEqual(construction["solution"]["points"]["K"]["y"], 0.0, places=4)

    def test_convex_polygon_accepts_clockwise_quadrilateral(self):
        construction = solve(
            {
                "objects": [
                    {"id": "A", "kind": "point", "label": "A", "attributes": {"x": 0, "y": 0, "fixed": True}},
                    {"id": "B", "kind": "point", "label": "B", "attributes": {"x": 0, "y": 1, "fixed": True}},
                    {"id": "C", "kind": "point", "label": "C", "attributes": {"x": 1, "y": 1, "fixed": True}},
                    {"id": "D", "kind": "point", "label": "D", "attributes": {"x": 1, "y": 0, "fixed": True}},
                    {"id": "quad_ABCD", "kind": "polygon", "refs": ["A", "B", "C", "D"], "label": "ABCD"},
                ],
                "constraints": [
                    {"id": "convex", "type": "convex_quadrilateral", "args": {"object": "quad_ABCD"}},
                ],
                "constructionIntent": [],
            }
        )
        self.assertLess(construction["solution"]["maxResidual"], 1e-5)

    def test_distinct_points_constraints_are_demoted_from_numeric_solver(self):
        construction = solve(
            {
                "objects": [
                    {"id": "A", "kind": "point", "label": "A", "attributes": {"x": 0, "y": 0, "fixed": True}},
                    {"id": "B", "kind": "point", "label": "B", "attributes": {"x": 1, "y": 0, "fixed": True}},
                ],
                "constraints": [
                    {"id": "not_endpoint", "type": "distinct_points", "args": {"points": ["A", "B"]}, "required": True},
                ],
                "constructionIntent": [],
            }
        )

        constraint = construction["constraints"][0]
        self.assertFalse(constraint["required"])
        self.assertEqual(constraint["weight"], 0.0)
        self.assertNotIn("unsupported constraint type", construction["validation"]["summary"])
        self.assertTrue(construction["validation"]["solverOk"])
        self.assertTrue(any("distinct" in item or "点不等" in item for item in construction["diagnostics"]))

    def test_implicit_orientation_branch_is_relaxed_to_auto(self):
        construction = normalize_construction(
            {
                "objects": [
                    {"id": "A", "kind": "point", "label": "A"},
                    {"id": "B", "kind": "point", "label": "B"},
                    {"id": "C", "kind": "point", "label": "C"},
                ],
                "constraints": [
                    {"id": "orient", "type": "orientation", "args": {"a": "A", "b": "B", "c": "C", "value": "ccw"}},
                ],
                "constructionIntent": [],
            },
            {"problemText": "在凸四边形ABCD中，连接AC。", "constraints": []},
            review_status="test",
        )
        self.assertEqual(construction["constraints"][0]["args"]["value"], "auto")
        self.assertIn("orientation 分支约束改为 auto", construction["diagnostics"][0])

    def test_explicit_clockwise_orientation_is_preserved(self):
        construction = normalize_construction(
            {
                "objects": [
                    {"id": "A", "kind": "point", "label": "A"},
                    {"id": "B", "kind": "point", "label": "B"},
                    {"id": "C", "kind": "point", "label": "C"},
                ],
                "constraints": [
                    {"id": "orient", "type": "orientation", "args": {"a": "A", "b": "B", "c": "C", "value": "cw"}},
                ],
                "constructionIntent": [],
            },
            {"problemText": "点A,B,C按顺时针方向排列。", "constraints": []},
            review_status="test",
        )
        self.assertEqual(construction["constraints"][0]["args"]["value"], "cw")

    def test_convex_shape_metadata_is_corrected_and_side_branch_is_flagged(self):
        construction = normalize_construction(
            {
                "objects": [
                    {
                        "id": "quad_ABCD",
                        "kind": "polygon",
                        "label": "凹四边形ABCD",
                        "refs": ["A", "B", "C", "D"],
                        "attributes": {"shape": "concave"},
                    },
                    {"id": "A", "kind": "point", "label": "A"},
                    {"id": "B", "kind": "point", "label": "B"},
                    {"id": "C", "kind": "point", "label": "C"},
                    {"id": "D", "kind": "point", "label": "D"},
                    {"id": "line_AB", "kind": "line", "refs": ["A", "B"]},
                ],
                "constraints": [
                    {"id": "shape", "type": "concave_quadrilateral", "args": {"object": "quad_ABCD"}},
                    {
                        "id": "side_shape",
                        "type": "same_side",
                        "args": {"first": "C", "second": "D", "line": "line_AB"},
                        "text": "用同侧关系表达凹四边形分支",
                    },
                ],
                "constructionIntent": [],
            },
            {"problemText": "在凸四边形ABCD中，连接AC。", "constraints": []},
            review_status="test",
        )

        quad = next(obj for obj in construction["objects"] if obj["id"] == "quad_ABCD")
        self.assertEqual(quad["label"], "凸四边形ABCD")
        self.assertEqual(quad["attributes"]["shape"], "convex")
        self.assertEqual(construction["constraints"][0]["type"], "convex_quadrilateral")
        self.assertTrue(
            any("convex_quadrilateral" in item and "硬编码侧向分支" in item for item in construction["diagnostics"]),
            construction["diagnostics"],
        )


if __name__ == "__main__":
    unittest.main()
