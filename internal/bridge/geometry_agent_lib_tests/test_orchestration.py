from __future__ import annotations

import unittest

import geometry_agent


class OrchestrationTest(unittest.TestCase):
    def test_detects_cluttered_matplotlib_fact_box(self):
        cluttered = "measure_text = '已渲染的审核事实:\\n1. AB 为直径\\n2. 证明目标'\nax.text(0, 0, measure_text)"
        simple = "ax.text(x, y, 'A')\nax.plot([0, 1], [0, 1])"

        self.assertTrue(geometry_agent.code_has_visual_clutter(cluttered))
        self.assertFalse(geometry_agent.code_has_visual_clutter(simple))

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
