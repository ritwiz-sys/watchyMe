import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser, UserButton } from '@clerk/clerk-react'
import { Users, Tv, Globe, Search, Plus, Settings, Hash, Lock, Loader, UserPlus } from 'lucide-react'
import { socket } from '../lib/socket'
import { db } from '../lib/firebase'
import { doc, getDoc, setDoc, collection, query, where, getDocs, arrayUnion, arrayRemove } from 'firebase/firestore'
import { useFriends } from '../hooks/useFriends'
import { useCommunities } from '../hooks/useCommunities'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000'
const AV = (url, s = 32) => url || `https://ui-avatars.com/api/?size=${s}&background=7c3aed&color=fff&name=U`

/* ── Static community definitions (join state is per-user in Firestore) ── */
const COMMUNITIES = [
  { id:'bollywood', name:'Bollywood Squad', emoji:'🎭', members:'2.4K', desc:'Daily drops, memes & marathon nights',    color:'#f97316', active:89  },
  { id:'anime',     name:'Anime Addicts',   emoji:'⚔️', members:'8.1K', desc:'Seasonal watching & episode discussions', color:'#f59e0b', active:234 },
  { id:'horror',    name:'Horror Heads',    emoji:'👻', members:'1.2K', desc:'Monthly horror marathons & theories',     color:'#8b5cf6', active:41  },
  { id:'marvel',    name:'Marvel Universe', emoji:'⚡', members:'15K',  desc:'MCU timeline watches & hype posts',       color:'#ef4444', active:567 },
  { id:'romcom',    name:'Rom-Com Club',    emoji:'💕', members:'3.7K', desc:'Cozy movie nights & recommendations',     color:'#ec4899', active:112 },
  { id:'scifi',     name:'Sci-Fi Cosmos',   emoji:'🚀', members:'5.2K', desc:'Classic & modern sci-fi deep dives',     color:'#06b6d4', active:178 },
]

const GAME_TYPES = [
  { id:'trivia',    name:'Movie Trivia',  emoji:'🎬', desc:'Test your knowledge — 5 questions, time-bonuses',  color:'#7c3aed', bg:'rgba(124,58,237,.15)' },
  { id:'rps',       name:'Rock Paper ✂', emoji:'✂️', desc:'Classic. First to 3 wins takes the round.',        color:'#06b6d4', bg:'rgba(6,182,212,.15)'  },
  { id:'wordchain', name:'Word Chain',    emoji:'🔤', desc:'Keep the chain going — no repeats allowed!',       color:'#22c55e', bg:'rgba(34,197,94,.15)'  },
  { id:'draw',      name:'Draw & Guess', emoji:'🎨', desc:'One draws, everyone guesses. Most points wins.',   color:'#f97316', bg:'rgba(249,115,22,.15)' },
]

const ROOM_COLORS = ['#f97316','#f59e0b','#8b5cf6','#ef4444','#ec4899','#06b6d4','#22c55e','#3b82f6']
const colorFor = i => ROOM_COLORS[i % ROOM_COLORS.length]

const NAV = [
  { id:'friends',     Icon: Users,    label:'Friends'       },
  { id:'watchparty',  Icon: Tv,       label:'Watch Parties' },
  { id:'communities', Icon: Globe,    label:'Communities'   },
]

/* ── Random room name generator ── */
const ROOM_ADJECTIVES = ['Cozy','Epic','Late Night','Friday','Weekend','Spicy','Chill','Hype','Vibe','Midnight','Secret','Binge']
const ROOM_NOUNS      = ['Hangout','Movie Night','Watch Party','Squad','Zone','Cave','Corner','Lounge','Den','Session','Spot']
const randomRoomName  = () => {
  const adj  = ROOM_ADJECTIVES[Math.floor(Math.random() * ROOM_ADJECTIVES.length)]
  const noun = ROOM_NOUNS[Math.floor(Math.random() * ROOM_NOUNS.length)]
  return `${adj} ${noun}`
}

/* ════════════════════════════════════════════════════════════
   CREATE ROOM MODAL  (Google Meet / Discord style — 1 step)
════════════════════════════════════════════════════════════ */
function CreateRoomModal({ onClose, nav, user }) {
  const [isPrivate, setPrivate]  = useState(false)
  const [launching, setLaunching]= useState(false)
  const [launchErr, setLaunchErr]= useState('')

  const launch = () => {
    setLaunching(true); setLaunchErr('')
    socket.connect()
    socket.emit('createRoom', {
      name:     user?.firstName || user?.username || 'User',
      avatar:   user?.imageUrl  || null,
      roomName: randomRoomName(),   // auto-generated, no input needed
      type:     'unified',
      isPrivate,
    }, (res) => {
      setLaunching(false)
      if (!res.ok) { setLaunchErr(res.error || 'Could not create room'); return }
      onClose()
      nav('/room/' + res.room.code)   // straight in, no waiting screen
    })
  }

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,.82)', backdropFilter:'blur(14px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:'#0d0d24', border:'1px solid rgba(124,58,237,.28)', borderRadius:28, width:'100%', maxWidth:440, boxShadow:'0 48px 120px rgba(0,0,0,.8)', animation:'modalIn .3s ease both', overflow:'hidden' }}>
        <div style={{ padding:'26px 28px 0', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:11, color:'#a78bfa', fontWeight:700, letterSpacing:'0.09em', textTransform:'uppercase', marginBottom:4 }}>Instant Room</div>
            <div style={{ fontSize:19, fontWeight:900, color:'white', fontFamily:'Outfit,sans-serif' }}>Create & Enter Now</div>
          </div>
          <button onClick={onClose} style={{ width:32, height:32, borderRadius:'50%', background:'rgba(255,255,255,.07)', border:'none', color:'#9ca3af', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>✕</button>
        </div>

        <div style={{ padding:'20px 28px 28px', display:'flex', flexDirection:'column', gap:16 }}>
          {/* Features badge row */}
          <div style={{ display:'flex', gap:8 }}>
            {[{icon:'🎤',label:'Voice'},{icon:'📺',label:'Watch'},{icon:'🎮',label:'Games'},{icon:'💬',label:'Chat'}].map(f => (
              <div key={f.label} style={{ flex:1, padding:'10px 8px', borderRadius:12, background:'rgba(124,58,237,.08)', border:'1px solid rgba(124,58,237,.15)', textAlign:'center' }}>
                <div style={{ fontSize:16 }}>{f.icon}</div>
                <div style={{ fontSize:10, color:'#9ca3af', marginTop:3, fontWeight:600 }}>{f.label}</div>
              </div>
            ))}
          </div>

          {/* Auto-code notice */}
          <div style={{ background:'rgba(124,58,237,.08)', border:'1px solid rgba(124,58,237,.15)', borderRadius:13, padding:'12px 15px', display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:20 }}>🎲</span>
            <div>
              <div style={{ color:'white', fontWeight:700, fontSize:13, fontFamily:'Outfit,sans-serif' }}>Random code generated automatically</div>
              <div style={{ color:'#6b7280', fontSize:11, marginTop:2 }}>A unique WM-XXXX code is created instantly — share it with friends</div>
            </div>
          </div>

          {/* Visibility */}
          <div style={{ display:'flex', gap:10 }}>
            {[{v:false,icon:'🌐',label:'Public',sub:'Anyone can discover & join'},{v:true,icon:'🔒',label:'Private',sub:'Only via link or code'}].map(opt => (
              <button key={String(opt.v)} onClick={() => setPrivate(opt.v)}
                style={{ flex:1, padding:'12px 14px', borderRadius:14, border:`1.5px solid ${isPrivate===opt.v?'rgba(124,58,237,.55)':'rgba(255,255,255,.07)'}`, background:isPrivate===opt.v?'rgba(124,58,237,.1)':'rgba(255,255,255,.02)', cursor:'pointer', transition:'all .18s', textAlign:'left' }}>
                <div style={{ fontSize:18, marginBottom:5 }}>{opt.icon}</div>
                <div style={{ color:'white', fontWeight:700, fontSize:13, fontFamily:'Outfit,sans-serif' }}>{opt.label}</div>
                <div style={{ color:'#6b7280', fontSize:11, marginTop:2 }}>{opt.sub}</div>
              </button>
            ))}
          </div>

          <button onClick={launch} disabled={launching}
            style={{ padding:'16px', borderRadius:14, border:'none', background:launching?'rgba(124,58,237,.4)':'linear-gradient(135deg,#7c3aed,#6d28d9)', color:'white', fontWeight:800, fontSize:16, cursor:launching?'not-allowed':'pointer', fontFamily:'Outfit,sans-serif', display:'flex', alignItems:'center', justifyContent:'center', gap:8, letterSpacing:'.01em' }}>
            {launching ? <><Loader size={16} style={{animation:'spin 1s linear infinite'}}/> Creating…</> : '🚀 Create & Enter Room'}
          </button>
          {launchErr && <div style={{ fontSize:12, color:'#ef4444', textAlign:'center', fontWeight:600 }}>⚠ {launchErr}</div>}
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   CREATE COMMUNITY MODAL
════════════════════════════════════════════════════════════ */
const COMMUNITY_EMOJIS = ['🎭','⚔️','👻','⚡','💕','🚀','🎬','🎵','🏆','🌙','🔥','🎃']

function CreateCommunityModal({ onClose, user, onCreate }) {
  const [name,     setName]    = useState('')
  const [desc,     setDesc]    = useState('')
  const [emoji,    setEmoji]   = useState('🎭')
  const [saving,   setSaving]  = useState(false)
  const [err,      setErr]     = useState('')

  const create = async () => {
    if (!name.trim()) { setErr('Give your community a name!'); return }
    setSaving(true); setErr('')
    try {
      const color = ['#f97316','#f59e0b','#8b5cf6','#ef4444','#ec4899','#06b6d4'][Math.floor(Math.random()*6)]
      await onCreate({ name: name.trim(), desc: desc.trim(), emoji, color })
      onClose()
    } catch (e) {
      setErr('Could not create community. Try again.')
    }
    setSaving(false)
  }

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:300, background:'rgba(0,0,0,.82)', backdropFilter:'blur(14px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:'#0d0d24', border:'1px solid rgba(124,58,237,.3)', borderRadius:24, width:'100%', maxWidth:440, boxShadow:'0 48px 120px rgba(0,0,0,.8)', animation:'modalIn .3s ease both' }}>
        <div style={{ padding:'24px 24px 0', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontSize:17, fontWeight:900, color:'white' }}>Create Community</div>
          <button onClick={onClose} style={{ width:30, height:30, borderRadius:'50%', background:'rgba(255,255,255,.07)', border:'none', color:'#9ca3af', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>
        <div style={{ padding:'20px 24px 24px', display:'flex', flexDirection:'column', gap:16 }}>
          {/* Emoji picker */}
          <div>
            <label style={{ fontSize:12, color:'#9ca3af', fontWeight:600, display:'block', marginBottom:8 }}>Pick an Emoji</label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {COMMUNITY_EMOJIS.map(e => (
                <button key={e} onClick={() => setEmoji(e)}
                  style={{ width:40, height:40, borderRadius:12, border:`1.5px solid ${emoji===e?'rgba(124,58,237,.6)':'rgba(255,255,255,.08)'}`, background:emoji===e?'rgba(124,58,237,.15)':'rgba(255,255,255,.03)', fontSize:20, cursor:'pointer', transition:'all .15s' }}>
                  {e}
                </button>
              ))}
            </div>
          </div>
          {/* Name */}
          <div>
            <label style={{ fontSize:12, color:'#9ca3af', fontWeight:600, display:'block', marginBottom:8 }}>Community Name</label>
            <input autoFocus value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. K-Drama Fans"
              style={{ width:'100%', background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.12)', borderRadius:12, padding:'12px 14px', color:'white', fontSize:14, fontFamily:'Outfit,sans-serif', outline:'none', boxSizing:'border-box' }}
              onFocus={e => e.target.style.borderColor='rgba(124,58,237,.5)'}
              onBlur={e  => e.target.style.borderColor='rgba(255,255,255,.12)'}
            />
          </div>
          {/* Description */}
          <div>
            <label style={{ fontSize:12, color:'#9ca3af', fontWeight:600, display:'block', marginBottom:8 }}>Description <span style={{ color:'#4b5563' }}>(optional)</span></label>
            <input value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="What's this community about?"
              style={{ width:'100%', background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.12)', borderRadius:12, padding:'12px 14px', color:'white', fontSize:14, fontFamily:'Outfit,sans-serif', outline:'none', boxSizing:'border-box' }}
              onFocus={e => e.target.style.borderColor='rgba(124,58,237,.5)'}
              onBlur={e  => e.target.style.borderColor='rgba(255,255,255,.12)'}
            />
          </div>
          <button onClick={create} disabled={saving || !name.trim()}
            style={{ padding:'13px', borderRadius:14, border:'none', background:(!name.trim()||saving)?'rgba(124,58,237,.4)':'linear-gradient(135deg,#7c3aed,#6d28d9)', color:'white', fontWeight:800, fontSize:14, cursor:(!name.trim()||saving)?'not-allowed':'pointer', fontFamily:'Outfit,sans-serif', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            {saving ? <><Loader size={15} style={{animation:'spin 1s linear infinite'}}/> Creating…</> : `${emoji} Create Community`}
          </button>
          {err && <div style={{ fontSize:12, color:'#ef4444', textAlign:'center' }}>⚠ {err}</div>}
        </div>
      </div>
    </div>
  )
}


/* ════════════════════════════════════════════════════════════
   SECTION: FRIENDS
════════════════════════════════════════════════════════════ */
function FriendsView({ onlineUsers, loading, nav, currentUser, friendsApi }) {
  const { friends, requests, sendRequest, acceptRequest, declineRequest, removeFriend } = friendsApi
  const [searchQ,    setSearchQ]    = useState('')
  const [searchRes,  setSearchRes]  = useState([])
  const [searching,  setSearching]  = useState(false)
  const [searchErr,  setSearchErr]  = useState('')
  const [sentTo,     setSentTo]     = useState(new Set())
  const debounce     = useRef(null)

  const searchUsers = async (q) => {
    if (!q.trim() || q.length < 2) { setSearchRes([]); return }
    setSearching(true); setSearchErr('')
    try {
      const usersRef = collection(db, 'users')
      const snap     = await getDocs(query(usersRef, where('username', '>=', q.toLowerCase()), where('username', '<=', q.toLowerCase() + '')))
      const results  = []
      snap.forEach(d => { if (d.id !== currentUser?.id) results.push(d.data()) })
      setSearchRes(results)
      if (results.length === 0) setSearchErr('No users found with that username')
    } catch (e) { setSearchErr('Search failed. Try again.') }
    setSearching(false)
  }

  const onSearch = (v) => {
    setSearchQ(v)
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => searchUsers(v), 400)
  }

  const isFriend = (uid) => friends.some(f => f.id === uid)

  const handleSendRequest = async (person) => {
    setSentTo(prev => new Set(prev).add(person.id))
    const res = await sendRequest(person.id, person)
    if (!res?.ok) setSentTo(prev => { const n = new Set(prev); n.delete(person.id); return n })
  }

  const savedOnline  = friends.filter(f => f.online)
  const savedOffline = friends.filter(f => !f.online)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:28 }}>

      {requests.length > 0 && (
        <div>
          <h2 style={{ fontSize:18, fontWeight:800, color:'white', margin:'0 0 16px' }}>
            Friend Requests — <span style={{ color:'#a78bfa' }}>{requests.length}</span>
          </h2>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {requests.map(r => (
              <div key={r.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderRadius:16, border:'1px solid rgba(124,58,237,.25)', background:'rgba(124,58,237,.06)' }}>
                <img src={AV(r.avatar, 40)} style={{ width:40, height:40, borderRadius:'50%', flexShrink:0 }} />
                <div style={{ flex:1 }}>
                  <div style={{ color:'white', fontWeight:700, fontSize:14 }}>{r.name}</div>
                  <div style={{ color:'#6b7280', fontSize:12 }}>wants to be friends</div>
                </div>
                <button onClick={() => acceptRequest(r.id)}
                  style={{ padding:'7px 14px', borderRadius:10, border:'none', background:'#22c55e', color:'#000', fontSize:12, fontWeight:800, cursor:'pointer', fontFamily:'Outfit,sans-serif' }}>
                  Accept
                </button>
                <button onClick={() => declineRequest(r.id)}
                  style={{ padding:'7px 14px', borderRadius:10, border:'1px solid rgba(255,255,255,.12)', background:'transparent', color:'#9ca3af', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'Outfit,sans-serif' }}>
                  Decline
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
          <UserPlus size={16} color="#a78bfa" />
          <h2 style={{ fontSize:18, fontWeight:800, color:'white', margin:0 }}>Find Friends</h2>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)', borderRadius:14, padding:'10px 14px', marginBottom:12 }}>
          <Search size={14} color="#6b7280" />
          <input
            value={searchQ} onChange={e => onSearch(e.target.value)}
            placeholder="Search by username…"
            style={{ flex:1, background:'none', border:'none', outline:'none', color:'white', fontSize:14, fontFamily:'Outfit,sans-serif' }}
          />
          {searching && <Loader size={14} color="#7c3aed" style={{ animation:'spin 1s linear infinite', flexShrink:0 }} />}
        </div>

        {searchErr && !searching && <div style={{ fontSize:13, color:'#6b7280', padding:'10px 4px' }}>{searchErr}</div>}

        {searchRes.length > 0 && (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {searchRes.map(u => {
              const already = isFriend(u.id)
              const pending = sentTo.has(u.id)
              return (
                <div key={u.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderRadius:16, border:'1px solid rgba(255,255,255,.07)', background:'rgba(255,255,255,.03)' }}>
                  <img src={AV(u.avatar, 40)} style={{ width:40, height:40, borderRadius:'50%', flexShrink:0 }} />
                  <div style={{ flex:1 }}>
                    <div style={{ color:'white', fontWeight:700, fontSize:14 }}>{u.name}</div>
                    <div style={{ color:'#6b7280', fontSize:12 }}>@{u.username}</div>
                  </div>
                  {already ? (
                    <button onClick={() => removeFriend(u.id)}
                      style={{ padding:'7px 16px', borderRadius:10, border:'1px solid rgba(239,68,68,.4)', background:'rgba(239,68,68,.1)', color:'#ef4444', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'Outfit,sans-serif' }}>
                      Remove
                    </button>
                  ) : (
                    <button onClick={() => handleSendRequest(u)} disabled={pending}
                      style={{ padding:'7px 16px', borderRadius:10, border:'1px solid rgba(124,58,237,.4)', background:pending?'rgba(124,58,237,.05)':'rgba(124,58,237,.1)', color:pending?'#6b7280':'#a78bfa', fontSize:12, fontWeight:700, cursor:pending?'default':'pointer', fontFamily:'Outfit,sans-serif' }}>
                      {pending ? 'Request sent' : '+ Add'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {friends.length > 0 && (
        <div>
          <h2 style={{ fontSize:18, fontWeight:800, color:'white', margin:'0 0 16px' }}>
            My Friends — <span style={{ color:'#a78bfa' }}>{friends.length}</span>
          </h2>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px,1fr))', gap:10 }}>
            {savedOnline.map(f => (
              <div key={f.id} style={{ padding:'14px', borderRadius:16, border:'1px solid rgba(34,197,94,.2)', background:'rgba(34,197,94,.05)', display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ position:'relative', flexShrink:0 }}>
                  <img src={AV(f.avatar, 38)} style={{ width:38, height:38, borderRadius:'50%' }} />
                  <div style={{ position:'absolute', bottom:0, right:0, width:10, height:10, borderRadius:'50%', background:'#22c55e', border:'2px solid #09091a' }} />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ color:'white', fontWeight:700, fontSize:13 }}>{(f.name || 'Friend').split(' ')[0]}</div>
                  <div style={{ fontSize:11, color:'#22c55e', marginTop:1 }}>{f.roomCode ? `📺 ${f.roomName || 'In a room'}` : 'Online'}</div>
                </div>
                {f.roomCode && (
                  <button onClick={() => nav('/room/' + f.roomCode)}
                    style={{ padding:'5px 12px', borderRadius:9, border:'none', background:'#22c55e', color:'#000', fontSize:11, fontWeight:800, cursor:'pointer', fontFamily:'Outfit,sans-serif', flexShrink:0 }}>
                    Join
                  </button>
                )}
              </div>
            ))}
            {savedOffline.map(f => (
              <div key={f.id} style={{ padding:'14px', borderRadius:16, border:'1px solid rgba(255,255,255,.06)', background:'rgba(255,255,255,.02)', display:'flex', alignItems:'center', gap:10, opacity:.7 }}>
                <div style={{ position:'relative', flexShrink:0 }}>
                  <img src={AV(f.avatar, 38)} style={{ width:38, height:38, borderRadius:'50%', filter:'grayscale(.5)' }} />
                  <div style={{ position:'absolute', bottom:0, right:0, width:10, height:10, borderRadius:'50%', background:'#4b5563', border:'2px solid #09091a' }} />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ color:'#d1d5db', fontWeight:600, fontSize:13 }}>{(f.name || 'Friend').split(' ')[0]}</div>
                  <div style={{ fontSize:11, color:'#6b7280', marginTop:1 }}>Offline</div>
                </div>
                <button onClick={() => removeFriend(f.id)}
                  style={{ padding:'4px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,.1)', background:'transparent', color:'#6b7280', fontSize:10, fontWeight:600, cursor:'pointer', fontFamily:'Outfit,sans-serif' }}>
                  x
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {onlineUsers.filter(u => !friends.some(f => f.name === u.name)).length > 0 && (
        <div>
          <h2 style={{ fontSize:16, fontWeight:700, color:'#9ca3af', margin:'0 0 12px' }}>Online Now (Public Rooms)</h2>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px,1fr))', gap:10 }}>
            {onlineUsers.filter(u => !friends.some(f => f.name === u.name)).map((u, i) => (
              <div key={i} style={{ padding:'14px', borderRadius:16, border:'1px solid rgba(255,255,255,.06)', background:'rgba(255,255,255,.02)', display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ position:'relative', flexShrink:0 }}>
                  <img src={AV(u.avatar, 38)} style={{ width:38, height:38, borderRadius:'50%' }} />
                  <div style={{ position:'absolute', bottom:0, right:0, width:10, height:10, borderRadius:'50%', background:'#22c55e', border:'2px solid #09091a' }} />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ color:'white', fontWeight:700, fontSize:13 }}>{u.name}</div>
                  <div style={{ fontSize:11, color:'#22c55e', marginTop:1 }}>📺 {u.roomName}</div>
                </div>
                <button onClick={() => nav('/room/' + u.roomCode)}
                  style={{ padding:'5px 11px', borderRadius:9, border:'none', background:'rgba(124,58,237,.2)', color:'#a78bfa', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'Outfit,sans-serif', flexShrink:0 }}>
                  Join
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && onlineUsers.length === 0 && friends.length === 0 && requests.length === 0 && (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:200, gap:12 }}>
          <div style={{ fontSize:40 }}>👥</div>
          <div style={{ fontSize:15, fontWeight:700, color:'white' }}>No one online yet</div>
          <div style={{ fontSize:13, color:'#6b7280', textAlign:'center', maxWidth:300 }}>
            Search for friends by username above, or create a room and share the link!
          </div>
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   SECTION: WATCH PARTIES (real active rooms)
════════════════════════════════════════════════════════════ */
function WatchPartiesView({ liveRooms, loading, nav }) {
  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:200 }}>
      <Loader size={28} color="#7c3aed" style={{ animation:'spin 1s linear infinite' }} />
    </div>
  )

  const watchRooms = liveRooms.filter(r => r.type === 'watch' || r.type === 'watchparty')
  const otherRooms = liveRooms.filter(r => r.type !== 'watch' && r.type !== 'watchparty')

  if (liveRooms.length === 0) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:320, gap:16 }}>
      <div style={{ fontSize:52 }}>📺</div>
      <div style={{ fontSize:18, fontWeight:800, color:'white' }}>No watch parties live right now</div>
      <div style={{ fontSize:13, color:'#6b7280', textAlign:'center', maxWidth:300, lineHeight:1.6 }}>
        Create a Watch Party room and share the code with your crew to start watching together!
      </div>
    </div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:28 }}>
      {watchRooms.length > 0 && (
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:'#ef4444', animation:'dotPulse 1.5s ease infinite' }} />
            <h2 style={{ fontSize:18, fontWeight:800, color:'white', margin:0 }}>Live Now — <span style={{ color:'#ef4444' }}>{watchRooms.length}</span></h2>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px,1fr))', gap:16 }}>
            {watchRooms.map((r, idx) => {
              const color = colorFor(idx)
              return (
                <div key={r.code}
                  style={{ borderRadius:20, overflow:'hidden', border:`1px solid ${color}44`, background:'rgba(255,255,255,.03)', cursor:'pointer', transition:'all .25s' }}
                  onClick={() => nav('/room/' + r.code)}
                  onMouseEnter={e => { e.currentTarget.style.borderColor=color+'99'; e.currentTarget.style.transform='translateY(-4px)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor=color+'44'; e.currentTarget.style.transform='translateY(0)' }}>
                  <div style={{ padding:'22px', background:`linear-gradient(135deg,${color}20,rgba(0,0,0,.3))` }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                      <span style={{ background:'#ef4444', color:'white', fontSize:10, fontWeight:800, padding:'3px 8px', borderRadius:6 }}>● LIVE</span>
                      <span style={{ background:`${color}22`, border:`1px solid ${color}66`, color, fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:6 }}>Watch Party</span>
                    </div>
                    <div style={{ fontSize:16, fontWeight:800, color:'white', marginBottom:4 }}>{r.name}</div>
                    <div style={{ fontSize:12, color:'rgba(255,255,255,.45)' }}>
                      {r.memberCount} {r.memberCount === 1 ? 'person' : 'people'} watching
                    </div>
                  </div>
                  <div style={{ padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <div style={{ display:'flex' }}>
                        {(r.members || []).slice(0, 4).map((m, i) => (
                          <img key={i} src={AV(m.avatar, 18)} style={{ width:18, height:18, borderRadius:'50%', border:'1.5px solid rgba(255,255,255,.15)', marginLeft:i>0?-5:0 }} />
                        ))}
                      </div>
                      <span style={{ fontSize:11, color:'#9ca3af' }}>{r.memberCount} watching</span>
                    </div>
                    <button style={{ padding:'7px 16px', borderRadius:10, border:'none', background:color, color:'white', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'Outfit,sans-serif' }}>Join</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {otherRooms.length > 0 && (
        <div>
          <h2 style={{ fontSize:18, fontWeight:800, color:'white', margin:'0 0 16px' }}>Other Active Rooms</h2>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px,1fr))', gap:14 }}>
            {otherRooms.map((r, idx) => {
              const color = colorFor(idx + 3)
              return (
                <div key={r.code}
                  style={{ padding:'18px', borderRadius:18, border:'1px solid rgba(255,255,255,.07)', background:'rgba(255,255,255,.03)', cursor:'pointer', transition:'all .2s' }}
                  onClick={() => nav('/room/' + r.code)}
                  onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(255,255,255,.18)'; e.currentTarget.style.transform='translateY(-2px)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor='rgba(255,255,255,.07)'; e.currentTarget.style.transform='translateY(0)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                    <div style={{ fontSize:14, fontWeight:800, color:'white' }}>{r.name}</div>
                    <span style={{ fontSize:10, color, fontWeight:700, background:`${color}18`, padding:'2px 8px', borderRadius:6, textTransform:'capitalize', flexShrink:0 }}>{r.type}</span>
                  </div>
                  <div style={{ fontSize:12, color:'#6b7280', marginBottom:12 }}>{r.memberCount} {r.memberCount===1?'person':'people'} inside</div>
                  <button style={{ padding:'8px', borderRadius:10, border:'none', background:color, color:'white', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'Outfit,sans-serif', width:'100%' }}>Join Room</button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   SECTION: GAMES (creates real rooms on click)
════════════════════════════════════════════════════════════ */
function GamesView({ nav, user }) {
  const [launching, setLaunching] = useState(null)

  const launchGame = (gameType, gameName) => {
    if (launching) return
    setLaunching(gameType)
    socket.connect()
    socket.emit('createRoom', {
      name:      user?.firstName || user?.username || 'User',
      avatar:    user?.imageUrl  || null,
      roomName:  `${user?.firstName || 'User'}'s ${gameName}`,
      type:      'game',
      isPrivate: false,
    }, (res) => {
      setLaunching(null)
      if (res.ok) nav('/room/' + res.room.code)
    })
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:28 }}>
      {/* Quick Play banner */}
      <div style={{ borderRadius:20, padding:'28px 32px', background:'linear-gradient(135deg,rgba(124,58,237,.25),rgba(6,182,212,.15))', border:'1px solid rgba(124,58,237,.3)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:20 }}>
        <div>
          <div style={{ fontSize:11, color:'#a78bfa', fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:6 }}>Quick Play</div>
          <h2 style={{ fontSize:22, fontWeight:900, color:'white', margin:'0 0 6px' }}>Jump into a game 🎲</h2>
          <p style={{ color:'#6b7280', fontSize:13, margin:0 }}>Creates a public room — share code with friends</p>
        </div>
        <button onClick={() => launchGame('trivia','Trivia')} disabled={!!launching}
          style={{ padding:'14px 24px', borderRadius:14, border:'none', background:launching?'rgba(124,58,237,.5)':'linear-gradient(135deg,#7c3aed,#6d28d9)', color:'white', fontWeight:800, fontSize:14, cursor:launching?'not-allowed':'pointer', fontFamily:'Outfit,sans-serif', whiteSpace:'nowrap', flexShrink:0, display:'flex', alignItems:'center', gap:8 }}>
          {launching ? <Loader size={15} style={{animation:'spin 1s linear infinite'}}/> : null}
          🎮 Quick Match
        </button>
      </div>

      {/* Game cards */}
      <div>
        <h2 style={{ fontSize:18, fontWeight:800, color:'white', margin:'0 0 16px' }}>Pick a Game</h2>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px,1fr))', gap:14 }}>
          {GAME_TYPES.map(g => (
            <div key={g.id}
              style={{ padding:'22px', borderRadius:20, border:'1px solid rgba(255,255,255,.07)', background:g.bg, cursor:launching?'not-allowed':'pointer', transition:'all .22s', opacity:launching&&launching!==g.id?.65:1 }}
              onClick={() => launchGame(g.id, g.name)}
              onMouseEnter={e => { if (!launching) { e.currentTarget.style.borderColor=g.color+'66'; e.currentTarget.style.transform='translateY(-4px)'; e.currentTarget.style.boxShadow=`0 12px 32px ${g.color}22` }}}
              onMouseLeave={e => { e.currentTarget.style.borderColor='rgba(255,255,255,.07)'; e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='none' }}>
              <div style={{ fontSize:36, marginBottom:14 }}>{launching===g.id ? '⏳' : g.emoji}</div>
              <h3 style={{ fontSize:16, fontWeight:800, color:'white', margin:'0 0 6px' }}>{g.name}</h3>
              <p style={{ fontSize:12, color:'#9ca3af', margin:'0 0 16px', lineHeight:1.5 }}>{g.desc}</p>
              <button disabled={!!launching}
                style={{ padding:'7px 16px', borderRadius:10, border:'none', background:launching===g.id?'rgba(255,255,255,.15)':g.color, color:'white', fontSize:12, fontWeight:700, cursor:launching?'not-allowed':'pointer', fontFamily:'Outfit,sans-serif', display:'flex', alignItems:'center', gap:6 }}>
                {launching===g.id ? <><Loader size={11} style={{animation:'spin 1s linear infinite'}}/>Starting…</> : '▶ Play'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   SECTION: COMMUNITIES (join state per-user in Firestore)
════════════════════════════════════════════════════════════ */
function CommunitiesView({ communities, joined, toggleCommunity, onCreateCommunity }) {
  const myComms  = communities.filter(c => joined.includes(c.id))
  const discover = communities.filter(c => !joined.includes(c.id))

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:28 }}>
      {/* Header row with Create button */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <h2 style={{ fontSize:18, fontWeight:800, color:'white', margin:0 }}>Communities</h2>
        <button onClick={onCreateCommunity}
          style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 18px', borderRadius:12, border:'none', background:'linear-gradient(135deg,#7c3aed,#6d28d9)', color:'white', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'Outfit,sans-serif' }}>
          <Plus size={14} /> Create Community
        </button>
      </div>

      {/* My communities */}
      {myComms.length > 0 && (
        <div>
          <h2 style={{ fontSize:18, fontWeight:800, color:'white', margin:'0 0 16px' }}>My Communities</h2>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px,1fr))', gap:14 }}>
            {myComms.map(c => (
              <div key={c.id}
                style={{ padding:'20px', borderRadius:20, border:`1px solid ${c.color}33`, background:`linear-gradient(135deg,${c.color}0d,rgba(255,255,255,.02))`, cursor:'pointer', transition:'all .22s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor=c.color+'66'; e.currentTarget.style.transform='translateY(-3px)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor=c.color+'33'; e.currentTarget.style.transform='translateY(0)' }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:12 }}>
                  <div style={{ width:48, height:48, borderRadius:14, background:`${c.color}22`, border:`1px solid ${c.color}44`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:24 }}>{c.emoji}</div>
                  <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:'#22c55e' }}>
                    <div style={{ width:6, height:6, borderRadius:'50%', background:'#22c55e' }} />
                    {c.active} online
                  </div>
                </div>
                <div style={{ fontSize:15, fontWeight:800, color:'white', marginBottom:4 }}>{c.name}</div>
                <div style={{ fontSize:12, color:'#6b7280', marginBottom:14, lineHeight:1.5 }}>{c.desc}</div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <span style={{ fontSize:11, color:'#9ca3af' }}>👥 {c.members} members</span>
                  <button onClick={e => { e.stopPropagation(); toggleCommunity(c.id) }}
                    style={{ padding:'5px 14px', borderRadius:10, border:`1px solid ${c.color}55`, background:'transparent', color:c.color, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'Outfit,sans-serif' }}>
                    Joined ✓
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {myComms.length === 0 && (
        <div style={{ padding:'28px', borderRadius:20, border:'1px solid rgba(255,255,255,.06)', background:'rgba(255,255,255,.02)', textAlign:'center' }}>
          <div style={{ fontSize:36, marginBottom:10 }}>🌐</div>
          <div style={{ fontSize:15, fontWeight:700, color:'white', marginBottom:4 }}>No communities joined yet</div>
          <div style={{ fontSize:13, color:'#6b7280' }}>Join communities below to see them here</div>
        </div>
      )}

      {/* Discover */}
      {discover.length > 0 && (
        <div>
          <h2 style={{ fontSize:18, fontWeight:800, color:'white', margin:'0 0 16px' }}>Discover</h2>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px,1fr))', gap:14 }}>
            {discover.map(c => (
              <div key={c.id}
                style={{ padding:'20px', borderRadius:20, border:'1px solid rgba(255,255,255,.07)', background:'rgba(255,255,255,.02)', cursor:'pointer', transition:'all .22s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(255,255,255,.15)'; e.currentTarget.style.transform='translateY(-3px)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor='rgba(255,255,255,.07)'; e.currentTarget.style.transform='translateY(0)' }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:12 }}>
                  <div style={{ width:48, height:48, borderRadius:14, background:`${c.color}15`, border:`1px solid ${c.color}33`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:24 }}>{c.emoji}</div>
                  <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:'#22c55e' }}>
                    <div style={{ width:6, height:6, borderRadius:'50%', background:'#22c55e' }} />
                    {c.active} online
                  </div>
                </div>
                <div style={{ fontSize:15, fontWeight:800, color:'white', marginBottom:4 }}>{c.name}</div>
                <div style={{ fontSize:12, color:'#6b7280', marginBottom:14, lineHeight:1.5 }}>{c.desc}</div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <span style={{ fontSize:11, color:'#9ca3af' }}>👥 {c.members} members</span>
                  <button onClick={e => { e.stopPropagation(); toggleCommunity(c.id) }}
                    style={{ padding:'5px 14px', borderRadius:10, border:`1px solid ${c.color}44`, background:`${c.color}18`, color:c.color, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'Outfit,sans-serif' }}>
                    + Join
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   MAIN HOME COMPONENT
════════════════════════════════════════════════════════════ */
export default function Home() {
  const { user }    = useUser()
  const nav         = useNavigate()
  const [active,      setActive]      = useState('friends')
  const [modal,       setModal]       = useState(false)
  const [commModal,   setCommModal]   = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  /* ── Real-time data ── */
  const [liveRooms,         setLiveRooms]         = useState([])
  const [onlineUsers,       setOnlineUsers]        = useState([])
  const [loadingRooms,      setLoadingRooms]       = useState(true)

  /* ── Real-time friends: presence + request flow over socket.io ── */
  const friendsApi = useFriends(user)

  /* ── Real-time communities: server-tracked rosters (join/leave only) ── */
  const communitiesApi = useCommunities(user, COMMUNITIES)

  /* ── Fetch active public rooms every 15 s ── */
  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const res   = await fetch(`${SERVER_URL}/api/rooms`)
        const data  = await res.json()
        const rooms = data.rooms || []
        setLiveRooms(rooms)

        // Flatten members across all rooms → online users list
        const seen  = new Set()
        const users = []
        for (const room of rooms) {
          for (const m of room.members || []) {
            const key = m.name + room.code
            if (!seen.has(key)) {
              seen.add(key)
              users.push({ ...m, roomCode: room.code, roomName: room.name })
            }
          }
        }
        setOnlineUsers(users)
      } catch (_) {}
      setLoadingRooms(false)
    }
    fetchRooms()
    const iv = setInterval(fetchRooms, 15_000)
    return () => clearInterval(iv)
  }, [])

  /* ── Register user profile in Firestore (makes them searchable by username) ── */
  useEffect(() => {
    if (!user) return
    const username = user.username || user.firstName?.toLowerCase().replace(/\s+/g,'_') || `user_${user.id.slice(-6)}`
    const profileRef = doc(db, 'users', user.id)
    getDoc(profileRef).then(snap => {
      const data = snap.exists() ? snap.data() : {}
      // Always keep profile fresh with latest Clerk data
      setDoc(profileRef, {
        ...data,
        id:        user.id,
        username,
        name:      user.fullName || user.firstName || username,
        avatar:    user.imageUrl || null,
        updatedAt: Date.now(),
      }, { merge: true }).catch(() => {})
      // Communities (joined ids + live rosters) are handled by useCommunities below
    }).catch(() => {})
  }, [user])

  const firstName      = user?.firstName || 'there'
  const SECTION_TITLE  = { friends:'Friends', watchparty:'Watch Parties', communities:'Communities' }

  return (
    <div style={{ display:'flex', height:'100vh', background:'#070714', fontFamily:'Outfit,sans-serif', color:'white', overflow:'hidden' }}>
      <style>{`
        @keyframes dotPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.4);opacity:.7}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes modalIn{from{opacity:0;transform:scale(.94) translateY(16px)}to{opacity:1;transform:none}}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:rgba(124,58,237,.35);border-radius:4px}
      `}</style>

      {/* ── Hover strip (far-left 6px trigger for icon bar) ── */}
      <div style={{ position:'fixed', left:0, top:0, bottom:0, width:6, zIndex:300, cursor:'e-resize' }}
        onMouseEnter={() => setSidebarOpen(true)} />

      {/* ── Icon bar ── */}
      <div onMouseEnter={() => setSidebarOpen(true)} onMouseLeave={() => setSidebarOpen(false)}
        style={{ width:sidebarOpen?64:0, flexShrink:0, overflow:'hidden', transition:'width .28s cubic-bezier(.4,0,.2,1)', background:'#06060f', borderRight:sidebarOpen?'1px solid rgba(255,255,255,.06)':'none', zIndex:200 }}>
        <div style={{ width:64, height:'100%', display:'flex', flexDirection:'column', alignItems:'center', padding:'16px 0', gap:6 }}>
          <div style={{ width:40, height:40, borderRadius:14, background:'linear-gradient(135deg,#3b82f6,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:18, marginBottom:10 }}>W</div>
          <div style={{ width:32, height:1, background:'rgba(255,255,255,.08)', marginBottom:6 }} />
          {NAV.map(item => (
            <button key={item.id} onClick={() => setActive(item.id)} title={item.label}
              style={{ width:44, height:44, borderRadius:active===item.id?14:20, background:active===item.id?'rgba(124,58,237,.3)':'rgba(255,255,255,.06)', border:active===item.id?'1px solid rgba(124,58,237,.5)':'1px solid transparent', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', transition:'all .2s' }}>
              <item.Icon size={18} color={active===item.id?'#a78bfa':'#6b7280'} />
            </button>
          ))}
          <div style={{ flex:1 }} />
          <div style={{ width:32, height:1, background:'rgba(255,255,255,.08)', marginBottom:6 }} />
          <button style={{ width:44, height:44, borderRadius:20, background:'rgba(255,255,255,.06)', border:'1px solid transparent', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
            <Settings size={16} color="#6b7280" />
          </button>
          <div style={{ padding:4 }}><UserButton afterSignOutUrl="/" /></div>
        </div>
      </div>

      {/* ── Left panel ── */}
      <div style={{ width:240, flexShrink:0, background:'#09091a', borderRight:'1px solid rgba(255,255,255,.06)', display:'flex', flexDirection:'column', padding:'16px 0' }}>
        <div style={{ padding:'0 16px 16px', borderBottom:'1px solid rgba(255,255,255,.06)' }}>
          <div style={{ fontSize:13, fontWeight:800, color:'white', marginBottom:10 }}>watchy<span style={{ color:'#a78bfa' }}>me</span></div>
          <button onClick={() => setModal(true)}
            style={{ width:'100%', padding:'9px 14px', borderRadius:12, border:'none', background:'linear-gradient(135deg,#7c3aed,#6d28d9)', color:'white', fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:'Outfit,sans-serif', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
            <Plus size={13} /> Create Room
          </button>
        </div>

        <div style={{ padding:'12px 8px', flex:1, overflowY:'auto' }}>
          {NAV.map(item => (
            <button key={item.id} onClick={() => setActive(item.id)}
              style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:12, border:'none', background:active===item.id?'rgba(124,58,237,.2)':'transparent', color:active===item.id?'white':'#6b7280', cursor:'pointer', fontFamily:'Outfit,sans-serif', fontSize:13, fontWeight:active===item.id?700:500, marginBottom:2, transition:'all .15s', textAlign:'left' }}>
              <item.Icon size={15} color={active===item.id?'#a78bfa':'#6b7280'} />
              {item.label}
              {item.id==='friends' && friendsApi.requests.length>0 && (
                <div style={{ marginLeft:'auto', minWidth:18, height:18, borderRadius:9, background:'#7c3aed', fontSize:10, fontWeight:800, color:'white', display:'flex', alignItems:'center', justifyContent:'center', padding:'0 5px' }}>{friendsApi.requests.length}</div>
              )}
              {item.id==='watchparty' && liveRooms.length>0 && (
                <div style={{ marginLeft:'auto', minWidth:18, height:18, borderRadius:9, background:'#ef4444', fontSize:10, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 5px' }}>{liveRooms.length}</div>
              )}
            </button>
          ))}

          {/* Context mini-list per section */}
          <div style={{ marginTop:16, padding:'0 4px' }}>
            {active==='friends' && (
              <>
                <div style={{ fontSize:10, color:'#4b5563', fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:8, paddingLeft:8 }}>Online — {onlineUsers.length}</div>
                {onlineUsers.length===0 && <div style={{ fontSize:11, color:'#4b5563', paddingLeft:8 }}>Nobody online yet</div>}
                {onlineUsers.map((u, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:9, padding:'6px 8px', borderRadius:10, cursor:'pointer', transition:'background .15s' }}
                    onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,.05)'}
                    onMouseLeave={e => e.currentTarget.style.background='transparent'}
                    onClick={() => nav('/room/'+u.roomCode)}>
                    <div style={{ position:'relative', flexShrink:0 }}>
                      <img src={AV(u.avatar,24)} style={{ width:24, height:24, borderRadius:'50%' }} />
                      <div style={{ position:'absolute', bottom:-1, right:-1, width:8, height:8, borderRadius:'50%', background:'#22c55e', border:'1.5px solid #09091a' }} />
                    </div>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:12, fontWeight:600, color:'#d1d5db', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{u.name.split(' ')[0]}</div>
                      <div style={{ fontSize:10, color:'#6b7280', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{u.roomName}</div>
                    </div>
                  </div>
                ))}
              </>
            )}
            {active==='watchparty' && (
              <>
                <div style={{ fontSize:10, color:'#ef4444', fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:8, paddingLeft:8 }}>🔴 Live Rooms</div>
                {liveRooms.length===0 && <div style={{ fontSize:11, color:'#4b5563', paddingLeft:8 }}>No live rooms</div>}
                {liveRooms.map(r => (
                  <div key={r.code} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 8px', borderRadius:10, cursor:'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,.05)'}
                    onMouseLeave={e => e.currentTarget.style.background='transparent'}
                    onClick={() => nav('/room/'+r.code)}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:'#22c55e', flexShrink:0 }} />
                    <div style={{ fontSize:12, color:'#d1d5db', fontWeight:600, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.name}</div>
                    <div style={{ fontSize:10, color:'#6b7280', flexShrink:0 }}>{r.memberCount}</div>
                  </div>
                ))}
              </>
            )}
            {active==='communities' && (
              <>
                <div style={{ fontSize:10, color:'#4b5563', fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:8, paddingLeft:8 }}>My Communities</div>
                {communitiesApi.joined.length===0 && <div style={{ fontSize:11, color:'#4b5563', paddingLeft:8 }}>None joined yet</div>}
                {communitiesApi.communities.filter(c => communitiesApi.joined.includes(c.id)).map(c => (
                  <div key={c.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 8px', borderRadius:10, cursor:'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,.05)'}
                    onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                    <span style={{ fontSize:14 }}>{c.emoji}</span>
                    <div style={{ fontSize:12, color:'#d1d5db', flex:1 }}>{c.name}</div>
                    <div style={{ width:6, height:6, borderRadius:'50%', background:'#22c55e' }} />
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>
        {/* Top bar */}
        <div style={{ height:56, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 24px', borderBottom:'1px solid rgba(255,255,255,.06)', background:'rgba(7,7,20,.85)', backdropFilter:'blur(20px)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <Hash size={16} color="#6b7280" />
            <span style={{ fontSize:15, fontWeight:700, color:'white' }}>{SECTION_TITLE[active]}</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ position:'relative' }}>
              <Search size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#4b5563', pointerEvents:'none' }} />
              <input placeholder="Search..." style={{ background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.08)', borderRadius:10, padding:'7px 12px 7px 30px', color:'white', fontSize:13, fontFamily:'Outfit,sans-serif', outline:'none', width:180 }} />
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 10px', borderRadius:10, background:'rgba(34,197,94,.08)', border:'1px solid rgba(34,197,94,.18)' }}>
              <div style={{ width:6, height:6, borderRadius:'50%', background:'#22c55e', animation:'dotPulse 2s ease infinite' }} />
              <span style={{ fontSize:11, color:'#22c55e', fontWeight:700 }}>
                {loadingRooms ? '…' : `${onlineUsers.length} online`}
              </span>
            </div>
            <span style={{ fontSize:13, color:'#9ca3af' }}>Hey, <span style={{ color:'white', fontWeight:700 }}>{firstName}</span> 👋</span>
          </div>
        </div>

        {/* Section content */}
        <div style={{ flex:1, overflowY:'auto', padding:'28px' }}>
          {active==='friends'     && <FriendsView onlineUsers={onlineUsers} loading={loadingRooms} nav={nav} currentUser={user} friendsApi={friendsApi} />}
          {active==='watchparty'  && <WatchPartiesView liveRooms={liveRooms} loading={loadingRooms} nav={nav} />}
          {active==='communities' && <CommunitiesView communities={communitiesApi.communities} joined={communitiesApi.joined} toggleCommunity={communitiesApi.toggleCommunity} onCreateCommunity={() => setCommModal(true)} />}
        </div>
      </div>

      {/* Modals */}
      {modal     && <CreateRoomModal onClose={() => setModal(false)} nav={nav} user={user} />}
      {commModal && <CreateCommunityModal onClose={() => setCommModal(false)} user={user} onCreate={communitiesApi.createCommunity} />}
    </div>
  )
}
