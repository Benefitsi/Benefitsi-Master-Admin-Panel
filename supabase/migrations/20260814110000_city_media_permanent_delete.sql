-- Keep permanent media deletion distinct from archival in the audit trail.
-- The asset foreign key on city_media_audit uses ON DELETE SET NULL so the
-- deletion event remains available after the asset row is removed.

alter table public.city_media_audit
  drop constraint if exists city_media_audit_action;

alter table public.city_media_audit
  add constraint city_media_audit_action check (
    action in (
      'UPLOAD', 'UPDATE_METADATA', 'ASSIGN', 'UNASSIGN', 'REORDER',
      'LOCK', 'UNLOCK', 'REPLACE', 'ROLE_CHANGE', 'FOCAL_POINT',
      'ARCHIVE', 'DELETE', 'DELETE_BLOCKED'
    )
  );
