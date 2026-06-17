import { useNavigate } from 'react-router-dom'
import { UserButton } from '@clerk/clerk-react'
import { Search, Bell, MessageSquare, MoreHorizontal, Plus } from 'lucide-react'

const AV = (i, s=36) => `https://i.pravatar.cc/${s}?img=${i}`

const SERVER_ICONS = [
  { id:'wm', bg:'rgba(255,255,255,0.1)', emoji:'⊞' },
  { id:'d', bg:'#5865f2', emoji:'💬' },
  { id:'r', bg:'#ff4500', emoji:'👽' },
  { id:'y', bg:'#f59e0b', emoji:'🏠' },
  { id:'wm2', bg:'#7c3aed', label:'W', active:true },
  { id:'av', isAvatar:true, img_i:11 },
  { id:'g', bg:'#10b981', emoji:'🎮' },
  { id:'more', bg:'rgba(255,255,255,0.08)', emoji:'···' },
]

const FEATURED_ROOMS = [
  { id:1, title:"Dune: Part Two Watch Party", count:'450 Watching', action:'JOIN', color:'#3b82f6', img:'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=300&q=80' },
  { id:2, title:'Gaming: Valorant Night', count:'120 Playing', action:'PLAY', color:'#06b6d4', img:'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=300&q=80' },
  { id:3, title:'Anime Marathon: AoT', count:'310 Watching', action:'JOIN', color:'#3b82f6', img:'https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=300&q=80' },
]

const CHANNELS = [
  { name:'Movie Nights', rooms:[
    { id:1, title:'Blockbusters', count:'1,450 Watching', img:'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=120&q=80', time:'3m', viewers:[1,2,3] },
    { id:2, title:'Friday Horrors', count:'1,250 Watching', img:'https://images.unsplash.com/photo-1509347528160-9a9e33742cdb?w=120&q=80', time:'1m', viewers:[4,5,6] },
    { id:3, title:'Classic Cinema', count:'340 Watching', img:'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=120&q=80', time:'10m', viewers:[7,8,9] },
  ]},
  { name:'Anime', rooms:[
    { id:4, title:'Season Discussions', count:'2,120 Watching', img:'https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=120&q=80', time:'2m', viewers:[10,11,12] },
    { id:5, title:'Manga Hub', count:'720 Watching', img:'https://images.unsplash.com/photo-1555680202-c86f0e12f086?w=120&q=80', time:'1m', viewers:[13,14,15] },
    { id:6, title:'Cosplay Corner', count:'310 Watching', img:'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=120&q=80', time:'20m', viewers:[1,3,5] },
  ]},
  { name:'Gaming', rooms:[
    { id:7, title:'Valorant LFG', count:'890 Playing', img:'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=120&q=80', time:'23m', viewers:[2,4,6] },
    { id:8, title:'Minecraft Server', count:'430 Playing', img:'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=120&q=80', time:'27m', viewers:[7,9,11] },
    { id:9, title:'Apex Legends', count:'310 Watching', img:'https://images.unsplash.com/photo-1542751110-97427bbecfd3?w=120&q=80', time:'17m', viewers:[12,13,14] },
  ]},
]

const MEMBERS = [
  { id:1, name:'Sarah', status:'watching Dune', img:1 },
  { id:2, name:'Liam', status:'playing Valorant', img:2 },
  { id:3, name:'Liam', status:'watching Dune', img:3 },
  { id:4, name:'Grasse', status:'watching Dune', img:4 },
]

const EVENTS = [
  { id:1, title:"'Dune: Part Two' Grand Premier", when:'Tonight 8 PM EST', rsvp:180, color:'#f59e0b', rgb:'245,158,11' },
  { id:2, title:'Anime Trivia Night', when:'Tomorrow 7 PM EST', rsvp:95, color:'#7c3aed', rgb:'124,58,237' },
  { id:3, title:'Apex Legends Tournament', when:'Weekend 12 PM EST', rsvp:220, color:'#10b981', rgb:'16,185,129' },
]

export default function Server() {
  const nav = useNavigate()

  return (
    <div className="flex h-screen text-white overflow-hidden" style={{ background: '#080818', fontFamily: 'Outfit, sans-serif' }}>

      {/* Far-left icon sidebar */}
      <div className="w-16 flex flex-col items-center py-4 gap-3 border-r border-white/8 flex-shrink-0" style={{ background: '#06060f' }}>
        {SERVER_ICONS.map(s => (
          <button key={s.id}
            className="w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-bold transition-all hover:rounded-xl relative overflow-hidden"
            style={{ background: s.isAvatar ? 'transparent' : (s.bg || 'rgba(255,255,255,0.08)'), color: 'white' }}>
            {s.isAvatar
              ? <img src={AV(s.img_i, 40)} className="w-full h-full rounded-2xl object-cover" />
              : (s.label || s.emoji)}
            {s.active && <span className="absolute -left-2 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-white" />}
          </button>
        ))}
        <button className="mt-auto w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <Plus size={18} className="text-green-400" />
        </button>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-white/8 flex-shrink-0" style={{ background: 'rgba(9,9,26,0.95)', backdropFilter: 'blur(20px)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-black text-xs" style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)' }}>W</div>
            <span className="font-bold text-base">Watchy<span style={{ color: '#a78bfa' }}>Me</span></span>
          </div>
          <div className="relative w-80">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input placeholder="Search" className="w-full rounded-xl pl-9 pr-4 py-2 text-sm text-gray-300 border border-white/8 outline-none" style={{ background: 'rgba(255,255,255,0.06)' }} />
          </div>
          <div className="flex items-center gap-3">
            <button className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <MessageSquare size={15} className="text-gray-400" />
            </button>
            <div className="relative">
              <button className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <Bell size={15} className="text-gray-400" />
              </button>
              <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold" style={{ background: '#7c3aed' }}>3</div>
            </div>
            <div className="flex items-center gap-2">
              <UserButton afterSignOutUrl="/" />
              <div>
                <p className="text-sm font-semibold leading-tight">Alex R.</p>
                <p className="text-[10px]" style={{ color: '#22c55e' }}>● Online</p>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">

            {/* Banner + Featured Rooms side by side */}
            <div className="flex gap-4" style={{ minHeight: '200px' }}>

              {/* Server Banner */}
              <div className="relative rounded-2xl overflow-hidden flex-shrink-0" style={{ width: '320px' }}>
                <img src="https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=700&q=80" className="w-full h-full object-cover opacity-45" />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.65), rgba(30,64,175,0.55))' }} />
                <div className="absolute inset-0 flex flex-col justify-end p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-base flex-shrink-0" style={{ background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)' }}>W</div>
                    <div>
                      <h2 className="text-base font-black leading-tight">WatchyMe Community</h2>
                      <p className="text-xs text-gray-300 mt-0.5">Join Active Watch Parties & Discussions</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-300">
                    <span>● 12,450 Members</span>
                    <span style={{ color: '#22c55e' }}>● 2,130 Online</span>
                  </div>
                </div>
              </div>

              {/* Featured Rooms */}
              <div className="flex-1 flex flex-col gap-2 min-w-0">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Featured Rooms</h3>
                <div className="grid grid-cols-3 gap-3 flex-1">
                  {FEATURED_ROOMS.map(r => (
                    <div key={r.id} className="relative rounded-2xl overflow-hidden border border-white/10 cursor-pointer hover:border-white/25 transition-all group" onClick={() => nav('/room/1')}>
                      <img src={r.img} className="w-full h-full object-cover opacity-70 group-hover:opacity-90 group-hover:scale-105 transition-all duration-300" />
                      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(8,8,24,0.96) 0%, rgba(8,8,24,0.2) 55%, transparent 100%)' }} />
                      <div className="absolute bottom-0 left-0 right-0 p-3">
                        <p className="font-bold text-sm text-white leading-tight">{r.title}</p>
                        <div className="flex items-center justify-between mt-1.5">
                          <p className="text-[11px] text-gray-400">{r.count}</p>
                          <button className="text-xs font-bold px-2.5 py-1 rounded-lg text-white hover:opacity-90 transition-all" style={{ background: r.color }}>{r.action}</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Channels */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">Channels</h3>
              <div className="grid grid-cols-3 gap-5">
                {CHANNELS.map(ch => (
                  <div key={ch.name}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-bold text-white">{ch.name}</span>
                      <button><MoreHorizontal size={15} className="text-gray-500 hover:text-gray-300 transition-colors" /></button>
                    </div>
                    <div className="flex flex-col gap-2.5">
                      {ch.rooms.map(r => (
                        <div key={r.id} className="flex items-center gap-3 rounded-xl p-2.5 border border-white/8 hover:border-white/20 cursor-pointer transition-all group" style={{ background: 'rgba(255,255,255,0.03)' }} onClick={() => nav('/room/1')}>
                          <div className="w-14 h-16 rounded-lg overflow-hidden flex-shrink-0">
                            <img src={r.img} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-white truncate">{r.title}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{r.count}</p>
                            <div className="flex items-center justify-between mt-2">
                              <div className="flex -space-x-1.5">
                                {r.viewers.slice(0,3).map(v => <img key={v} src={AV(v,18)} className="w-4 h-4 rounded-full border border-white/20" />)}
                              </div>
                              <span className="text-[10px] text-gray-500">{r.time}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right sidebar */}
          <div className="w-64 border-l border-white/8 flex flex-col flex-shrink-0 overflow-y-auto" style={{ background: '#09091a' }}>
            <div className="p-4 border-b border-white/8">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Active Members</h3>
              <div className="relative mb-3">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                <input placeholder="Search" className="w-full rounded-xl pl-8 pr-3 py-2 text-xs text-gray-300 border border-white/8 outline-none" style={{ background: 'rgba(255,255,255,0.06)' }} />
              </div>
              <div className="flex flex-col gap-2.5">
                {MEMBERS.map(m => (
                  <div key={m.id} className="flex items-center gap-2.5 cursor-pointer hover:bg-white/5 rounded-xl px-2 py-1.5 transition-all">
                    <div className="relative flex-shrink-0">
                      <img src={AV(m.img, 34)} className="w-8 h-8 rounded-full" />
                      <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full border-2" style={{ borderColor: '#09091a' }} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-white">{m.name}</p>
                      <p className="text-[10px] text-gray-500">{m.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Upcoming Events</h3>
              <div className="flex flex-col gap-2.5">
                {EVENTS.map(e => (
                  <div key={e.id} className="rounded-xl p-3 border" style={{ background: `rgba(${e.rgb},0.08)`, borderColor: `${e.color}40` }}>
                    <p className="text-xs font-bold text-white leading-snug mb-1">{e.title}</p>
                    <p className="text-[10px] text-gray-400 mb-2.5">{e.when}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-400">RSVP {e.rsvp}</span>
                      <button className="text-[10px] font-bold px-3 py-1.5 rounded-lg text-white hover:opacity-90 transition-all" style={{ background: e.color }}>RSVP {e.rsvp}</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
