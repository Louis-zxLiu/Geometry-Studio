from __future__ import annotations

import math
import unittest

from geometry_agent_lib.construction import specs_match
from geometry_agent_lib.dsl_runtime import execute_geometry_dsl
from geometry_agent_lib.scene_compiler import compile_execution_to_scene


def point_by_id(execution, label):
    return {point["id"]: point for point in execution["objects"]["points"]}[label]


class DSLRuntimeTest(unittest.TestCase):
    def test_point_circle_rotate(self):
        execution = execute_geometry_dsl(
            """
            point : 0 0 -> O
            point : 1 0 -> A
            circle : O A -> circle_O
            rotate : A 60° O -> B
            segment : O B -> OB
            """
        )
        circle = execution["objects"]["circles"][0]
        rotated = point_by_id(execution, "B")
        self.assertEqual(circle["through"], "A")
        self.assertAlmostEqual(circle["radius"], 1.0)
        self.assertAlmostEqual(rotated["x"], 0.5, places=7)
        self.assertAlmostEqual(rotated["y"], math.sqrt(3) / 2, places=7)

    def test_parallel_perpendicular_midpoint_intersection(self):
        execution = execute_geometry_dsl(
            """
            point : 0 0 -> A
            point : 2 0 -> B
            point : 1 1 -> P
            segment : A B -> AB
            midpoint : A B -> M
            parallel_line : P AB -> l
            perpendicular_line : P AB -> p
            intersect : p AB -> H
            """
        )
        midpoint = point_by_id(execution, "M")
        foot = point_by_id(execution, "H")
        self.assertAlmostEqual(midpoint["x"], 1.0)
        self.assertAlmostEqual(midpoint["y"], 0.0)
        self.assertAlmostEqual(foot["x"], 1.0)
        self.assertAlmostEqual(foot["y"], 0.0)

    def test_bisectors_incenter_circumcenter_and_circles(self):
        execution = execute_geometry_dsl(
            """
            point : 0 0 -> A
            point : 4 0 -> B
            point : 0 3 -> C
            line_bisector : A B -> bis_AB
            angle_bisector : A B C -> bis_ABC
            incenter : A B C -> I
            incircle : A B C -> inc
            circumcenter : A B C -> O
            circumcircle : A B C -> circ
            """
        )
        incenter = point_by_id(execution, "I")
        circumcenter = point_by_id(execution, "O")
        circles = {circle["id"]: circle for circle in execution["objects"]["circles"]}
        self.assertAlmostEqual(incenter["x"], 1.0)
        self.assertAlmostEqual(incenter["y"], 1.0)
        self.assertAlmostEqual(circumcenter["x"], 2.0)
        self.assertAlmostEqual(circumcenter["y"], 1.5)
        self.assertGreater(circles["inc"]["radius"], 0)
        self.assertEqual(circles["circ"]["through"], "A")

    def test_scene_compiler_keeps_generated_center_unlabeled(self):
        execution = execute_geometry_dsl(
            """
            point : 0 0 -> A
            point : 4 0 -> B
            point : 0 3 -> C
            circumcircle : A B C -> circ
            """
        )
        scene = compile_execution_to_scene(execution)
        labels = {point["label"] for point in scene["points"] if point["label"]}
        generated_centers = [point for point in scene["points"] if point["id"].startswith("__center_")]
        self.assertEqual(labels, {"A", "B", "C"})
        self.assertEqual(generated_centers[0]["label"], "")
        self.assertEqual(scene["circles"][0]["through"], "A")

    def test_spec_fingerprint_detects_review_changes(self):
        spec = {"problemText": "题目", "goalText": "求证", "entities": [], "constraints": [], "constructionHints": [], "confidence": 1}
        unchanged = dict(spec)
        changed = {**spec, "goalText": "求证新结论"}
        self.assertTrue(specs_match(spec, unchanged))
        self.assertFalse(specs_match(spec, changed))


if __name__ == "__main__":
    unittest.main()
