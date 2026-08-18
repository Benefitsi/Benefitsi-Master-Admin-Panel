# City Editor Validation Matrix

The City Editor separates field/change validation from content-quality warnings.
The server calculates `changedFields` from the persisted snapshot and the
parsed form payload before applying cross-field rules.

| Rule | Condition | Unrelated existing edit | New/dependent edit |
| --- | --- | --- | --- |
| Place admission | `admission_type = paid` without `admission_label` or valid structured `pricing` | Warning; save allowed | Blocking error |
| Event price | `price_type = paid` without `price_label` or valid structured `pricing` | Warning; save allowed | Blocking error |
| Ticket / registration | `ticketing.mode = TICKETS/REGISTRATION` without a URL | Warning; save allowed | Blocking error |
| Date order | Invalid start/end/expiry relationship | Warning; save allowed | Blocking error |
| Recurrence | Incomplete or inconsistent series | Warning; save allowed | Blocking error |
| Contact email | Invalid existing email | Warning; save allowed | Blocking error when edited |

Structured pricing remains the public source of truth. The short label fields
are optional summaries and are never auto-filled from tariff data during an
unrelated save. Missing pricing is never converted to `free` or `0 €`.
