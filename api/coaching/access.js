/* Who may see what in coaching. Every coaching route asks here and nowhere else.
 *
 * trainer-fork: the rule is always "this trainer's own clients", never "the admin". Being a
 * server admin grants nothing in coaching, and being a trainer grants nothing in openGym's admin
 * tools (SPEC.md, Permissions; PLAN.md, "Ready for more trainers").
 *
 * A trainer keeps access while the link is active or paused. An ended or blocked link reads
 * nothing; its rows stay as the liability record and are reached by the record export only.
 * Not your client and no such user answer alike (404), so a trainer cannot probe for accounts.
 */

export const LIVE = ['active', 'paused'];

export function makeAccess({ sql, users, json, readSession }) {
  const userById = id => users().find(u => u.id === id) || null;
  // A trainer is the flag on the user plus a trainers row; either alone is a half-made grant.
  const isTrainer = u => !!u && u.trainer === true && !u.disabled
    && !!sql.prepare('SELECT 1 FROM trainers WHERE user_id = ?').get(u.id);

  const liveLinkOf = clientId => sql.prepare(
    `SELECT * FROM links WHERE client_id = ? AND status IN ('active', 'paused')`
  ).get(clientId) || null;

  const ownLink = (trainerId, clientId) => {
    const l = liveLinkOf(clientId);
    return l && l.trainer_id === trainerId ? l : null;
  };

  function requireUser(req, res) {
    const user = readSession(req);
    if (!user) { json(res, 401, { error: 'not signed in' }); return null; }
    return user;
  }

  function requireTrainer(req, res) {
    const user = requireUser(req, res); if (!user) return null;
    if (!isTrainer(user)) { json(res, 403, { error: 'trainers only' }); return null; }
    return user;
  }

  /** The signed-in trainer, the client and their live link, or a 401/403/404 already sent. */
  function requireOwnClient(req, res, clientId) {
    const trainer = requireTrainer(req, res); if (!trainer) return null;
    const client = typeof clientId === 'string' ? userById(clientId) : null;
    const link = client && ownLink(trainer.id, client.id);
    if (!link) { json(res, 404, { error: 'no such client' }); return null; }
    return { trainer, client, link };
  }

  /** The client themself, or their trainer. For data both sides may read. */
  function requireSelfOrTrainer(req, res, clientId) {
    const user = requireUser(req, res); if (!user) return null;
    if (user.id === clientId) return { user, client: user, link: liveLinkOf(user.id), asTrainer: false };
    if (!isTrainer(user)) { json(res, 404, { error: 'no such client' }); return null; }
    const client = typeof clientId === 'string' ? userById(clientId) : null;
    const link = client && ownLink(user.id, client.id);
    if (!link) { json(res, 404, { error: 'no such client' }); return null; }
    return { user, client, link, asTrainer: true };
  }

  return { userById, isTrainer, liveLinkOf, ownLink, requireUser, requireTrainer, requireOwnClient, requireSelfOrTrainer };
}
