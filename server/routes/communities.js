import { Router } from 'express'
import {
  getAllCommunityDocs, getCommunityDoc, createCommunityDoc, communityExists,
} from '../firebase/db.js'
import { getRosterCount } from '../state/communities.js'

const router = Router()

const slugify = (name) =>
  name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'community'

// collision-safe id: base slug, then -2, -3, ... until free
async function makeCommunityId(name) {
  const base = slugify(name)
  let id = base
  let n = 2
  while (await communityExists(id)) {
    id = `${base}-${n++}`
  }
  return id
}

const withLiveCount = (c) => ({
  ...c,
  memberCount: (c.members || []).length,
  online:      getRosterCount(c.id),
})

/* GET /api/communities — list all communities (custom + lazily-created static) */
router.get('/', async (_req, res) => {
  const docs = await getAllCommunityDocs()
  res.json({ communities: docs.map(withLiveCount) })
})

/* GET /api/communities/:id */
router.get('/:id', async (req, res) => {
  const doc = await getCommunityDoc(req.params.id)
  if (!doc) return res.status(404).json({ error: 'Community not found' })
  res.json(withLiveCount(doc))
})

/* POST /api/communities — create a new community { name, desc, emoji, color, createdBy, creatorName } */
router.post('/', async (req, res) => {
  const { name, desc = '', emoji = '🌐', color = '#7c3aed', createdBy, creatorName } = req.body || {}
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' })

  const id = await makeCommunityId(name)
  const data = {
    id, name: name.trim(), desc: desc.trim(), emoji, color,
    createdBy: createdBy || 'anon',
    creatorName: creatorName || 'User',
  }

  const ok = await createCommunityDoc(data)
  if (!ok) return res.status(500).json({ error: 'Could not create community' })

  res.json({ community: { ...data, members: [], memberCount: 0, online: 0 } })
})

export default router
