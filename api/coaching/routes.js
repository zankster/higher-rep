/* HTTP surface for coaching (trainer-fork). Every route is listed in openapi.yaml, and every
 * route has a permission test in test/coaching-access.test.js.
 *
 * A factory taking server.js's own helpers, like coach/routes.js: they are closures over db.json
 * and the session secret. Ids travel in the query string (?id=), so openGym's dispatcher stays a
 * plain lookup.
 */
import { makeAccess } from './access.js';

export function coachingRoutes({ sql, users, saveDb, json, readBody, readSession, requireOwner, audit }) {
  const access = makeAccess({ sql, users, json, readSession });
  const { userById, isTrainer, liveLinkOf, requireUser, requireTrainer, requireOwnClient } = access;
  const idParam = req => new URL(req.url, 'http://x').searchParams.get('id');

  const clientRow = (link, u) => ({
    id: link.client_id, name: u ? u.name : null, status: link.status, since: link.started_at
  });

  return {
    // Appoint or remove a trainer. Owner only, like appointing an admin. Removing is refused while
    // the trainer still has clients: their clients would be left linked to nobody.
    'POST /api/admin/user/trainer': async (req, res) => {
      const owner = requireOwner(req, res); if (!owner) return;
      const body = await readBody(req);
      const u = userById(body.id);
      if (!u) return json(res, 404, { error: 'no such user' });
      if (typeof body.trainer !== 'boolean') return json(res, 400, { error: 'trainer must be true or false' });
      if (body.trainer && u.disabled) return json(res, 400, { error: 'enable the account first' });
      if (!body.trainer) {
        const n = sql.prepare(`SELECT COUNT(*) AS n FROM links WHERE trainer_id = ? AND status IN ('active', 'paused')`).get(u.id).n;
        if (n) return json(res, 409, { error: 'this trainer still has clients', clients: n });
      }
      if (body.trainer) {
        sql.prepare('INSERT OR IGNORE INTO trainers (user_id, created_at) VALUES (?, ?)').run(u.id, Date.now());
        u.trainer = true;
      } else delete u.trainer;
      saveDb();
      audit(req, body.trainer ? 'admin.trainer.grant' : 'admin.trainer.revoke', { user: owner, target: u });
      json(res, 200, { ok: true, id: u.id, trainer: isTrainer(u) });
    },

    // Who am I in coaching: a trainer, someone's client, both or neither. Any signed-in user.
    'GET /api/coaching/me': async (req, res) => {
      const user = requireUser(req, res); if (!user) return;
      const link = liveLinkOf(user.id);
      const t = link && userById(link.trainer_id);
      json(res, 200, {
        trainer: isTrainer(user),
        coach: link ? { id: link.trainer_id, name: t ? t.name : null, status: link.status, since: link.started_at } : null
      });
    },

    // The trainer's own clients with a live link (active or paused).
    'GET /api/coaching/clients': async (req, res) => {
      const trainer = requireTrainer(req, res); if (!trainer) return;
      const rows = sql.prepare(
        `SELECT * FROM links WHERE trainer_id = ? AND status IN ('active', 'paused') ORDER BY started_at`
      ).all(trainer.id);
      const clients = [];
      for (const l of rows) { const u = userById(l.client_id); if (u) clients.push(clientRow(l, u)); }
      json(res, 200, { clients });
    },

    // One of the trainer's own clients.
    'GET /api/coaching/client': async (req, res) => {
      const own = requireOwnClient(req, res, idParam(req)); if (!own) return;
      json(res, 200, { client: clientRow(own.link, own.client) });
    }
  };
}
