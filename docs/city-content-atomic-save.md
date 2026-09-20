# City editor atomic save — BEN-41

Editing published City content now sends one `save_city_content_draft_atomic`
request after the existing Admin authorization and validation. The editor sends
the original `updated_at` revision without rounding; a concurrent edit shows a
conflict and cannot overwrite the newer row. The database transaction owns the
saved published snapshot, content, recurrence, review reset, audit and queue.
The editor cannot approve or publish through this save action.

**Required database release:** apply only
`20260920003022_save_city_content_draft_atomic.sql` from the paired Database
candidate before deploying this caller. Qualify the actual public reader and
the synthetic published -> draft -> review -> republish/withdraw flow in the
same environment. If the RPC is missing, save fails without falling back to the
old direct writes. Do not combine this rollout with an unrelated migration or
notification-secret cutover.

A confirmed database error rolls the transaction back. A network failure after
commit can leave the HTTP outcome unknown, so the editor asks the user to reload
and inspect the current state before retrying. Returning to the old writer is
not a safe rollback while City editing is enabled.

Local behavior tests run the actual action with inert transport and verify one
RPC, no direct writes, preserved revision/actor, recurrence, visible conflicts,
authorization failure and rejection of publish intent. The paired native SQL
suite verifies transaction rollback, row-lock concurrency and the public
snapshot/withdrawal contract. Hosted qualification and deployment remain release
gates; this document does not claim they occurred.
