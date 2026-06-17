import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { SignInButton, SignUpButton, useAuth } from '@clerk/clerk-react'
import { Play, ArrowRight, Users, MessageSquare, Smile, Lock, Globe, Monitor, Tv, SkipForward, Volume2, Maximize, Pause, ChevronLeft, ChevronRight } from 'lucide-react'

const AV = (i, s=32) => `https://i.pravatar.cc/${s}?img=${i}`

/* ── GENRES SLIDESHOW ── */
const GENRES = [
  { name:'Drama',    title:'KABHI KHUSHI KABHIE GHAM', sub:'Karan Johar · 2001',           time:'1:22:10 / 3:30:00', progress:39, color:'#f97316', glow:'rgba(249,115,22,.55)', img:'/k3g.png' },
  { name:'Action',   title:'NEON REQUIEM',           sub:'Season 2 · Finale',              time:'1:12:45 / 2:10:00', progress:54, color:'#ef4444', glow:'rgba(239,68,68,.55)',   img:'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=900&q=90' },
  { name:'Anime',    title:'ATTACK ON TITAN',        sub:'Final Season · Ep 28',           time:'18:30 / 24:00',  progress:77, color:'#f59e0b', glow:'rgba(245,158,11,.55)', img:'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=900&q=90' },
  { name:'Horror',   title:'THE FRIDAY HAUNT',       sub:"Director's Cut",                 time:'58:20 / 1:48:00', progress:54, color:'#8b5cf6', glow:'rgba(139,92,246,.55)', img:'https://images.unsplash.com/photo-1509347528160-9a9e33742cdb?w=900&q=90' },
  { name:'Romance',  title:'CITY OF STARS',          sub:'Extended Edition',               time:'47:05 / 1:54:00', progress:41, color:'#ec4899', glow:'rgba(236,72,153,.55)', img:'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=900&q=90' },
  { name:'Sci-Fi',   title:'2001: A SPACE ODYSSEY', sub:'Stanley Kubrick · 1968',        time:'34:12 / 2:22:00', progress:24, color:'#06b6d4', glow:'rgba(6,182,212,.55)',  img:'https://images.unsplash.com/photo-1446776653964-20c1d3a81b06?w=900&q=90' },
]
/* ── INFINITE CHAT POOL ── */
const CHAT_POOL = [
  { n:'Aarav',   m:'this movie is 🔥🔥',           i:1  },
  { n:'Diya',    m:'GOOSEBUMPS istg 😱',            i:2  },
  { n:'Rohan',   m:'the plot twist no way 💀',       i:3  },
  { n:'Meera',   m:'that background score 🎵✨',     i:4  },
  { n:'Arjun',   m:'LETS GOOOOO 🚀',               i:5  },
  { n:'Priya',   m:'crying actual tears rn 😭',     i:6  },
  { n:'Kian',    m:'best episode of the year fr',    i:7  },
  { n:'Zara',    m:'wait WHAT just happened??',      i:8  },
  { n:'Dev',     m:'10/10 no cap 🤌',               i:9  },
  { n:'Aisha',   m:'pause!! we need to discuss!!',   i:10 },
  { n:'Liam',    m:'did not see that coming 😤',     i:11 },
  { n:'Maya',    m:'rewatching this 100%',            i:12 },
  { n:'Ravi',    m:'this director is a genius 🎬',   i:13 },
  { n:'Sofia',   m:'literally shaking rn',           i:14 },
  { n:'Omar',    m:'chills the whole time 🥶',        i:15 },
  { n:'Chloe',   m:'peak cinema 🎭',                 i:16 },
  { n:'Ethan',   m:'volume up!! 🔊',                i:17 },
  { n:'Nora',    m:'i am not okay 😩',               i:18 },
  { n:'Kai',     m:'SCREAMING at that ending',        i:19 },
  { n:'Layla',   m:'okay this slaps hard 🔥',         i:20 },
]

const EMOJIS = ['😂','❤️','🔥','😱','💕','👏','🤯','✨','🥶','😭']

const STARS = Array.from({ length: 55 }, (_, i) => ({
  id: i, x: Math.random()*100, y: Math.random()*100,
  size: Math.random()*2+0.5, delay: Math.random()*4, dur: 2+Math.random()*3,
}))

export default function Landing() {
  const { isSignedIn } = useAuth()
  const nav = useNavigate()

  /* genre slideshow */
  const [gIdx, setGIdx]       = useState(0)
  const [gFade, setGFade]     = useState(false)
  const nextGenre = (dir=1) => {
    setGFade(true)
    setTimeout(() => { setGIdx(i => (i+dir+GENRES.length)%GENRES.length); setGFade(false) }, 320)
  }
  useEffect(() => { const t = setInterval(() => nextGenre(1), 4500); return () => clearInterval(t) }, [])

  /* infinite chat */
  const [msgs, setMsgs]       = useState(() => CHAT_POOL.slice(0,5).map((m,i) => ({...m, uid:i})))
  const msgIdx                = useRef(5)
  const chatRef               = useRef(null)
  useEffect(() => {
    const t = setInterval(() => {
      const next = CHAT_POOL[msgIdx.current % CHAT_POOL.length]
      msgIdx.current++
      setMsgs(prev => [...prev.slice(-11), { ...next, uid: Date.now() }])
    }, 1300)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [msgs])

  /* floating emoji reactions */
  const [floats, setFloats]   = useState([])
  useEffect(() => {
    const t = setInterval(() => {
      const emoji = EMOJIS[Math.floor(Math.random()*EMOJIS.length)]
      setFloats(prev => [...prev.filter(f => Date.now()-f.id < 3200), { id:Date.now(), emoji, x:28+Math.random()*55 }])
    }, 950)
    return () => clearInterval(t)
  }, [])

  useEffect(() => { if (isSignedIn) nav('/home') }, [isSignedIn])

  /* blog modal */
  const [openPost, setOpenPost] = useState(null)

  /* scroll reveal */
  useEffect(() => {
    const els = document.querySelectorAll('.reveal')
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('revealed'); obs.unobserve(e.target) } })
    }, { threshold: 0.08, rootMargin: "0px 0px -40px 0px" })
    els.forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [])

  /* smooth scroll with offset for navbar */
  const smoothScroll = (e, href) => {
    e.preventDefault()
    const el = document.querySelector(href)
    if (!el) return
    const top = el.getBoundingClientRect().top + window.scrollY - 72
    window.scrollTo({ top, behavior: 'smooth' })
  }

  const BLOG_POSTS = [
    {
      tag: "Tips", emoji: "🎬", date: "May 28, 2025", read: "3 min",
      title: "5 ways to make your movie night actually hit",
      content: [
        { h: "1. Pick a theme", p: "Don’t just random-pick a movie. Go for a theme night — 90s Bollywood, Marvel marathon, horror spree. A theme gives everyone something to hype about before it even starts." },
        { h: "2. Sync before you play", p: "Nothing kills the vibe like someone being 2 minutes ahead. Use WatchyMe’s sync feature — everyone is on the same frame, same second. No more “wait wait don’t spoil it.”" },
        { h: "3. Use the reaction bar", p: "Emojis mid-scene hit different. When the plot twist drops and five people send 😱 at the same time, it feels like you’re actually in the same room." },
        { h: "4. Make a snack ritual", p: "Tell everyone to grab their snack of choice before the movie. It’s a small thing but it makes it feel like a real outing. Bonus: rate each other’s snack choices live in chat." },
        { h: "5. Post-movie voice chat", p: "The movie ending is just the beginning. Jump on voice right after and go full movie review mode. This is honestly the best part — everyone has takes, everyone is wrong, it’s perfect." },
      ]
    },
    {
      tag: "Gaming", emoji: "🎮", date: "May 20, 2025", read: "4 min",
      title: "Best party games to play between episodes",
      content: [
        { h: "Between episodes? Play something.", p: "The episode just ended on a cliffhanger and you need 10 minutes before the next one. Perfect window for a quick game." },
        { h: "Trivia wars", p: "Make someone the host, they fire rapid questions about the show you’re watching. Get it right, you stay. Get it wrong, you take a challenge. Simple, chaotic, perfect." },
        { h: "Two truths one lie — about the show", p: "Each person states three things about the episode — two true, one false. Everyone votes. Winner picks the next episode." },
        { h: "Character draft", p: "Before the next episode, everyone picks which character they think will have the best moment. At the end, you vote who called it. No stakes, all banter." },
        { h: "WatchyMe mini-games", p: "We’re building in-app mini-games right inside your room — no switching tabs, no extra links. Word games, quick draw, dares. Coming soon but it’s going to be 🔥" },
      ]
    },
    {
      tag: "Culture", emoji: "🫂", date: "May 12, 2025", read: "2 min",
      title: "Why watching together beats watching alone",
      content: [
        { h: "Reactions make it real", p: "You can pause a movie alone and feel nothing. You pause it with friends and suddenly everyone’s screaming opinions. The same scene hits 10x harder when someone else is reacting with you." },
        { h: "Shared memory > solo memory", p: "You won’t remember what you watched alone last Tuesday. But you’ll remember the movie night where Arjun predicted the twist and wouldn’t stop talking about it for a week." },
        { h: "The chat IS the content", p: "Half the time the live chat during a movie is more entertaining than the movie itself. Inside jokes form. Running commentary builds. You’re not just watching — you’re creating something together." },
        { h: "Distance disappears", p: "Your friends are in different cities, different time zones. But when you’re all synced on the same frame, laughing at the same moment — distance doesn’t exist. That’s what WatchyMe is built for." },
      ]
    },
  ]

  const genre = GENRES[gIdx]

  return (
    <div style={{ background:'#070714', fontFamily:'Outfit, sans-serif', color:'white', minHeight:'100vh', overflowX:'hidden' }}>

      <style>{`
        @keyframes float {
          0%,100% { transform:perspective(1100px) rotateY(-9deg) rotateX(4deg) translateY(0px); }
          50%      { transform:perspective(1100px) rotateY(-9deg) rotateX(4deg) translateY(-18px) translateZ(18px); }
        }
        @keyframes floatChat {
          0%,100% { transform:perspective(1100px) rotateY(6deg) rotateX(3deg) translateY(0px); }
          50%      { transform:perspective(1100px) rotateY(6deg) rotateX(3deg) translateY(-10px); }
        }
        @keyframes blob  { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(50px,-70px) scale(1.15)} 66%{transform:translate(-35px,30px) scale(.88)} }
        @keyframes blob2 { 0%,100%{transform:translate(0,0) scale(1)} 40%{transform:translate(-60px,50px) scale(1.1)} 70%{transform:translate(40px,-30px) scale(.9)} }
        @keyframes gradShift { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(26px)} to{opacity:1;transform:translateY(0)} }
        @keyframes floatEmoji { 0%{opacity:0;transform:translateY(0) scale(.5)} 15%{opacity:1;transform:translateY(-14px) scale(1.3)} 80%{opacity:.85} 100%{opacity:0;transform:translateY(-100px) scale(.6)} }
        @keyframes twinkle { 0%,100%{opacity:.2;transform:scale(1)} 50%{opacity:1;transform:scale(1.6)} }
        @keyframes scanline { from{top:-5%} to{top:115%} }
        @keyframes shimBtn { from{left:-80%} to{left:140%} }
        @keyframes msgIn { from{opacity:0;transform:translateX(12px)} to{opacity:1;transform:translateX(0)} }
        @keyframes genreIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes dotPulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.4)} }
        @keyframes pulseGlow {
          0%,100% { box-shadow:0 0 40px var(--glow),0 30px 80px rgba(0,0,0,.5); }
          50%     { box-shadow:0 0 70px var(--glow),0 40px 100px rgba(0,0,0,.5); }
        }

        .floating-panel { animation:float 7s ease-in-out infinite; }
        .floating-chat  { animation:floatChat 8s ease-in-out infinite 1s; }
        .blob-a { animation:blob 12s ease-in-out infinite; }
        .blob-b { animation:blob2 14s ease-in-out infinite; }
        .pulse-glow { animation:pulseGlow 3.5s ease-in-out infinite; }
        .fade-1{animation:fadeUp .8s ease-out .1s both}
        .fade-2{animation:fadeUp .8s ease-out .25s both}
        .fade-3{animation:fadeUp .8s ease-out .4s both}
        .fade-4{animation:fadeUp .8s ease-out .55s both}
        .fade-5{animation:fadeUp .8s ease-out .7s both}
        .grad-text {
          background:linear-gradient(135deg,#c4b5fd,#a78bfa,#7c3aed,#06b6d4,#a78bfa,#c4b5fd);
          background-size:300% 300%;
          -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;
          animation:gradShift 5s ease infinite;
        }
        .card-lift { transition:transform .22s,border-color .22s,box-shadow .22s; }
        .card-lift:hover { transform:translateY(-5px) scale(1.01); border-color:rgba(124,58,237,.45)!important; box-shadow:0 16px 48px rgba(124,58,237,.18)!important; }
        .btn-primary { position:relative; overflow:hidden; background:linear-gradient(135deg,#7c3aed,#6d28d9); transition:opacity .2s,transform .2s; }
        .btn-primary:hover { opacity:.92; transform:scale(1.03); }
        .btn-primary::after { content:''; position:absolute; top:0; width:45%; height:100%; background:linear-gradient(90deg,transparent,rgba(255,255,255,.22),transparent); transform:skewX(-20deg); animation:shimBtn 2.8s ease infinite; }
        .nav-link { position:relative; transition:color .2s; text-decoration:none; color:#9ca3af; }
        .nav-link::after { content:''; position:absolute; bottom:-3px; left:0; width:0; height:1.5px; background:#a78bfa; transition:width .25s ease; }
        .nav-link:hover { color:white!important; }
        .nav-link:hover::after { width:100%; }
        .genre-img { transition:opacity .32s ease; }
        .msg-row { animation:msgIn .35s ease both; }
        .genre-label { animation:genreIn .4s ease both; }
        .genre-dot { transition:all .3s ease; }
        .sofa-container { position:relative; border-radius:20px; overflow:hidden; }
        .sofa-container img { transition:transform .4s ease; }
        .sofa-container:hover img { transform:scale(1.03); }
        .chat-scroll::-webkit-scrollbar { width:3px; }
        .chat-scroll::-webkit-scrollbar-track { background:transparent; }
        .chat-scroll::-webkit-scrollbar-thumb { background:rgba(124,58,237,.4); border-radius:4px; }
        html { scroll-behavior:smooth; }
        .reveal { opacity:0; transform:translateY(36px); transition:opacity .65s ease, transform .65s ease; }
        .revealed { opacity:1; transform:translateY(0); }
        .reveal-left { opacity:0; transform:translateX(-36px); transition:opacity .65s ease, transform .65s ease; }
        .reveal-left.revealed { opacity:1; transform:translateX(0); }
        .reveal-right { opacity:0; transform:translateX(36px); transition:opacity .65s ease, transform .65s ease; }
        .reveal-right.revealed { opacity:1; transform:translateX(0); }
        .delay-1 { transition-delay:.1s; } .delay-2 { transition-delay:.2s; } .delay-3 { transition-delay:.3s; }
        @keyframes revealFallback { to { opacity:1; transform:none; } }
        .reveal { animation: revealFallback 0s 2s forwards; }
        .revealed { animation: none; }
        @keyframes modalIn { from{opacity:0;transform:scale(.94) translateY(18px)} to{opacity:1;transform:scale(1) translateY(0)} }
        .modal-card { animation:modalIn .3s ease both; }
      `}</style>

      {/* STARS */}
      <div style={{ position:'fixed', inset:0, pointerEvents:'none', zIndex:0 }}>
        {STARS.map(s => (
          <div key={s.id} style={{ position:'absolute', left:`${s.x}%`, top:`${s.y}%`, width:s.size, height:s.size, borderRadius:'50%', background:'white', animation:`twinkle ${s.dur}s ease-in-out ${s.delay}s infinite` }} />
        ))}
      </div>

      {/* AURORA BLOBS */}
      <div style={{ position:'fixed', inset:0, pointerEvents:'none', zIndex:0, overflow:'hidden' }}>
        <div className="blob-a" style={{ position:'absolute', top:'-15%', left:'20%', width:700, height:600, borderRadius:'50%', opacity:.3, background:'radial-gradient(ellipse,#6d28d9 0%,#1e40af 45%,transparent 70%)' }} />
        <div className="blob-b" style={{ position:'absolute', top:'-10%', right:'-5%', width:500, height:480, borderRadius:'50%', opacity:.18, background:'radial-gradient(ellipse,#0ea5e9 0%,transparent 65%)' }} />
        <div style={{ position:'absolute', bottom:'-10%', left:'-5%', width:420, height:380, borderRadius:'50%', opacity:.13, background:'radial-gradient(ellipse,#7c3aed 0%,transparent 70%)' }} />
      </div>

      {/* NAVBAR */}
      <nav style={{ position:'relative', zIndex:50, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'20px 64px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:38, height:38, borderRadius:'50%', background:'linear-gradient(135deg,#3b82f6,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:16, boxShadow:'0 0 20px rgba(124,58,237,.5)' }}>W</div>
          <span style={{ fontSize:20, fontWeight:700 }}>watchy <span style={{ color:'#a78bfa' }}>me</span></span>
        </div>
        <div style={{ display:'flex', gap:30, fontSize:14 }}>
          {[['Home','#hero'],['Features','#features'],['Blog','#blog'],['About','#about']].map(([item,href],i) => (
            <a key={item} href={href} onClick={e=>smoothScroll(e,href)} className="nav-link" style={{ color: i===0?'white':undefined }}>{item}</a>
          ))}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:16 }}>
          <SignInButton mode="modal">
            <button style={{ background:'none', border:'none', color:'#d1d5db', cursor:'pointer', fontSize:14, fontWeight:500, fontFamily:'Outfit, sans-serif' }}>Log in</button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button className="btn-primary" style={{ display:'flex', alignItems:'center', gap:8, color:'white', border:'none', fontSize:14, fontWeight:700, padding:'10px 22px', borderRadius:50, cursor:'pointer', fontFamily:'Outfit, sans-serif' }}>
              Get Started <ArrowRight size={14} />
            </button>
          </SignUpButton>
        </div>
      </nav>

      {/* HERO */}
      <section id="hero" style={{ position:'relative', zIndex:10, display:'flex', alignItems:'flex-start', gap:36, padding:'20px 64px 56px', minHeight:'86vh' }}>

        {/* LEFT */}
        <div style={{ display:'flex', flexDirection:'column', gap:22, width:450, flexShrink:0, paddingTop:20 }}>
          <div className="fade-1" style={{ display:'flex', alignItems:'center', gap:8, width:'fit-content', borderRadius:50, padding:'8px 16px', background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.12)', fontSize:13, color:'#d1d5db' }}>
            <div style={{ display:'flex' }}>{[1,2,3].map(i=><img key={i} src={AV(i,24)} style={{ width:24,height:24,borderRadius:'50%',border:'2px solid rgba(255,255,255,.2)',marginLeft:i>1?-6:0 }}/>)}</div>
            <span>12K+ squads already hanging out</span>
            <span style={{ color:'#a78bfa', fontSize:16 }}>✦</span>
          </div>

          <h1 className="fade-2" style={{ fontSize:58, fontWeight:900, lineHeight:1.05, letterSpacing:'-0.02em', margin:0 }}>
            Your virtual<br />hangout for<br />
            <span className="grad-text" style={{ fontSize:62 }}>everything.</span>
          </h1>

          <p className="fade-3" style={{ color:'#9ca3af', fontSize:16, lineHeight:1.65, margin:0 }}>
            Movies, games, voice, chat — all in one place.<br />Hang out with your crew virtually, like you're actually together.
          </p>

          <div className="fade-4" style={{ display:'flex', gap:14, alignItems:'center' }}>
            <SignUpButton mode="modal">
              <button className="btn-primary" style={{ display:'flex',alignItems:'center',gap:8,color:'white',border:'none',fontSize:15,fontWeight:700,padding:'13px 26px',borderRadius:50,cursor:'pointer',fontFamily:'Outfit, sans-serif' }}>
                Start Hanging Out <ArrowRight size={16} />
              </button>
            </SignUpButton>
          </div>

          {/* Feature pills */}
          <div className="fade-5" style={{ display:'flex', borderRadius:16, overflow:'hidden', border:'1px solid rgba(255,255,255,.08)', background:'rgba(255,255,255,.03)' }}>
            {[
              { Icon:Play,         label:'Watch Movies', sub:'Sync playback' },
              { Icon:MessageSquare,label:'Voice & Chat',  sub:'Talk live' },
              { Icon:Smile,        label:'Play Games',    sub:'Mini-games' },
              { Icon:Lock,         label:'Private Rooms', sub:'Your crew only' },
            ].map(({ Icon,label,sub },i) => (
              <div key={label} style={{ flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:5,padding:'13px 6px',borderLeft:i>0?'1px solid rgba(255,255,255,.06)':'none' }}>
                <div style={{ width:34,height:34,borderRadius:10,background:'rgba(124,58,237,.15)',border:'1px solid rgba(124,58,237,.25)',display:'flex',alignItems:'center',justifyContent:'center' }}>
                  <Icon size={15} color="#a78bfa" />
                </div>
                <span style={{ fontSize:10,fontWeight:700,color:'white',textAlign:'center' }}>{label}</span>
                <span style={{ fontSize:9,color:'#6b7280',textAlign:'center' }}>{sub}</span>
              </div>
            ))}
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:10, fontSize:13, color:'#4b5563' }}>
            <span>Available on</span>
            {[Globe,Monitor,Tv].map((Icon,i)=>(
              <div key={i} style={{ width:30,height:30,borderRadius:'50%',background:'rgba(255,255,255,.06)',display:'flex',alignItems:'center',justifyContent:'center' }}>
                <Icon size={13} color="#9ca3af" />
              </div>
            ))}
            <div style={{ width:30,height:30,borderRadius:'50%',background:'rgba(255,255,255,.06)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13 }}>📱</div>
          </div>
        </div>

        {/* RIGHT — 3D tilted player + chat */}
        <div style={{ flex:1, display:'flex', gap:14, alignItems:'flex-start', paddingTop:6, position:'relative' }}>

          {/* Floating emojis */}
          <div style={{ position:'absolute', bottom:90, left:'50%', width:180, height:200, pointerEvents:'none', zIndex:20, overflow:'visible' }}>
            {floats.map(f => (
              <div key={f.id} style={{ position:'absolute', bottom:0, left:`${f.x}%`, fontSize:24, animation:'floatEmoji 2.8s ease-out forwards', filter:'drop-shadow(0 0 6px rgba(255,255,255,.35))' }}>{f.emoji}</div>
            ))}
          </div>

          {/* ── GENRE SLIDESHOW PLAYER ── */}
          <div
            className="floating-panel pulse-glow"
            style={{
              '--glow': genre.glow,
              flex:1, borderRadius:22, overflow:'hidden',
              border:`1.5px solid ${genre.color}88`,
              background:'#0d0d2e', minWidth:0,
              boxShadow:`0 40px 80px rgba(0,0,0,.6)`,
              transition:'border-color .4s ease',
            }}>

            {/* Top bar */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', borderBottom:'1px solid rgba(255,255,255,.07)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:'#d1d5db' }}>
                <Lock size={11} color="#9ca3af" />
                <span>Room: Movie Night</span>
              </div>
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                <span style={{ background:'#ef4444', color:'white', fontSize:10, padding:'2px 8px', borderRadius:5, fontWeight:700 }}>LIVE</span>
                <span style={{ background:'rgba(255,255,255,.1)', color:'white', fontSize:10, padding:'2px 8px', borderRadius:5, fontWeight:600 }}>1080p</span>
              </div>
            </div>

            {/* Movie image */}
            <div style={{ position:'relative', height:285, overflow:'hidden', cursor:'pointer' }}>
              <img
                src={genre.img}
                className="genre-img"
                style={{ width:'100%', height:'100%', objectFit:'cover', opacity: gFade ? 0 : 0.82 }}
              />
              {/* Scanline */}
              <div style={{ position:'absolute', left:0, width:'100%', height:'2px', background:`linear-gradient(to right,transparent,${genre.color}99,transparent)`, animation:'scanline 3.5s linear infinite', opacity:.6 }} />
              {/* Gradient overlay */}
              <div style={{ position:'absolute', inset:0, background:'linear-gradient(to bottom,transparent 30%,rgba(13,13,46,.97))' }} />
              {/* Genre badge */}
              <div className="genre-label" key={genre.name} style={{ position:'absolute', top:14, left:14, display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ background:`${genre.color}22`, border:`1px solid ${genre.color}66`, color:genre.color, fontSize:11, fontWeight:800, padding:'4px 12px', borderRadius:20, backdropFilter:'blur(8px)', letterSpacing:'0.05em' }}>
                  {genre.name.toUpperCase()}
                </span>
              </div>
              {/* Title overlay */}
              <div className="genre-label" key={genre.title} style={{ position:'absolute', bottom:14, left:16, right:16 }}>
                <div style={{ fontSize:16, fontWeight:900, color:'white', letterSpacing:'0.04em', textShadow:`0 0 20px ${genre.color}88` }}>{genre.title}</div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,.5)', marginTop:2 }}>{genre.sub}</div>
              </div>
              {/* Prev/Next arrows */}
              <button onClick={() => nextGenre(-1)} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', background:'rgba(0,0,0,.55)', border:'1px solid rgba(255,255,255,.15)', borderRadius:'50%', width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', backdropFilter:'blur(8px)' }}>
                <ChevronLeft size={14} color="white" />
              </button>
              <button onClick={() => nextGenre(1)} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'rgba(0,0,0,.55)', border:'1px solid rgba(255,255,255,.15)', borderRadius:'50%', width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', backdropFilter:'blur(8px)' }}>
                <ChevronRight size={14} color="white" />
              </button>
            </div>

            {/* Controls */}
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderTop:'1px solid rgba(255,255,255,.06)' }}>
              <Pause size={14} color="white" style={{ cursor:'pointer' }} />
              <SkipForward size={13} color="#9ca3af" style={{ cursor:'pointer' }} />
              <Volume2 size={13} color="#9ca3af" style={{ cursor:'pointer' }} />
              <div style={{ flex:1, height:4, borderRadius:4, background:'rgba(255,255,255,.13)', position:'relative', cursor:'pointer' }}>
                <div style={{ width:`${genre.progress}%`, height:'100%', borderRadius:4, background:`linear-gradient(to right,${genre.color},${genre.color}cc)`, transition:'width .4s ease' }} />
                <div style={{ position:'absolute', top:'50%', left:`${genre.progress}%`, transform:'translate(-50%,-50%)', width:10, height:10, borderRadius:'50%', background:'white', boxShadow:`0 0 8px ${genre.color}`, transition:'left .4s ease' }} />
              </div>
              <span style={{ fontSize:10, color:'#9ca3af', fontFamily:'monospace', whiteSpace:'nowrap' }}>{genre.time}</span>
              <Maximize size={12} color="#9ca3af" style={{ cursor:'pointer' }} />
            </div>

            {/* Genre dots + viewer row */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 14px 12px', background:'rgba(0,0,0,.15)' }}>
              <div style={{ display:'flex', gap:5 }}>
                {GENRES.map((g,i) => (
                  <button key={i} onClick={() => { setGFade(true); setTimeout(()=>{setGIdx(i);setGFade(false)},320) }}
                    className="genre-dot"
                    style={{ width: i===gIdx?20:6, height:6, borderRadius:4, background: i===gIdx ? genre.color : 'rgba(255,255,255,.2)', border:'none', cursor:'pointer', padding:0 }} />
                ))}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <div style={{ display:'flex' }}>{[5,6,7,8,9].map((i,idx)=><img key={i} src={AV(i,22)} style={{ width:22,height:22,borderRadius:'50%',border:'2px solid rgba(255,255,255,.2)',marginLeft:idx>0?-6:0 }}/>)}</div>
                <span style={{ fontSize:11, color:'#9ca3af' }}>+6 watching</span>
              </div>
            </div>
          </div>

          {/* ── INFINITE CHAT PANEL ── */}
          <div
            className="floating-chat"
            style={{ width:182, flexShrink:0, borderRadius:18, overflow:'hidden', border:'1px solid rgba(255,255,255,.1)', background:'rgba(11,11,36,.92)', backdropFilter:'blur(20px)', height:430, display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,.55)' }}>

            {/* Header */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', borderBottom:'1px solid rgba(255,255,255,.07)', flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <div style={{ width:7, height:7, borderRadius:'50%', background:'#22c55e', animation:'dotPulse 1.5s ease infinite' }} />
                <span style={{ fontSize:13, fontWeight:700 }}>Live Chat</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:'#6b7280' }}>
                <Users size={10} /> <span>1.2K</span>
              </div>
            </div>

            {/* Messages — infinite scroll */}
            <div
              ref={chatRef}
              className="chat-scroll"
              style={{ flex:1, padding:'10px 10px 6px', display:'flex', flexDirection:'column', gap:10, overflowY:'auto', scrollBehavior:'smooth' }}>
              {msgs.map((m, idx) => (
                <div key={m.uid} className="msg-row" style={{ display:'flex', gap:7, animationDelay: idx === msgs.length-1 ? '0ms' : '0ms' }}>
                  <div style={{ position:'relative', flexShrink:0 }}>
                    <img src={AV(m.i, 26)} style={{ width:24, height:24, borderRadius:'50%' }} />
                    <div style={{ position:'absolute', bottom:-1, right:-1, width:7, height:7, borderRadius:'50%', background:'#22c55e', border:'1.5px solid rgba(11,11,36,.9)' }} />
                  </div>
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, color:idx===msgs.length-1?'#a78bfa':'white', marginBottom:1 }}>{m.n}</div>
                    <div style={{ fontSize:10, color:'#9ca3af', lineHeight:1.4 }}>{m.m}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Input */}
            <div style={{ padding:'8px 10px 10px', borderTop:'1px solid rgba(255,255,255,.07)', flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(255,255,255,.06)', borderRadius:12, padding:'7px 10px' }}>
                <span style={{ fontSize:10, color:'#374151', flex:1 }}>Say something...</span>
                <Smile size={12} color="#6b7280" />
                <div style={{ width:18, height:18, borderRadius:7, background:'#7c3aed', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <ArrowRight size={9} color="white" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>



      {/* FEATURES SECTION */}
      <section id="features" style={{ position:'relative', zIndex:10, padding:'52px 64px 80px' }}>
        <div style={{ display:'flex', gap:40, alignItems:'stretch' }}>

          {/* Left */}
          <div style={{ width:320, flexShrink:0, display:'flex', flexDirection:'column', gap:16, justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, width:'fit-content', borderRadius:50, padding:'6px 16px', border:'1px solid rgba(167,139,250,.3)', background:'rgba(124,58,237,.08)', color:'#a78bfa', fontSize:13 }}>
              <span>✦</span><span>One app. Infinite hangouts.</span>
            </div>
            <h2 style={{ fontSize:44, fontWeight:900, lineHeight:1.1, letterSpacing:'-0.02em', margin:0 }}>
              Not just a<br />watch party.<br />
              A <span className="grad-text">virtual world.</span>
            </h2>
            <p style={{ color:'#6b7280', fontSize:13.5, lineHeight:1.7, margin:0 }}>
              WatchyMe is the all-in-one hangout spot — watch movies together, play games, jump on voice, drop reactions. Distance doesn't matter when you're in the same room.
            </p>

            {/* SOFA */}
            <div className="sofa-container" style={{ flex:1, minHeight:200, borderRadius:20 }}>
              {/* image with saturation/hue boost to match site palette */}
              <img src="/sofa.png" style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition:'center bottom', display:'block',
                filter:'saturate(1.25) brightness(0.78) hue-rotate(10deg)' }} />
              {/* left-side purple gradient bleed — ties into site bg */}
              <div style={{ position:'absolute', inset:0, background:'linear-gradient(105deg,rgba(109,40,217,.55) 0%,rgba(79,70,229,.18) 35%,transparent 65%)' }} />
              {/* top vignette so it fades into the dark page */}
              <div style={{ position:'absolute', top:0, left:0, right:0, height:'45%', background:'linear-gradient(to bottom,rgba(7,7,20,.72),transparent)' }} />
              {/* bottom vignette */}
              <div style={{ position:'absolute', bottom:0, left:0, right:0, height:'48%', background:'linear-gradient(to top,rgba(7,7,20,.88),transparent)' }} />
              {/* edge bleeds — left & right to blend into card bg */}
              <div style={{ position:'absolute', top:0, left:0, bottom:0, width:'22%', background:'linear-gradient(to right,rgba(7,7,20,.7),transparent)' }} />
              <div style={{ position:'absolute', top:0, right:0, bottom:0, width:'22%', background:'linear-gradient(to left,rgba(7,7,20,.7),transparent)' }} />
              {/* purple glow orb — mimics site aurora */}
              <div style={{ position:'absolute', top:'10%', left:'30%', width:130, height:100, borderRadius:'50%', background:'rgba(124,58,237,.28)', filter:'blur(38px)', pointerEvents:'none' }} />
              <div style={{ position:'absolute', bottom:'8%', right:'20%', width:90, height:70, borderRadius:'50%', background:'rgba(6,182,212,.12)', filter:'blur(28px)', pointerEvents:'none' }} />
              {/* subtle star sparkles matching site stars */}
              {[{x:15,y:10,s:2.5},{x:68,y:7,s:1.8},{x:82,y:18,s:2},{x:42,y:5,s:1.5},{x:90,y:28,s:1.8}].map((star,i)=>(
                <div key={i} style={{ position:'absolute', left:`${star.x}%`, top:`${star.y}%`, width:star.s, height:star.s, borderRadius:'50%', background:'white', opacity:.7, boxShadow:'0 0 3px white', animation:`twinkle ${1.8+i*.5}s ease-in-out ${i*.35}s infinite`, pointerEvents:'none' }} />
              ))}
            </div>
          </div>

          {/* Feature cards */}
          <div style={{ flex:1, display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, gridAutoRows:'1fr' }}>
              {[
                { Icon:Play,    label:'Sync & Watch',             desc:'Everyone stays in sync. Play, pause, seek — no one misses a frame.', extra:'sync'  },
                { Icon:MessageSquare, label:'Voice & Chat',      desc:'Talk, text and react in real-time — no tab-switching needed.', extra:'chat'  },
                { Icon:Smile,   label:'Mini-Games',              desc:'Play together between episodes. Trivia, dares, word games and more.', extra:'react' },
                { Icon:Users,   label:'Squad Rooms',             desc:'Create a private space for your crew — movie nights, game nights, chill sessions.', extra:'rooms' },
                { label:'HD Streaming',          isHD:true,     desc:'Crisp, lag-free quality made for any network speed.',    extra:'hd'    },
                { Icon:Monitor, label:'Works Everywhere',        desc:'Laptop, phone, tablet — your hangout goes wherever you do.', extra:'cross' },
              ].map((card,i) => (
                <div key={i} className="card-lift" style={{ borderRadius:18, padding:'18px', display:'flex', flexDirection:'column', border:'1px solid rgba(255,255,255,.07)', background:'rgba(255,255,255,.03)', height:'100%' }}>
                  <div style={{ width:40, height:40, borderRadius:11, background:'rgba(124,58,237,.15)', border:'1px solid rgba(124,58,237,.28)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:10 }}>
                    {card.isHD ? <span style={{ fontSize:10, fontWeight:900, color:'#a78bfa' }}>HD</span> : <card.Icon size={16} color="#a78bfa" />}
                  </div>
                  <h3 style={{ fontSize:12, fontWeight:700, color:'white', margin:'0 0 5px' }}>{card.label}</h3>
                  <p style={{ fontSize:11, color:'#6b7280', lineHeight:1.55, margin:'0 0 8px', flex:1 }}>{card.desc}</p>
                  {card.extra==='sync'  && <div><div style={{ display:'flex', marginBottom:5 }}>{[1,2,3,4].map(i=><img key={i} src={AV(i,13)} style={{ width:13,height:13,borderRadius:'50%',border:'1px solid rgba(255,255,255,.2)',marginLeft:i>1?-3:0 }}/>)}<span style={{ fontSize:9,color:'#6b7280',marginLeft:5 }}>+1</span></div><div style={{ height:3,borderRadius:3,background:'rgba(255,255,255,.1)' }}><div style={{ width:'55%',height:'100%',borderRadius:3,background:'linear-gradient(to right,#7c3aed,#a78bfa)' }}/></div><div style={{ fontSize:9,color:'#6b7280',textAlign:'right',marginTop:2 }}>43:51</div></div>}
                  {card.extra==='chat'  && <div style={{ display:'flex',flexDirection:'column',gap:4 }}>{[{i:1,n:'Aarav',m:'🔥 this movie'},{i:2,n:'Diya',m:'goosebumps!!'}].map(c=><div key={c.n} style={{ display:'flex',gap:4,alignItems:'center' }}><img src={AV(c.i,12)} style={{ width:12,height:12,borderRadius:'50%',flexShrink:0 }}/><span style={{ fontSize:9,color:'#9ca3af' }}><span style={{ color:'white',fontWeight:600 }}>{c.n}</span> {c.m}</span></div>)}</div>}
                  {card.extra==='react' && <div style={{ display:'flex',gap:4,fontSize:15,flexWrap:'wrap' }}>{['😂','❤️','👏','🔥','💕'].map(e=><span key={e}>{e}</span>)}</div>}
                  {card.extra==='rooms' && <div><div style={{ display:'flex',alignItems:'center',gap:4,fontSize:9,color:'#6b7280',border:'1px solid rgba(255,255,255,.07)',borderRadius:7,padding:'4px 7px',background:'rgba(255,255,255,.04)',marginBottom:4 }}><Lock size={7}/><span style={{ marginLeft:2 }}>Movie Night Crew</span><Users size={7} style={{ marginLeft:'auto' }}/><span>12</span></div><div style={{ display:'flex' }}>{[4,5,6,7].map(i=><img key={i} src={AV(i,13)} style={{ width:13,height:13,borderRadius:'50%',border:'1px solid rgba(255,255,255,.2)',marginLeft:i>4?-3:0 }}/>)}<span style={{ fontSize:9,color:'#6b7280',marginLeft:4 }}>+8</span></div></div>}
                  {card.extra==='hd'    && <div style={{ display:'flex',gap:5 }}>{['1090p','4K','HDR'].map(q=><span key={q} style={{ fontSize:9,padding:'3px 7px',borderRadius:6,fontWeight:700,background:q==='4K'?'#7c3aed':'rgba(255,255,255,.08)',color:'white' }}>{q}</span>)}</div>}
                  {card.extra==='cross' && <div style={{ display:'flex',gap:8,color:'#9ca3af' }}><Globe size={14}/><Monitor size={14}/><Tv size={14}/><span style={{ fontSize:13 }}>📱</span><span style={{ fontSize:13 }}>🎮</span></div>}
                </div>
              ))}
            </div>

          </div>
        </div>
      </section>


      {/* ── BLOG SECTION ── */}
      <section id="blog" style={{ position:'relative', zIndex:10, padding:'72px 64px 80px', borderTop:'1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth:900, margin:'0 auto' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
            <span style={{ fontSize:13, color:'#a78bfa' }}>✦</span>
            <span style={{ fontSize:13, color:'#a78bfa', fontWeight:600, letterSpacing:'0.06em', textTransform:'uppercase' }}>From the blog</span>
          </div>
          <h2 style={{ fontSize:36, fontWeight:900, margin:'0 0 36px', letterSpacing:'-0.02em' }}>Hang out smarter.</h2>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:20 }}>
            {BLOG_POSTS.map((post, i) => (
              <div key={i}
                onClick={() => setOpenPost(post)}
                className={`reveal delay-${i+1}`}
                style={{ display:'flex', flexDirection:'column', gap:14, padding:'22px',
                  borderRadius:18, border:'1px solid rgba(255,255,255,.07)',
                  background:'rgba(255,255,255,.03)', cursor:'pointer',
                  transition:'border-color .2s, transform .2s, box-shadow .2s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(124,58,237,.4)'; e.currentTarget.style.transform='translateY(-5px)'; e.currentTarget.style.boxShadow='0 16px 40px rgba(124,58,237,.15)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor='rgba(255,255,255,.07)'; e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='none' }}>
                <div style={{ fontSize:32 }}>{post.emoji}</div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:10, fontWeight:700, color:'#a78bfa', background:'rgba(124,58,237,.15)', padding:'3px 10px', borderRadius:20, letterSpacing:'0.05em' }}>{post.tag}</span>
                  <span style={{ fontSize:11, color:'#4b5563' }}>{post.read} read</span>
                </div>
                <h3 style={{ fontSize:15, fontWeight:700, color:'white', margin:0, lineHeight:1.4 }}>{post.title}</h3>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:'auto' }}>
                  <span style={{ fontSize:11, color:'#4b5563' }}>{post.date}</span>
                  <span style={{ fontSize:11, color:'#7c3aed', display:'flex', alignItems:'center', gap:4 }}>Read <ArrowRight size={10}/></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BLOG MODAL ── */}
      {openPost && (
        <div onClick={() => setOpenPost(null)}
          style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,.78)',
            backdropFilter:'blur(14px)', display:'flex', alignItems:'center',
            justifyContent:'center', padding:'24px' }}>
          <div className="modal-card" onClick={e => e.stopPropagation()}
            style={{ background:'#0e0e28', border:'1px solid rgba(124,58,237,.3)',
              borderRadius:24, maxWidth:620, width:'100%', maxHeight:'82vh',
              overflowY:'auto', padding:'36px', position:'relative',
              boxShadow:'0 40px 100px rgba(0,0,0,.7), 0 0 60px rgba(124,58,237,.15)' }}>
            <button onClick={() => setOpenPost(null)}
              style={{ position:'absolute', top:18, right:18, background:'rgba(255,255,255,.08)',
                border:'none', color:'white', width:32, height:32, borderRadius:'50%',
                cursor:'pointer', fontSize:16, display:'flex', alignItems:'center',
                justifyContent:'center', fontFamily:'Outfit,sans-serif' }}>✕</button>
            <div style={{ fontSize:40, marginBottom:12 }}>{openPost.emoji}</div>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
              <span style={{ fontSize:10, fontWeight:700, color:'#a78bfa', background:'rgba(124,58,237,.15)', padding:'4px 12px', borderRadius:20, letterSpacing:'0.05em' }}>{openPost.tag}</span>
              <span style={{ fontSize:12, color:'#4b5563' }}>{openPost.date} · {openPost.read} read</span>
            </div>
            <h2 style={{ fontSize:24, fontWeight:900, lineHeight:1.25, margin:'0 0 24px', color:'white' }}>{openPost.title}</h2>
            <div style={{ height:1, background:'linear-gradient(to right,rgba(124,58,237,.5),transparent)', marginBottom:28 }} />
            <div style={{ display:'flex', flexDirection:'column', gap:22 }}>
              {openPost.content.map((block, i) => (
                <div key={i}>
                  <h3 style={{ fontSize:15, fontWeight:800, color:'#c4b5fd', margin:'0 0 8px' }}>{block.h}</h3>
                  <p style={{ fontSize:14, color:'#9ca3af', lineHeight:1.8, margin:0 }}>{block.p}</p>
                </div>
              ))}
            </div>
            <div style={{ marginTop:32, paddingTop:20, borderTop:'1px solid rgba(255,255,255,.06)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontSize:12, color:'#4b5563' }}>WatchyMe Blog</span>
              <SignUpButton mode="modal">
                <button className="btn-primary" style={{ display:'flex', alignItems:'center', gap:6, color:'white', border:'none', fontSize:12, fontWeight:700, padding:'8px 18px', borderRadius:50, cursor:'pointer', fontFamily:'Outfit,sans-serif' }}>
                  Try WatchyMe <ArrowRight size={12}/>
                </button>
              </SignUpButton>
            </div>
          </div>
        </div>
      )}


      {/* ── ABOUT SECTION ── */}
      <section id="about" style={{ position:'relative', zIndex:10, padding:'72px 64px 80px', borderTop:'1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth:900, margin:'0 auto', display:'flex', gap:64, alignItems:'center' }}>
          {/* Left */}
          <div style={{ flex:1 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
              <span style={{ fontSize:13, color:'#a78bfa' }}>✦</span>
              <span style={{ fontSize:13, color:'#a78bfa', fontWeight:600, letterSpacing:'0.06em', textTransform:'uppercase' }}>About</span>
            </div>
            <h2 style={{ fontSize:38, fontWeight:900, lineHeight:1.1, letterSpacing:'-0.02em', margin:'0 0 18px' }}>
              Built by one guy,<br />for <span className="grad-text">everyone.</span>
            </h2>
            <p style={{ color:'#6b7280', fontSize:14, lineHeight:1.75, margin:'0 0 14px' }}>
              Hey, I'm Ritwiz. WatchyMe started as a late-night idea — I wanted to watch movies with friends without juggling 5 different apps. So I just built it.
            </p>
            <p style={{ color:'#6b7280', fontSize:14, lineHeight:1.75, margin:'0 0 24px' }}>
              No subscriptions. No paywalls. Just a free, open space for your crew to hang out — online.
            </p>
            <div style={{ display:'flex', gap:28 }}>
              {[['12K+','Active users'],['50K+','Watch hours'],['100%','Free forever']].map(([num,label])=>(
                <div key={label}>
                  <div style={{ fontSize:24, fontWeight:900, color:'white', letterSpacing:'-0.02em' }}>{num}</div>
                  <div style={{ fontSize:12, color:'#6b7280', marginTop:2 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Right — founder card */}
          <div style={{ flexShrink:0, display:'flex', flexDirection:'column', alignItems:'center', gap:14 }}>
            <div style={{ padding:3, borderRadius:'50%', background:'linear-gradient(135deg,#7c3aed,#06b6d4)', boxShadow:'0 0 40px rgba(124,58,237,.4)' }}>
              <img src="/ritwiz_small.jpg" style={{ width:96, height:96, borderRadius:'50%', display:'block', border:'3px solid #080818', objectFit:'cover', objectPosition:'center top' }} />
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:18, fontWeight:900, color:'white', letterSpacing:'-0.01em' }}>Ritwiz</div>
              <div style={{ fontSize:12, color:'#a78bfa', marginTop:3 }}>Founder · Designer · Dev</div>
            </div>
            <div style={{ display:'flex', gap:8, marginTop:4 }}>
              {['🎬','💻','🎮','🚀'].map(e => (
                <div key={e} style={{ width:34, height:34, borderRadius:10, background:'rgba(124,58,237,.12)', border:'1px solid rgba(124,58,237,.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>{e}</div>
              ))}
            </div>
            <div style={{ fontSize:11, color:'#4b5563', marginTop:2 }}>built this solo ✦</div>
          </div>
        </div>
      </section>

      {/* PROFESSIONAL FOOTER */}
      <footer style={{ position:'relative', zIndex:10, borderTop:'1px solid rgba(255,255,255,.07)', padding:'40px 64px 28px', background:'rgba(0,0,0,.3)', backdropFilter:'blur(10px)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:32 }}>
          {/* Brand */}
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:34, height:34, borderRadius:'50%', background:'linear-gradient(135deg,#3b82f6,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:14 }}>W</div>
              <span style={{ fontSize:17, fontWeight:700 }}>watchy <span style={{ color:'#a78bfa' }}>me</span></span>
            </div>
            <p style={{ fontSize:13, color:'#6b7280', maxWidth:220, lineHeight:1.6, margin:0 }}>
              Watch together, feel together. The social streaming platform built for your crew.
            </p>
            <div style={{ display:'flex', gap:10 }}>
              {['𝕏','in','▶','📷'].map((icon,i) => (
                <div key={i} style={{ width:32, height:32, borderRadius:'50%', background:'rgba(255,255,255,.07)', border:'1px solid rgba(255,255,255,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, cursor:'pointer', transition:'background .2s' }}>
                  {icon}
                </div>
              ))}
            </div>
          </div>
          {/* Links */}
          {[
            { heading:'Product',  links:['Features','Changelog','Roadmap','Open Source'] },
            { heading:'Company',  links:['About','Blog','Careers','Press','Contact'] },
            { heading:'Support',  links:['Help Center','Community','Privacy','Terms','Status'] },
          ].map(col => (
            <div key={col.heading} style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <span style={{ fontSize:12, fontWeight:700, color:'white', letterSpacing:'0.06em', textTransform:'uppercase' }}>{col.heading}</span>
              {col.links.map(l => (
                <a key={l} href="#" style={{ fontSize:13, color:'#6b7280', textDecoration:'none', transition:'color .2s' }}
                  onMouseEnter={e=>e.target.style.color='#d1d5db'} onMouseLeave={e=>e.target.style.color='#6b7280'}>
                  {l}
                </a>
              ))}
            </div>
          ))}
        </div>
        <div style={{ borderTop:'1px solid rgba(255,255,255,.06)', paddingTop:20, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:12, color:'#4b5563' }}>© 2025 WatchyMe Inc. All rights reserved.</span>
          <div style={{ display:'flex', gap:20 }}>
            {['Privacy Policy','Terms of Service','Cookie Settings'].map(l => (
              <a key={l} href="#" style={{ fontSize:12, color:'#4b5563', textDecoration:'none' }}>{l}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}                      