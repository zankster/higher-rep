// trainer-fork: plain labels for the coaching events in the Admin activity log (written by
// api/coaching/routes.js). Merged into lib/audit.js's LABELS with one marked line.
export const COACHING_AUDIT_LABELS = {
  'admin.trainer.grant': 'Made someone a trainer',
  'admin.trainer.revoke': 'Removed someone as trainer',
  'coaching.invite.create': 'Invited a client',
  'coaching.invite.revoke': 'Revoked a client invite',
  'coaching.invite.renew': 'Sent a new client invite',
  'coaching.invite.accept': 'Joined a trainer',
  'coaching.client.pause': 'Paused coaching',
  'coaching.client.resume': 'Resumed coaching',
  'coaching.client.remove': 'Removed a client',
  'coaching.end': 'Ended coaching with their trainer',
}
