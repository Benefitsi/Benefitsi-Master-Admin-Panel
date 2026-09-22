"""One disposable Hermes process per import; stdin/stdout are JSON only."""
import contextlib
import json
import logging
import os
from pathlib import Path
import shutil
import sys
import tempfile


def parse_result(result):
    if (not isinstance(result, dict) or result.get("completed") is not True
            or any(result.get(key) for key in ("partial", "failed", "interrupted", "error"))):
        raise ValueError("Hermes did not complete the extraction")
    final = result.get("final_response")
    if not isinstance(final, str) or not final.strip() or len(final.encode()) > 2 * 1024 * 1024:
        raise ValueError("No complete response")
    return json.loads(final)


def run(document):
    profile = Path(__file__).resolve().parent.parent
    hermes = Path.home() / ".hermes/hermes-agent"
    sys.path.insert(0, str(hermes))
    from dotenv import dotenv_values

    # Reuse only the existing model credential; do not import other agents'
    # tools, histories, MCP settings or unrelated application credentials.
    credentials = dotenv_values(Path.home() / ".hermes/.env")
    key = os.environ.get("MINIMAX_API_KEY") or credentials.get("MINIMAX_API_KEY")
    if not key:
        raise RuntimeError("MiniMax credential unavailable")
    os.environ["MINIMAX_API_KEY"] = key
    owned_scratch = os.environ.get("HERMES_MENU_SCRATCH")
    scratch_context = contextlib.nullcontext(owned_scratch) if owned_scratch else tempfile.TemporaryDirectory(prefix="benefitsi-menu-hermes-")
    with scratch_context as scratch:
        os.environ["HERMES_HOME"] = scratch
        os.environ["HERMES_CWD"] = scratch
        os.environ["HERMES_INTERACTIVE"] = "0"
        shutil.copyfile(profile / "config.yaml", Path(scratch) / "config.yaml")
        shutil.copyfile(profile / "SOUL.md", Path(scratch) / "SOUL.md")
        os.chdir(scratch)
        logging.disable(logging.CRITICAL)
        from hermes_cli.config import load_config
        from hermes_cli.runtime_provider import resolve_runtime_provider
        from run_agent import AIAgent

        model = load_config()["model"]
        runtime = resolve_runtime_provider(requested=model["provider"], target_model=model["default"],
                                           explicit_api_key=key, explicit_base_url=model["base_url"])
        agent = AIAgent(model=model["default"], provider=runtime["provider"],
                        base_url=runtime["base_url"], api_key=runtime["api_key"], api_mode=runtime["api_mode"],
                        enabled_toolsets=[], max_iterations=2, max_tokens=24000,
                        quiet_mode=True, save_trajectories=False, session_db=None,
                        skip_context_files=True, load_soul_identity=True,
                        skip_memory=True, skip_background_review=True,
                        run_budget_seconds=90)
        if agent.tools:
            raise RuntimeError("Menu agent must have zero tools")
        result = agent.run_conversation(
            user_message="OCR_MENU_DATA\n" + json.dumps(document, ensure_ascii=False),
            system_message="Strukturiere die OCR_MENU_DATA gemäß deinem Menü-Schema. Bewahre alle Artikel; unklare Felder bleiben leer. Antworte ausschließlich als JSON.",
        )
        return parse_result(result)


if __name__ == "__main__":
    try:
        raw = sys.stdin.buffer.read(2 * 1024 * 1024 + 1)
        if len(raw) > 2 * 1024 * 1024:
            raise ValueError("Input too large")
        # The bridge captures stderr and never returns it to callers. Suppress
        # library chatter here as it could contain source text or provider data.
        with open(os.devnull, "w") as quiet, contextlib.redirect_stdout(quiet), contextlib.redirect_stderr(quiet):
            draft = run(json.loads(raw))
        sys.stdout.write(json.dumps(draft, ensure_ascii=False, allow_nan=False))
    except Exception:
        sys.stderr.write("Menu extraction failed.\n")
        sys.exit(1)
