from __future__ import annotations

import unittest

import geometry_agent
from geometry_agent_lib.prompts import build_constraint_construction_prompt
from geometry_agent_lib.text_utils import sanitize_mathjax_markdown


class OrchestrationTest(unittest.TestCase):
    def test_detects_cluttered_matplotlib_fact_box(self):
        cluttered = "measure_text = '已渲染的审核事实:\\n1. AB 为直径\\n2. 证明目标'\nax.text(0, 0, measure_text)"
        simple = "ax.text(x, y, 'A')\nax.plot([0, 1], [0, 1])"

        self.assertTrue(geometry_agent.code_has_visual_clutter(cluttered))
        self.assertFalse(geometry_agent.code_has_visual_clutter(simple))

    def test_detects_dynamic_geometry_controls(self):
        dynamic = "from matplotlib.widgets import Slider\nangle_slider = Slider(ax, '角度', 20, 80, valinit=50)"
        spaced = "from matplotlib.widgets import Slider\nangle_slider = Slider (ax, '角度', 20, 80)"
        qualified = "angle_slider = matplotlib.widgets.Slider(ax, '角度', 20, 80)"
        static = "ax.plot([0, 1], [0, 1])"

        self.assertTrue(geometry_agent.code_has_dynamic_controls(dynamic))
        self.assertTrue(geometry_agent.code_has_dynamic_controls(spaced))
        self.assertTrue(geometry_agent.code_has_dynamic_controls(qualified))
        self.assertFalse(geometry_agent.code_has_dynamic_controls(static))

    def test_dynamic_matplotlib_prompt_requires_slider_and_stable_structure(self):
        prompt = geometry_agent.build_matplotlib_code_prompt(
            {
                "dynamicConstruction": True,
                "scene": {
                    "title": "test",
                    "points": [],
                    "segments": [],
                    "circles": [],
                    "arcs": [],
                    "polygons": [],
                },
            },
            {
                "problemText": "test",
                "goalText": "show",
                "entities": [],
                "constraints": [],
                "constructionHints": [],
                "confidence": 1.0,
            },
            {"objects": [], "constraints": [], "solution": {}},
        )

        self.assertIn("Slider", prompt)
        self.assertIn("compute_geometry(params)", prompt)
        self.assertIn("warm-start", prompt)
        self.assertIn("退化", prompt)

    def test_dynamic_self_correct_policy_preserves_parameterized_code(self):
        policy = geometry_agent.dynamic_self_correct_policy(
            {"code": "from matplotlib.widgets import Slider\nSlider(ax, '角度', 20, 80)"}
        )

        self.assertIn("Slider", policy)
        self.assertIn("compute_geometry(params)", policy)
        self.assertIn("不要把动态代码退化成静态固定坐标图", policy)

    def test_constraint_prompt_warns_against_hardcoded_convex_orientation(self):
        prompt = build_constraint_construction_prompt(
            {
                "problemText": "在凸四边形ABCD中，AC平分角BAD。",
                "goalText": "证明共圆。",
                "entities": [],
                "constraints": [],
            },
            mode="draft",
        )

        self.assertIn("convex_polygon", prompt)
        self.assertIn("凸四边形", prompt)
        self.assertIn("orientation: ccw/cw", prompt)

    def test_constraint_prompt_warns_against_required_distinct_points(self):
        prompt = build_constraint_construction_prompt(
            {
                "problemText": "点 P 在弧 TB 上且不含端点。",
                "goalText": "证明 K 为定点。",
                "entities": [],
                "constraints": [],
            },
            mode="draft",
        )

        self.assertIn("distinct_points", prompt)
        self.assertIn("not_equal", prompt)
        self.assertIn("required constraints", prompt)

    def test_constraint_prompt_requires_structured_fixed_point_goal(self):
        prompt = build_constraint_construction_prompt(
            {
                "problemText": "当点 P 在弧 TB 上运动时，证明 K 为定点。",
                "goalText": "K 为定点。",
                "entities": [],
                "constraints": [],
            },
            mode="draft",
        )

        self.assertIn("invariant_point", prompt)
        self.assertIn("fixed_point", prompt)
        self.assertIn("required:false", prompt)
        self.assertIn("nondegenerate", prompt)

    def test_sanitizes_indented_display_math_delimiters(self):
        markdown = sanitize_mathjax_markdown(
            "由平行关系得到\n\n"
            "   $$\n"
            "\\triangle CEF\\sim \\triangle CBD.\n"
            "   $$\n\n"
            "\\frac{CE}{CB}=\\frac{CF}{CD}.\n\n"
            "所以 $B,P,Q,D$ 共圆。"
        )

        self.assertIn("$$\n\\triangle CEF\\sim \\triangle CBD.\n$$", markdown)
        self.assertIn("\\frac{CE}{CB}=\\frac{CF}{CD}.", markdown)
        self.assertNotIn("$$\n\\frac{CE}{CB}=\\frac{CF}{CD}.\n$$", markdown)
        self.assertIn("所以 $B,P,Q,D$ 共圆。", markdown)

    def test_reuses_valid_reviewed_draft_without_resolving(self):
        spec = {
            "problemText": "test",
            "goalText": "show",
            "entities": [],
            "constraints": [],
            "constructionHints": [],
            "confidence": 1.0,
        }
        construction = {
            "objects": [{"id": "A", "kind": "point", "label": "A", "attributes": {"x": 0, "y": 0, "fixed": True}}],
            "constraints": [],
            "constructionIntent": [],
            "solution": {"status": "solved"},
            "validation": {"isValid": True, "solverOk": True, "summary": "ok"},
        }
        state = {
            "sessionId": "test-session",
            "sceneName": "test-scene",
            "spec": spec,
            "reviewedSpec": spec,
            "constructionDraft": construction,
            "diagnostics": [],
            "maxAttempts": 2,
        }

        original = geometry_agent.solve_validate_construction
        geometry_agent.solve_validate_construction = self._fail_if_called
        try:
            result = geometry_agent.final_repair_constraints(state)
        finally:
            geometry_agent.solve_validate_construction = original

        self.assertEqual(result["construction"]["reviewStatus"], "validated")
        self.assertEqual(set(result), {"construction", "validationSummary", "diagnostics"})

    @staticmethod
    def _fail_if_called(*_args, **_kwargs):
        raise AssertionError("valid unchanged draft should not be solved again")


if __name__ == "__main__":
    unittest.main()
