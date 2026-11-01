// trainer-fork: the Trainer switch in a user's Admin drill-down. Only the owner sets it, and the
// owner can make themselves a trainer too. The server refuses to remove it while the trainer
// still has clients (api/coaching/routes.js, POST /api/admin/user/trainer).
import { api } from '../lib/api.js'
import { useUI } from '../store/useUI.js'
import { confirmSheet } from '../sheets.jsx'

export function trainerError(e) {
  return e?.status === 409 || /still has clients/.test(e?.message || '')
    ? 'Remove or hand over their clients first.'
    : e?.message || 'That did not work. Try again.'
}

export default function TrainerRoleButton({ u, viewerOwner, onChanged, close }) {
  if (!viewerOwner || u.disabled) return null
  const toast = msg => useUI.getState().toast(msg)
  const set = trainer => api('/api/admin/user/trainer', { method: 'POST', body: JSON.stringify({ id: u.id, trainer }) })
    .then(() => { toast(trainer ? u.name + ' is a trainer now' : u.name + ' is no longer a trainer'); onChanged?.(); close?.() })
    .catch(e => toast(trainerError(e)))
  return <>
    <button className="btn" style={{ margin: '14px 0 4px' }}
      onClick={() => u.trainer
        ? confirmSheet({ title: 'Remove ' + u.name + ' as trainer?', message: 'They keep their account and data, but lose the Clients page.', confirmText: 'Remove trainer', danger: true, onConfirm: () => set(false) })
        : confirmSheet({ title: 'Make ' + u.name + ' a trainer?', message: 'They can invite clients and see the workouts and progress of the clients who join them.', confirmText: 'Make trainer', onConfirm: () => set(true) })}>
      {u.trainer ? 'Remove trainer' : 'Make trainer'}</button>
    <div className="adm-hint">{u.trainer ? 'Trainers coach the clients they invite. Their clients have to be removed first.' : 'Trainers invite clients and coach them from Settings, Clients.'}</div>
  </>
}
