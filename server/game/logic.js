/* ─────────────────────────────────────────────────────────────
   Game logic — Trivia · Rock-Paper-Scissors · Word Chain
───────────────────────────────────────────────────────────── */

// ── TRIVIA ────────────────────────────────────────────────────
const TRIVIA_BANK = [
  { q:'Which planet has the most moons?',              opts:['Jupiter','Saturn','Uranus','Neptune'],              ans:1 },
  { q:'What is the approximate speed of light?',       opts:['300,000 km/s','150,000 km/s','3,000 km/s','30,000 km/s'], ans:0 },
  { q:'Who painted the Mona Lisa?',                    opts:['Michelangelo','Raphael','Da Vinci','Botticelli'],   ans:2 },
  { q:'What year did the first iPhone launch?',        opts:['2005','2006','2007','2008'],                        ans:2 },
  { q:'Which language has the most native speakers?',  opts:['English','Spanish','Hindi','Mandarin'],             ans:3 },
  { q:'How many bones are in the adult human body?',   opts:['196','206','216','226'],                            ans:1 },
  { q:'Which element has the symbol Au?',              opts:['Silver','Platinum','Gold','Aluminum'],              ans:2 },
  { q:'What is the capital of Japan?',                 opts:['Osaka','Kyoto','Hiroshima','Tokyo'],                ans:3 },
  { q:'How many sides does a hexagon have?',           opts:['5','6','7','8'],                                    ans:1 },
  { q:'Who wrote "Romeo and Juliet"?',                 opts:['Dickens','Hemingway','Shakespeare','Austen'],       ans:2 },
]

// ── RPS ───────────────────────────────────────────────────────
const RPS_WINS = { rock:'scissors', paper:'rock', scissors:'paper' }
const WINS_TO_WIN = 3

// ── WORD CHAIN ────────────────────────────────────────────────
const BANNED_WORDS = new Set(['a','i','an','in','on','at','by','to','up'])

// ── DRAW & GUESS ──────────────────────────────────────────────
const DRAW_WORDS = [
  'Cat','Dog','House','Car','Tree','Pizza','Sun','Moon','Rocket','Guitar',
  'Castle','Dragon','Rainbow','Volcano','Unicorn','Robot','Dinosaur','Beach',
  'Mountain','Crown','Elephant','Banana','Bicycle','Snowman','Lighthouse',
  'Cactus','Butterfly','Submarine','Wizard','Panda','Penguin','Mushroom',
  'Fireworks','Treasure','Spaceship','Tornado','Jellyfish','Accordion','Igloo',
]

// ── factory ───────────────────────────────────────────────────
export function buildGame(type, playerIds) {
  const scores = Object.fromEntries(playerIds.map(id => [id, 0]))

  if (type === 'trivia') {
    const questions = shuffle(TRIVIA_BANK).slice(0, 5)
    return {
      type, phase: 'question', qIndex: 0, totalQ: questions.length,
      questions, current: questions[0],
      answers: {}, scores,
      startedAt: Date.now(), questionStartedAt: Date.now(),
    }
  }

  if (type === 'rps') {
    return { type, phase: 'choosing', choices: {}, scores, round: 1, maxScore: WINS_TO_WIN }
  }

  if (type === 'wordchain') {
    return {
      type, phase: 'playing',
      chain: [{ word:'Apple', playerId: null }],
      used: new Set(['apple']),
      scores, turn: playerIds[0], turnIndex: 0,
      players: playerIds,
    }
  }

  if (type === 'draw') {
    const words = shuffle([...DRAW_WORDS]).slice(0, playerIds.length * 3 + 5)
    return {
      type, phase: 'drawing',
      players: playerIds, drawerIndex: 0, drawer: playerIds[0],
      words, wordIndex: 0, word: words[0],
      guesses: [], correctGuessers: [],
      scores, round: 1, totalRounds: playerIds.length,
      timeLeft: 60,
    }
  }

  return { type, phase: 'playing', scores }
}

// ── apply action ──────────────────────────────────────────────
export function applyAction(game, socketId, payload) {
  if (game.type === 'trivia')    return triviaAction(game, socketId, payload)
  if (game.type === 'rps')       return rpsAction(game, socketId, payload)
  if (game.type === 'wordchain') return wordchainAction(game, socketId, payload)
  if (game.type === 'draw')      return drawAction(game, socketId, payload)
  return { ok: false, error: 'Unknown game type' }
}

export function advanceDrawRound(game) {
  game.drawerIndex++
  if (game.drawerIndex >= game.players.length) {
    game.phase = 'results'
    return
  }
  game.drawer = game.players[game.drawerIndex]
  game.wordIndex++
  game.word = game.words[game.wordIndex % game.words.length]
  game.guesses = []
  game.correctGuessers = []
  game.timeLeft = 60
  game.phase = 'drawing'
}

// ── trivia ────────────────────────────────────────────────────
function triviaAction(game, socketId, { answerIndex }) {
  if (game.phase !== 'question')       return { ok: false, error: 'Not in question phase' }
  if (game.answers[socketId] != null)  return { ok: false, error: 'Already answered' }

  const elapsed = (Date.now() - game.questionStartedAt) / 1000   // seconds
  const timeBonus = Math.max(0, Math.floor((15 - elapsed) * 20))
  const correct   = answerIndex === game.current.ans
  const points    = correct ? 100 + timeBonus : 0

  game.answers[socketId] = { index: answerIndex, correct, points }
  game.scores[socketId]  = (game.scores[socketId] || 0) + points

  const allAnswered = Object.keys(game.scores).every(id => game.answers[id] != null)
  if (allAnswered) advanceTrivia(game)

  return { ok: true }
}

function advanceTrivia(game) {
  if (game.qIndex < game.totalQ - 1) {
    game.qIndex++
    game.current           = game.questions[game.qIndex]
    game.answers           = {}
    game.phase             = 'question'
    game.questionStartedAt = Date.now()
  } else {
    game.phase = 'results'
  }
}

// server can call this to force-advance after timer expires
export function forceAdvanceTrivia(game) {
  const allIds = Object.keys(game.scores)
  allIds.forEach(id => {
    if (!game.answers[id]) game.answers[id] = { index: -1, correct: false, points: 0 }
  })
  advanceTrivia(game)
}

// ── rps ───────────────────────────────────────────────────────
function rpsAction(game, socketId, { choice }) {
  if (game.phase !== 'choosing')       return { ok: false, error: 'Not choosing phase' }
  if (!['rock','paper','scissors'].includes(choice)) return { ok: false, error: 'Invalid choice' }
  if (game.choices[socketId])          return { ok: false, error: 'Already chose' }

  game.choices[socketId] = choice

  const players = Object.keys(game.scores)
  if (!players.every(id => game.choices[id])) return { ok: true }  // waiting for others

  // resolve (only handles 2 players — extend for more later)
  const [a, b] = players
  const ca = game.choices[a], cb = game.choices[b]
  if      (RPS_WINS[ca] === cb) game.scores[a]++
  else if (RPS_WINS[cb] === ca) game.scores[b]++

  game.round++
  const winner = players.find(id => game.scores[id] >= WINS_TO_WIN)
  if (winner) {
    game.phase  = 'results'
    game.winner = winner
  } else {
    game.phase   = 'result'       // show last round result briefly
    game.choices = {}
    setTimeout(() => { game.phase = 'choosing' }, 2500)
  }

  return { ok: true }
}

// ── word chain ────────────────────────────────────────────────
function wordchainAction(game, socketId, { word }) {
  if (game.phase !== 'playing')             return { ok: false, error: 'Game not active' }
  if (game.turn !== socketId)               return { ok: false, error: 'Not your turn' }
  if (!word || typeof word !== 'string')    return { ok: false, error: 'Invalid word' }

  const clean = word.trim().toLowerCase()
  if (clean.length < 2)                     return { ok: false, error: 'Too short' }
  if (BANNED_WORDS.has(clean))              return { ok: false, error: 'Word not allowed' }

  const lastWord  = game.chain[game.chain.length - 1].word.toLowerCase()
  const required  = lastWord[lastWord.length - 1]
  if (clean[0] !== required)                return { ok: false, error: `Must start with "${required.toUpperCase()}"` }
  if (game.used.has(clean))                 return { ok: false, error: 'Already used' }

  game.chain.push({ word: word.trim(), playerId: socketId })
  game.used.add(clean)
  game.scores[socketId] = (game.scores[socketId] || 0) + 10

  // rotate turn
  game.turnIndex = (game.turnIndex + 1) % game.players.length
  game.turn       = game.players[game.turnIndex]

  return { ok: true }
}

// ── draw & guess ──────────────────────────────────────────────
function drawAction(game, socketId, { guess, playerName }) {
  if (game.phase !== 'drawing')             return { ok: false, error: 'Not drawing phase' }
  if (socketId === game.drawer)             return { ok: false, error: 'Drawer cannot guess' }
  if (game.correctGuessers.includes(socketId)) return { ok: false, error: 'Already guessed correctly' }

  const clean   = (guess || '').trim().toLowerCase()
  const correct = clean === game.word.toLowerCase()

  game.guesses.push({ socketId, name: playerName || socketId, word: guess, correct })

  if (correct) {
    game.correctGuessers.push(socketId)
    const order  = game.correctGuessers.length
    const points = Math.max(10, 120 - (order - 1) * 25)
    game.scores[socketId]   = (game.scores[socketId]   || 0) + points
    game.scores[game.drawer] = (game.scores[game.drawer] || 0) + 15

    // All non-drawers guessed correctly → end round early
    const nonDrawers = game.players.filter(id => id !== game.drawer)
    if (game.correctGuessers.length >= nonDrawers.length) {
      game.phase = 'reveal'
    }
  }

  return { ok: true, correct }
}

// ── util ──────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
