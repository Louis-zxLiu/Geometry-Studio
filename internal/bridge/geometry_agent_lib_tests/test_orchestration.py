from __future__ import annotations

import unittest

import geometry_agent
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
        self.assertIn("degenerate", prompt)

    def test_dynamic_self_correct_policy_preserves_parameterized_code(self):
        policy = geometry_agent.dynamic_self_correct_policy(
            {"code": "from matplotlib.widgets import Slider\nSlider(ax, '角度', 20, 80)"}
        )

        self.assertIn("Slider", policy)
        self.assertIn("compute_geometry(params)", policy)
        self.assertIn("do not collapse parameterized code into a static plot", policy)

    def test_parse_react_response_extracts_action_and_dsl(self):
        parsed = geometry_agent.parse_react_response(
            """
**Thought:** Build a triangle and its circumcircle.
**Action:** modify_dsl

```dsl
point : 0 0 -> A
point : 1 0 -> B
segment : A B -> AB
```
"""
        )

        self.assertEqual(parsed["action"], "modify_dsl")
        self.assertIn("point : 0 0 -> A", parsed["dsl"])
        self.assertIn("circumcircle", parsed["thought"])

    def test_validation_summary_uses_geobuildbench_threshold(self):
        failed = geometry_agent.validation_summary_from_result(
            {
                "success": False,
                "object_score": 0.95,
                "condition_score": 0.89,
                "total_score": 0.908,
                "missing_objects": {"points": ["M"]},
                "failed_conditions": [{"type": "collinear", "message": "M is off the line"}],
            },
            iterations=2,
        )
        passed = geometry_agent.validation_summary_from_result(
            {
                "success": False,
                "object_score": 0.9,
                "condition_score": 0.9,
                "total_score": 0.9,
                "missing_objects": {},
                "failed_conditions": [],
            },
            iterations=3,
        )

        self.assertFalse(failed["isValid"])
        self.assertTrue(passed["isValid"])
        self.assertEqual(failed["objectScore"], 0.95)
        self.assertEqual(failed["conditionScore"], 0.89)
        self.assertEqual(failed["iterations"], 2)
        self.assertTrue(failed["failedItems"])

    def test_react_loop_stops_at_pass_threshold(self):
        responses = iter(
            [
                """
**Thought:** First candidate.
**Action:** generate_dsl
```dsl
point : 0 0 -> A
```
""",
                """
**Thought:** Second candidate.
**Action:** modify_dsl
```dsl
point : 0 0 -> A
point : 1 0 -> B
segment : A B -> AB
```
""",
            ]
        )
        scores = iter([(0.8, 0.8), (0.95, 0.9)])

        original_text_chat = geometry_agent.text_chat
        original_execute = geometry_agent.execute_and_validate_dsl
        geometry_agent.text_chat = lambda *_args, **_kwargs: next(responses)

        def fake_execute(_state, dsl_code):
            object_score, condition_score = next(scores)
            return {
                "execution": {"objects": {"points": [], "segments": [], "lines": [], "rays": [], "circles": []}},
                "scene": {"version": 1, "title": "preview", "points": [], "segments": [], "circles": [], "arcs": [], "polygons": []},
                "validation": {
                    "success": object_score >= 0.9 and condition_score >= 0.9,
                    "object_score": object_score,
                    "condition_score": condition_score,
                    "total_score": 0.3 * object_score + 0.7 * condition_score,
                    "missing_objects": {},
                    "failed_conditions": [],
                },
                "executionError": "",
            }

        geometry_agent.execute_and_validate_dsl = fake_execute
        try:
            result = geometry_agent.react_dsl_loop(
                {
                    "sessionId": "test-session",
                    "sceneName": "test-scene",
                    "problemText": "Construct AB.",
                    "settings": {},
                    "maxAttempts": 5,
                    "runMode": "benchmark",
                    "diagnostics": [],
                }
            )
        finally:
            geometry_agent.text_chat = original_text_chat
            geometry_agent.execute_and_validate_dsl = original_execute

        self.assertEqual(len(result["reactAttempts"]), 2)
        self.assertTrue(result["validationSummary"]["isValid"])
        self.assertEqual(result["constructionDraft"]["iterations"], 2)

    def test_react_loop_feeds_rendered_image_to_next_attempt(self):
        responses = iter(
            [
                """
**Thought:** First candidate.
**Action:** generate_dsl
```dsl
point : 0 0 -> A
```
""",
                """
**Thought:** Use the rendered image feedback.
**Action:** modify_dsl
```dsl
point : 0 0 -> A
point : 1 0 -> B
segment : A B -> AB
```
""",
            ]
        )
        image_inputs = []
        calls = []

        original_text_chat = geometry_agent.text_chat
        original_execute = geometry_agent.execute_and_validate_dsl

        def fake_text_chat(_state, _system_prompt, _user_prompt, image_data_url=""):
            image_inputs.append(list(image_data_url or []))
            return next(responses)

        def fake_execute(state, _dsl_code):
            calls.append(int(state.get("reactAttempt") or 0))
            passed = len(calls) == 2
            return {
                "execution": {"objects": {"points": [], "segments": [], "lines": [], "rays": [], "circles": []}},
                "scene": {},
                "validation": {
                    "success": passed,
                    "object_score": 1.0 if passed else 0.5,
                    "condition_score": 1.0 if passed else 0.5,
                    "total_score": 1.0 if passed else 0.5,
                    "missing_objects": {},
                    "failed_conditions": [],
                },
                "executionError": "",
                "localExecutionError": "",
                "rendering": {
                    "success": True,
                    "hasImage": True,
                    "imageDataUrl": f"data:image/png;base64,attempt{len(calls)}",
                    "imagePath": f"/tmp/attempt{len(calls)}.png",
                    "error": "",
                },
            }

        geometry_agent.text_chat = fake_text_chat
        geometry_agent.execute_and_validate_dsl = fake_execute
        try:
            result = geometry_agent.react_dsl_loop(
                {
                    "sessionId": "test-session",
                    "sceneName": "test-scene",
                    "problemText": "Construct AB.",
                    "imageDataUrl": "data:image/png;base64,source",
                    "settings": {},
                    "maxAttempts": 5,
                    "runMode": "benchmark",
                    "diagnostics": [],
                }
            )
        finally:
            geometry_agent.text_chat = original_text_chat
            geometry_agent.execute_and_validate_dsl = original_execute

        self.assertEqual(calls, [1, 2])
        self.assertEqual(image_inputs[0], ["data:image/png;base64,source"])
        self.assertEqual(image_inputs[1], ["data:image/png;base64,source", "data:image/png;base64,attempt1"])
        self.assertTrue(result["constructionDraft"]["renderSuccess"])

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

    def test_reuses_accepted_dsl_without_rerunning_loop(self):
        spec = {
            "problemText": "test",
            "goalText": "show",
            "entities": [],
            "constraints": [],
            "constructionHints": [],
            "confidence": 1.0,
        }
        construction = {
            "dslCode": "point : 0 0 -> A",
            "objects": [{"id": "A", "kind": "point", "label": "A", "attributes": {"x": 0, "y": 0, "fixed": True}}],
            "constraints": [],
            "constructionIntent": [],
            "solution": {"status": "executed"},
            "validation": {"isValid": True, "summary": "ok", "objectScore": 1.0, "conditionScore": 1.0},
        }
        state = {
            "sessionId": "test-session",
            "sceneName": "test-scene",
            "spec": spec,
            "reviewedSpec": spec,
            "constructionDraft": construction,
            "validationSummary": {"isValid": True, "summary": "ok", "objectScore": 1.0, "conditionScore": 1.0},
            "diagnostics": [],
            "maxAttempts": 2,
        }

        original = geometry_agent.react_dsl_loop
        geometry_agent.react_dsl_loop = self._fail_if_called
        try:
            result = geometry_agent.post_review_react_loop(state)
        finally:
            geometry_agent.react_dsl_loop = original

        self.assertEqual(result["construction"]["reviewStatus"], "teacher_reviewed")
        self.assertEqual(result["construction"]["dslCode"], "point : 0 0 -> A")
        self.assertEqual(set(result), {"construction", "validationSummary", "scene"})

    def test_teacher_edit_reruns_react_loop(self):
        old_spec = {
            "problemText": "old",
            "goalText": "show",
            "entities": [],
            "constraints": [],
            "constructionHints": [],
            "confidence": 1.0,
        }
        new_spec = {**old_spec, "problemText": "new"}
        state = {
            "sessionId": "test-session",
            "sceneName": "test-scene",
            "spec": old_spec,
            "reviewedSpec": new_spec,
            "constructionDraft": {"dslCode": "point : 0 0 -> A"},
            "diagnostics": [],
            "maxAttempts": 2,
        }
        calls = []
        original = geometry_agent.react_dsl_loop

        def fake_loop(loop_state, *, stage="react_dsl_loop"):
            calls.append((loop_state["spec"]["problemText"], stage))
            return {
                "constructionDraft": {"dslCode": "point : 1 0 -> B"},
                "validationSummary": {"isValid": True, "summary": "ok"},
                "scene": {},
                "dslExecution": {},
                "reactAttempts": [{"attempt": 1}],
            }

        geometry_agent.react_dsl_loop = fake_loop
        try:
            result = geometry_agent.post_review_react_loop(state)
        finally:
            geometry_agent.react_dsl_loop = original

        self.assertEqual(calls, [("new", "post_review_react_loop")])
        self.assertEqual(result["construction"]["reviewStatus"], "teacher_reviewed_rerun")
        self.assertEqual(result["construction"]["dslCode"], "point : 1 0 -> B")

    @staticmethod
    def _fail_if_called(*_args, **_kwargs):
        raise AssertionError("valid unchanged draft should not be solved again")


if __name__ == "__main__":
    unittest.main()
