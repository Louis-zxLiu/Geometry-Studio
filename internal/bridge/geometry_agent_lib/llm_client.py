from __future__ import annotations

import json
import re
from typing import Any, Dict, List

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, ValidationError

from .text_utils import preview_text


def normalize_openai_base_url(value: str) -> str:
    base_url = (value or "").strip().rstrip("/")
    suffix = "/chat/completions"
    if base_url.endswith(suffix):
        base_url = base_url[: -len(suffix)]
    return base_url


def model_from_settings(settings: Dict[str, str]) -> ChatOpenAI:
    base_url = normalize_openai_base_url(settings.get("baseUrl", ""))
    api_key = (settings.get("apiKey") or "").strip()
    model = (settings.get("model") or "").strip()
    if not base_url or not api_key or not model:
        raise RuntimeError("Geometry workflow needs baseUrl, apiKey, and model")
    return ChatOpenAI(
        base_url=base_url,
        api_key=api_key,
        model=model,
        temperature=0.2,
        timeout=300,
    )


def response_text(value: Any) -> str:
    content = getattr(value, "content", value)
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: List[str] = []
        for item in content:
            if isinstance(item, dict):
                text = item.get("text") or item.get("content")
                if text:
                    parts.append(str(text))
            else:
                parts.append(str(item))
        return "\n".join(parts).strip()
    return str(content).strip()


def extract_json_object(text: str) -> Dict[str, Any]:
    stripped = text.strip()
    fenced = re.fullmatch(r"```(?:json)?\s*(.*?)```", stripped, flags=re.S | re.I)
    if fenced:
        stripped = fenced.group(1).strip()
    try:
        return json.loads(stripped)
    except json.JSONDecodeError as exc:
        if "Invalid \\escape" not in str(exc):
            raise
        return json.loads(escape_invalid_json_string_backslashes(stripped))


def escape_invalid_json_string_backslashes(text: str) -> str:
    result: List[str] = []
    in_string = False
    index = 0
    valid_escapes = {'"', "\\", "/", "b", "f", "n", "r", "t"}

    while index < len(text):
        char = text[index]

        if not in_string:
            result.append(char)
            if char == '"':
                in_string = True
            index += 1
            continue

        if char == '"':
            result.append(char)
            in_string = False
            index += 1
            continue

        if char != "\\":
            result.append(char)
            index += 1
            continue

        if index + 1 >= len(text):
            result.append("\\\\")
            index += 1
            continue

        next_char = text[index + 1]
        if next_char in valid_escapes:
            result.append(char)
            result.append(next_char)
            index += 2
            continue

        if next_char == "u" and is_valid_json_unicode_escape(text[index + 2 : index + 6]):
            result.append(char)
            result.append(next_char)
            index += 2
            continue

        result.append("\\\\")
        index += 1

    return "".join(result)


def is_valid_json_unicode_escape(value: str) -> bool:
    return len(value) == 4 and all(char in "0123456789abcdefABCDEF" for char in value)


def compact_json_schema(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: compact_json_schema(item)
            for key, item in value.items()
            if key not in {"default", "description", "examples", "title"}
        }
    if isinstance(value, list):
        return [compact_json_schema(item) for item in value]
    return value


def json_chat(
    state: Dict[str, Any],
    schema_model: type[BaseModel],
    system_prompt: str,
    user_prompt: str,
    image_data_url: str = "",
    *,
    compact_schema: bool = False,
) -> BaseModel:
    schema_payload = schema_model.model_json_schema()
    if compact_schema:
        schema_payload = compact_json_schema(schema_payload)
    schema = json.dumps(
        schema_payload,
        ensure_ascii=False,
        indent=None if compact_schema else 2,
        separators=(",", ":") if compact_schema else None,
    )
    base_user_prompt = (
        user_prompt
        + "\n\nReturn JSON only. Escape every backslash inside JSON strings as \\\\, "
        + "especially LaTeX commands such as \\\\angle, \\\\perp, \\\\circ, and \\\\frac. "
        + "It must validate against this JSON Schema:\n"
        + schema
    )
    llm = model_from_settings(state["settings"])
    last_error = ""
    last_text = ""
    for attempt_index in range(3):
        full_user_prompt = base_user_prompt
        if last_error:
            full_user_prompt += (
                "\n\nYour previous response did not validate. Fix only the JSON structure and keep the intended content.\n"
                f"Validation error:\n{last_error}\n\nPrevious response excerpt:\n{preview_text(last_text, 900)}"
            )
        human_content: Any = full_user_prompt
        if image_data_url:
            human_content = [
                {"type": "text", "text": full_user_prompt},
                {"type": "image_url", "image_url": {"url": image_data_url}},
            ]
        raw = llm.invoke(
            [
                SystemMessage(content=system_prompt),
                HumanMessage(content=human_content),
            ]
        )
        last_text = response_text(raw)
        try:
            payload = extract_json_object(last_text)
            return schema_model.model_validate(payload)
        except (json.JSONDecodeError, ValidationError, ValueError) as exc:
            last_error = str(exc)
            if attempt_index >= 2:
                raise
    raise RuntimeError("JSON generation failed unexpectedly")
