# Benefitsi Content-Agent

The `benefitsi-content` Hermes profile is a dedicated M1 worker for editorial
drafts in the Admin Panel. It is intentionally separate from Ben:

| Profile | Responsibility | Write/publish access |
| --- | --- | --- |
| `benefitsi-content` | Partner, deal, menu and public team copy drafts | None; every result stays in local form state |
| `ben` | Benefitsi orchestration, review and approved workflows | Existing Ben policy and human gates |

The Admin Panel sends bounded public facts to `POST /hermes`:

```json
{
  "action": "content-draft",
  "profile": "benefitsi-content",
  "task": "partner_description",
  "payload": { "name": "...", "city": "..." },
  "message": "..."
}
```

The M1 bridge accepts only the six allowlisted editorial tasks, limits the
payload, requires the dedicated profile, and runs Hermes with the
`context_engine` toolset. The profile has no MCP server, bundled skills,
scheduler, database credential or publication capability. The bridge also
requires the instruction/data markers when the Admin Panel supplies a prompt.

## M1 installation

Create the profile once on the M1, then sync the non-secret distribution files:

```bash
hermes profile create benefitsi-content --no-alias --no-skills \
  --description "Benefitsi Content-Agent für öffentliche Textentwürfe im Admin-Panel."
```

Copy `config.yaml`, `SOUL.md`, `identity.md` and `profile.yaml` into
`~/.hermes/profiles/benefitsi-content/`. Configure the provider credential only
in the owner-readable profile `.env` on the M1 (`chmod 600`); never copy that
file into GitHub or the Admin Panel. Do not register a worker LaunchAgent for
this profile. It is invoked on demand through the existing authenticated M1
bridge.

After syncing, verify the profile through the authenticated read-only
`GET /hermes?action=status` endpoint and confirm that `benefitsi-content` is
listed with MiniMax M3.0. A content request must only return a draft; saving it
remains an explicit Admin Panel action.
