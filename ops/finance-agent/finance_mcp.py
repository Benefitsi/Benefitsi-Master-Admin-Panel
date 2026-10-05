"""Only sanitized preparation tools for the dedicated Hermes profile."""
from typing import Literal
from uuid import uuid4
from mcp.server.fastmcp import FastMCP
from finance_cli import workspace

mcp = FastMCP('benefitsi-finance')


@mcp.tool()
def finance_status() -> dict:
    """Read sanitized service status and open setup tasks, never private documents."""
    try:
        result = workspace().status()
        # Individual dates/subjects/reviewer names stay out of model context.
        if result['lastRun']:
            result['lastRun']['deadlines'] = []
        return result
    except Exception:
        return {'status': 'blocked', 'reason': 'FINANCE_SOURCE_UNAVAILABLE'}


@mcp.tool()
def finance_prepare(task: Literal['setup', 'review']) -> dict:
    """On explicit user request prepare at most 20 owner-provided documents locally.

    No originals, amounts, vendors or bank data are returned to the model.
    Final accounting, classifications and submissions are unavailable.
    """
    try:
        result = workspace().run(task, str(uuid4()))
        result['deadlines'] = []
        return result
    except Exception:
        return {'status': 'blocked', 'reason': 'FINANCE_PREPARATION_UNAVAILABLE'}


if __name__ == '__main__':
    mcp.run(transport='stdio')
