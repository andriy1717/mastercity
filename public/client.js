
const socket = io();
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

// Clean up notifications on socket reconnect
socket.on('connect', () => {
  // Will call forceCleanupAllNotifications once it's defined
  if (typeof forceCleanupAllNotifications === 'function') {
    forceCleanupAllNotifications();
  }
});

let ROOM=null, ME=null, COLOR="blue", PLAYERS={}, BUILDINGS={}, AGES=[], TRADE_PRICES=null;
let YOUR_TURN=false;
let SUPPRESS_LEAVE_PROMPT = false; // suppress beforeunload when true
const TRAIN_CONFIG = {
  Wood: { batchSize: 2, cost: { food: 25, coins: 5 } },
  Stone: { batchSize: 4, cost: { food: 50, coins: 10 } },
  Modern: { batchSize: 8, cost: { food: 100, coins: 25 } }
};
const RAID_MIN_COMMIT = 3;
let LAST_SEASON_SUMMARY = null;
let cachedSeasonLore = { season: null, lore: "" };

// Helper to get training config based on age
function getTrainingConfig(age) {
  return TRAIN_CONFIG[age] || TRAIN_CONFIG.Wood;
}

// Action overlay (slows down rapid-fire actions)
let ACTION_OVERLAY=null;
let ACTION_OVERLAY_MESSAGE=null;
let ACTION_OVERLAY_ACTIVE=false;
let ACTION_OVERLAY_TIMER=null;

function ensureActionOverlay(){
  if (ACTION_OVERLAY) return;
  const overlay=document.createElement('div');
  overlay.id='actionOverlay';
  overlay.innerHTML=`
    <div class="actionOverlayContent">
      <img class="actionOverlayImage" src="media/loading.gif" alt="Working">
      <div class="actionOverlayMessage">Working...</div>
    </div>
  `;
  document.body.appendChild(overlay);
  ACTION_OVERLAY=overlay;
  ACTION_OVERLAY_MESSAGE=overlay.querySelector('.actionOverlayMessage');
}
function hideActionOverlay(){
  if (!ACTION_OVERLAY) return;

  // Clear timeout
  if (ACTION_OVERLAY_TIMER){
    clearTimeout(ACTION_OVERLAY_TIMER);
    ACTION_OVERLAY_TIMER=null;
  }

  // Force immediate cleanup
  ACTION_OVERLAY.classList.remove('show');
  ACTION_OVERLAY_ACTIVE=false;

  // Force CSS reset to ensure no lingering state
  // This prevents the overlay from getting stuck in a half-visible state
  setTimeout(() => {
    if (ACTION_OVERLAY && !ACTION_OVERLAY.classList.contains('show')) {
      ACTION_OVERLAY.style.display = 'none';
      setTimeout(() => ACTION_OVERLAY.style.display = '', 10);
    }
  }, 300); // After transition completes
}
function performActionWithDelay(label, callback){
  ensureActionOverlay();
  if (!ACTION_OVERLAY) return false;
  if (ACTION_OVERLAY_ACTIVE){
    toast('Already working on the last action...');
    return false;
  }
  ACTION_OVERLAY_ACTIVE=true;
  if (ACTION_OVERLAY_MESSAGE) ACTION_OVERLAY_MESSAGE.textContent=label;
  ACTION_OVERLAY.classList.add('show');
  const delay=500 + Math.floor(Math.random()*500); // 0.5-1.0 seconds
  ACTION_OVERLAY_TIMER=setTimeout(()=>{
    ACTION_OVERLAY_TIMER=null;
    try{
      callback?.();
    }finally{
      hideActionOverlay();
    }
  }, delay);
  return true;
}

// Seasonal multiplier helpers (mirrors server defaults and display order)
const RESOURCE_DISPLAY_ORDER = ["food","wood","rock","metal"];
const RESOURCE_LABELS = { food:"Food", wood:"Wood", rock:"Rock", metal:"Metal" };

// Civilization bonuses (matches server.js CIVS)
const CIV_BONUSES = {
  Vikings: {
    yieldMult: { food: 1.20, wood: 0.95 },
    coinPerTurnDelta: 0,
    lore: "known for their exceptional hunting and fishing prowess"
  },
  Romans: {
    yieldMult: { rock: 1.15, metal: 0.90 },
    coinPerTurnDelta: 1,
    lore: "renowned for their masterful stonework and engineering, generating steady coin income from trade"
  },
  Mongols: {
    yieldMult: { metal: 1.10, rock: 0.90 },
    coinPerTurnDelta: 0,
    lore: "skilled metallurgists and fierce horse-mounted warriors"
  },
  Slavs: {
    yieldMult: { wood: 1.10, food: 1.10, metal: 0.85 },
    coinPerTurnDelta: -1,
    lore: "masters of the forest who excel at both woodworking and agriculture, though trade comes harder to them"
  }
};
const DEFAULT_SEASON_MULTIPLIERS = {
  Spring: { wood:1.0, rock:1.0, metal:1.0, food:1.0 },
  Summer: { wood:1.0, rock:1.0, metal:1.0, food:1.0 },
  Autumn: { wood:1.0, rock:1.0, metal:1.0, food:1.0 },
  Winter: { wood:1.0, rock:1.0, metal:1.0, food:1.0 }
};
// Season bonus lore descriptions
const SEASON_LORE = {
  food: {
    positive: ["Abundant harvest fills the granaries", "Fertile fields yield bountiful crops", "Livestock thrive in lush pastures", "Hunters return with plentiful game"],
    negative: ["Crop blight devastates the fields", "Harsh weather ruins harvests", "Livestock suffer from scarce fodder", "Wildlife retreats deep into wilderness"]
  },
  wood: {
    positive: ["Dense forests provide ample timber", "Fallen trees easy to harvest", "Woodcutters work with vigor", "River brings driftwood downstream"],
    negative: ["Terrible forest fire burns timber", "Floods sweep away felled logs", "Trees too wet to cut properly", "Woodlands depleted from overuse"]
  },
  rock: {
    positive: ["Quarries reveal rich stone veins", "Frost cracks expose quality stone", "Landslides uncover valuable deposits", "Clear weather aids quarry work"],
    negative: ["Quarries flooded by heavy rains", "Extreme heat makes mining dangerous", "Rock face collapses block extraction", "Ground too frozen to excavate"]
  },
  metal: {
    positive: ["New ore veins discovered in mines", "Perfect forging weather conditions", "Ancient cache of metal unearthed", "Smelters burn at peak efficiency"],
    negative: ["Mine shafts flood with water", "Forges struggle in humid air", "Ore deposits prove disappointing", "Equipment breaks down frequently"]
  }
};
const STORY_SCREENS = [
  "media/Story%20screen1.png",
  "media/Story%20screen2.png",
  "media/Story%20screen3.png"
];

const CIV_LORE_LIBRARY = {
  Romans: [
    "The Senate whispers that this border feud is but a rehearsal for something larger.",
    "Old legion standards are dusted off, their dyes freshened for a march meant to impress and intimidate.",
    "Merchants hedge their bets, trading with both camps and listening for which eagle soars highest.",
    "Engineers draft bridgeworks meant to cross not rivers, but the gulf between rival patrician houses.",
    "Each cohort drills to the cadence of clashing shields, praying Mars grants favor to their banner.",
    "Letters from home warn that the streets of Rome hum with rumor—civil blood is the city's favorite spectacle.",
    "Granaries are sealed and ledger tallies triple-checked; war without supply is a statue without pedestal.",
    "In marble atriums, patrons rehearse speeches to justify whatever fate their rivals meet."
  ],
  Vikings: [
    "Jarls toast to the coming battle, their horns brim with foam and vows.",
    "Longships lean at anchor, keels itching for the taste of a rival's shoreline.",
    "Runes are cast upon driftwood, seeking omens in the salt-scored grooves.",
    "Shieldmaidens braid their hair tight, murmuring promises to Freyja and the storm.",
    "Blacksmiths temper new axe heads in seawater, trapping the tide's fury in steel."
  ],
  Mongols: [
    "Scouts ride beyond the horizon, mapping every hidden spring and grazing plain.",
    "Bows are unstrung then restrung, sinew checked for the perfect snap of the horse archer's chorus.",
    "Campfires glow in flickering grids—the steppe turned into a strategist's board.",
    "Shamans knot blue scarves to lances, asking the Eternal Sky to watch the charge.",
    "Messenger falcons launch at dusk, each flight stitching the horde together overnight."
  ],
  Slavs: [
    "Forest spirits are appeased with honeyed bread left in mossy hollows.",
    "Communal forges burn through the night, hammering ploughshares back into spears.",
    "Grandmothers recite the Lay of Svetovid, weaving prophecy into every refrain.",
    "Snow-melt rivers carry messages carved on bark, warning allied villages to brace.",
    "Bee keepers gift wax-dipped icons to warriors, sealing courage with village prayers."
  ],
  default: [
    "Messengers sprint between camps, bearing sealed orders and unspoken doubts.",
    "The ground itself seems to listen, memorizing the weight of every marching step.",
    "Stars wheel overhead, ancient witnesses to yet another contest for fragile dominion.",
    "Somewhere beyond the clamour, builders quietly sketch monuments no victor has earned yet.",
    "Children gather rumors like river stones, polishing each tale until it gleams with myth.",
    "Archivists leave blank pages open, ready to ink whichever banner survives the night."
  ]
};
const CIV_COMBO_LORE = {
  "Romans|Romans": {
    media:"media/rvr.gif",
    lines:[
      "Twin eagles circle the same forum, each talon ready to clutch destiny for itself.",
      "Centurions speak in measured tones, masking the dread of facing their mirrored discipline.",
      "Spies trade tokens at moonlit baths, swapping secrets for promises of clemency.",
      "Every villa in Latium wagers on which heir will crown the fractured Republic anew.",
      "The Tiber bears witness as oath-bound brothers quietly paint over each other's heraldry.",
      "Torchlight parades blur into one another; Romans cheer unsure which consul they hail.",
      "Prophets mutter that Rome's greatest enemy wears a familiar face and laurel."
    ]
  },
  "Romans|Vikings": {
    lines:[
      "Viking longships nose upriver toward marble docks unused to foreign prows.",
      "Roman engineers blueprint firebreaks while skalds compose sagas of burning villas.",
      "Eagle standards glint against storm-dark sails, tradition bracing for the tide.",
      "Gifted interpreters barter mead for wine as both courts probe for weakness.",
      "Legion drums and war horns trade echoes across the mist-draped delta."
    ]
  },
  "Romans|Mongols": {
    lines:[
      "Praetorians trace cavalry arcs in sand, studying the dance of steppe riders.",
      "Envoys ride out with laurel and salt to test whether the Khan prefers treaty or conquest.",
      "Siege towers are reimagined as moving forts, poised to counter a nomad whirlwind.",
      "Mongol scouts pace the Appian roads, measuring how stone resists the hoofbeat.",
      "Two empires weigh law against mobility, each wondering whose order must bend."
    ]
  },
  "Romans|Slavs": {
    lines:[
      "Slavic woodsmen fell ancient oaks to build palisades against imperial roads.",
      "Roman jurists draft statutes for lands where folklore has long been law.",
      "Fireside councils debate whether Roman aqueducts are blessing or bridle.",
      "Legionaries swap mosaic tiles for carved icons as cultures test each other's faith.",
      "River barges carry both tribute and tales, each arrival blurring the frontier."
    ]
  },
  "Vikings|Mongols": {
    lines:[
      "Hooves and oars compete to see whose thunder reaches the horizon first.",
      "Khan and Jarl trade boasts beneath aurora-lit skies, wagering on raids yet sailed.",
      "Frost-cracked shields are reinforced with leather from distant steppes.",
      "Fireside wrestlers compare scars while scribes tally promises of shared plunder.",
      "Wind-carved dunes and frozen fjords echo with the same hunger for glory."
    ]
  },
  "Vikings|Slavs": {
    lines:[
      "Viking traders haggle for Slavic amber, each bead a token of tentative trust.",
      "Frozen rivers become highways where drakkars and sleds race toward battle.",
      "Shield walls learn to flex with veche lines, collective voices steering war.",
      "Bard and bylina intertwine, weaving sagas of storm gods and forest saints.",
      "Ale halls fill with debate: raid the granaries or feast as unlikely kin."
    ]
  },
  "Mongols|Slavs": {
    lines:[
      "Snow-muted steppes hide the rumble of approaching hoofbeats.",
      "Slavic fortresses adapt, their walls curved to deflect arrow storms.",
      "Mongol shamans and village wise women compare omens beneath the same constellations.",
      "Yurts and log houses form a wary ring, smoke mingling above uneasy allies.",
      "Fields are emptied in advance, forcing the riders to chase ghosts through birch and snow."
    ]
  }
};

function formatSeasonPercent(value){
  const rounded = Math.round(value * 100) / 100;
  const normalized = Math.abs(rounded) < 0.01 ? 0 : rounded;
  return normalized.toFixed(2).replace(/\.?0+$/,"");
}
// Cache for seasonal narrative (changed from just season to include bonuses)
let cachedSeasonalNarrative = { season: null, bonusesKey: null, narrative: "" };

function formatSeasonBenefits(season, seasonalMultipliers){
  if (!season) return { benefits: "", lore: "" };

  // Get all player info for narrative
  const playersList = Object.keys(PLAYERS || {}).map(pid => ({
    name: pid,
    civ: PLAYERS[pid]?.civ || 'Unknown'
  }));

  // Calculate effects
  const base = DEFAULT_SEASON_MULTIPLIERS[season] || {};
  const dynamic = (seasonalMultipliers && seasonalMultipliers[season]) || {};
  const combined = { ...base, ...dynamic };
  const effects = [];

  for (const key of RESOURCE_DISPLAY_ORDER){
    const mult = typeof combined[key] === "number" ? combined[key] : 1;
    const percent = (mult - 1) * 100;
    if (Math.abs(percent) >= 0.01) {
      effects.push({ key, percent, mult });
    }
  }

  // Get server-provided lore if available
  const serverLore = dynamic?.lore;

  // Create a unique key for this season's bonuses
  const bonusesKey = effects.map(e => `${e.key}:${e.percent.toFixed(2)}`).join('|');

  // Check if we need to regenerate narrative
  let narrative;
  if (cachedSeasonalNarrative.season === season && cachedSeasonalNarrative.bonusesKey === bonusesKey) {
    // Use cached narrative
    narrative = cachedSeasonalNarrative.narrative;
  } else {
    // Generate new narrative and cache it
    narrative = generateSeasonNarrative(season, effects, playersList, ROOM?.calendar, serverLore);
    cachedSeasonalNarrative = { season, bonusesKey, narrative };
  }

  return { benefits: "", lore: narrative };
}

function generateSeasonNarrative(season, effects, players, calendar, serverLore) {
  // Start with empty story (no date, it's shown above)
  let story = '';

  // Mention civilizations if we have players
  if (players.length > 0) {
    const civs = [...new Set(players.map(p => p.civ))];
    if (civs.length === 1) {
      const civName = civs[0];
      const civLore = CIV_BONUSES[civName]?.lore;
      story += `The ${civName} stood alone in these lands`;
      if (civLore) {
        story += `, ${civLore}`;
      }
      story += '. ';
    } else if (civs.length === 2) {
      story += `The ${civs[0]} and ${civs[1]} faced each other across these territories. `;
      // Add lore for each civ
      civs.forEach(civName => {
        const civLore = CIV_BONUSES[civName]?.lore;
        if (civLore) {
          story += `The ${civName} are ${civLore}. `;
        }
      });
    } else {
      const lastCiv = civs.pop();
      story += `The ${civs.join(', ')}, and ${lastCiv} all vied for supremacy. `;
      // Add lore for unique civs
      const allCivs = [...civs, lastCiv];
      allCivs.forEach(civName => {
        const civLore = CIV_BONUSES[civName]?.lore;
        if (civLore) {
          story += `The ${civName} are ${civLore}. `;
        }
      });
    }
  }

  // Describe seasonal effects narratively using server-provided lore
  if (serverLore) {
    // Use the server-provided lore messages (same for all players)
    const positiveLore = serverLore.positive;
    const negativeLore = serverLore.negative;

    if (positiveLore && negativeLore) {
      // Capitalize and format the positive effect
      let positiveMsg = positiveLore.message || '';
      if (positiveMsg) {
        positiveMsg = positiveMsg.charAt(0).toUpperCase() + positiveMsg.slice(1);
        story += positiveMsg;
      }

      // Add the negative effect
      let negativeMsg = negativeLore.message || '';
      if (negativeMsg) {
        story += '. ';
        negativeMsg = negativeMsg.charAt(0).toUpperCase() + negativeMsg.slice(1);
        story += negativeMsg;
      }
    }
  } else {
    // Fallback to old client-side generation if server lore not available
    if (effects.length === 0) {
      story += `The season brought balanced conditions for all resources`;
    } else {
      const positives = effects.filter(e => e.percent > 0).sort((a, b) => b.percent - a.percent);
      const negatives = effects.filter(e => e.percent < 0).sort((a, b) => a.percent - b.percent);

      // Positive effects
      if (positives.length > 0) {
        const descriptions = positives.map(e => describeResourceEffect(e.key, e.percent, true));
        // Capitalize first letter of first description
        const firstDesc = descriptions[0].charAt(0).toUpperCase() + descriptions[0].slice(1);
        descriptions[0] = firstDesc;
        story += descriptions.join(', ');
      }

      // Negative effects
      if (negatives.length > 0) {
        if (positives.length > 0) story += '. ';
        const descriptions = negatives.map(e => describeResourceEffect(e.key, e.percent, false));
        // Capitalize first letter of first description
        const firstDesc = descriptions[0].charAt(0).toUpperCase() + descriptions[0].slice(1);
        descriptions[0] = firstDesc;
        story += descriptions.join(', ');
      }
    }
  }

  return story.trim() + '.';
}

function describeResourceEffect(resourceKey, percent, isPositive) {
  const absPercent = Math.abs(percent);
  let intensity = '';

  if (absPercent < 35) intensity = 'moderately';
  else if (absPercent < 55) intensity = 'greatly';
  else intensity = 'extraordinarily';

  const resourceDescriptions = {
    food: {
      positive: [
        `the harvest was ${intensity} abundant`,
        `farmers rejoiced as crops grew ${intensity} well`,
        `the fields yielded ${intensity} more than expected`
      ],
      negative: [
        `the harvest suffered ${intensity}`,
        `crops withered ${intensity} in the fields`,
        `famine threatened as food production dropped ${intensity}`
      ]
    },
    wood: {
      positive: [
        `the forests provided ${intensity} more timber`,
        `woodcutters found ${intensity} richer groves`,
        `timber stocks grew ${intensity}`
      ],
      negative: [
        `timber became ${intensity} scarce`,
        `the forests yielded ${intensity} less wood`,
        `logging operations faced ${intensity} setbacks`
      ]
    },
    rock: {
      positive: [
        `quarries revealed ${intensity} richer veins of stone`,
        `stone extraction improved ${intensity}`,
        `miners uncovered ${intensity} more quality rock`
      ],
      negative: [
        `heavy rains flooded the quarries ${intensity}`,
        `stone production dropped ${intensity}`,
        `the mines had to close ${intensity} due to conditions`
      ]
    },
    metal: {
      positive: [
        `forges burned ${intensity} hotter`,
        `new ore deposits were discovered ${intensity} improving output`,
        `metal production soared ${intensity}`
      ],
      negative: [
        `the forges struggled ${intensity}`,
        `ore became ${intensity} harder to extract`,
        `metal production declined ${intensity}`
      ]
    }
  };

  const options = resourceDescriptions[resourceKey]?.[isPositive ? 'positive' : 'negative'] || ['conditions were unusual'];
  return options[Math.floor(Math.random() * options.length)];
}

function shuffleCopy(arr){
  const copy=arr.slice();
  for(let i=copy.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [copy[i],copy[j]]=[copy[j],copy[i]];
  }
  return copy;
}
function pickSnippets(pool, minCount, maxCount){
  if (!Array.isArray(pool) || !pool.length) return [];
  const count = Math.min(pool.length, minCount + Math.floor(Math.random()*((maxCount-minCount)+1)));
  return shuffleCopy(pool).slice(0, count);
}
function randomStoryScreen(){
  if (!STORY_SCREENS.length) return null;
  return STORY_SCREENS[Math.floor(Math.random()*STORY_SCREENS.length)];
}
function gatherLoreSegments(uniqCivs){
  const sortedKey = uniqCivs.slice().sort().join('|');
  const combo = CIV_COMBO_LORE[sortedKey];
  const segments=[];
  let media=combo?.media||randomStoryScreen();
  if (combo?.lines?.length){
    segments.push(...pickSnippets(combo.lines,1,1));
  }
  for (const civName of uniqCivs){
    const pool = CIV_LORE_LIBRARY[civName];
    if (pool?.length){
      segments.push(...pickSnippets(pool,1,1));
    }
  }
  if (!segments.length){
    segments.push(...pickSnippets(CIV_LORE_LIBRARY.default,1,1));
  }
  const trimmed = shuffleCopy(segments).slice(0,1);
  return { media, segments: trimmed };
}

// ===== Music/SFX toggles =====
let SFX_ON = true; // SFX on by default
let MUSIC_ON = true; // Music plays by default

// Music volume control (capped) - always 20%
const MUSIC_VOLUME_LEVELS = [0.2];
let musicVolumeIdx = 0;
function desiredMusicVolume(){ return 0.2; }

// Music and SFX toggle buttons
function updateMusicIcon() {
  const btn = document.getElementById('musicToggle');
  if (btn) btn.innerHTML = MUSIC_ON ? '🎵 <span class="controlLabel">Music</span>' : '🔇 <span class="controlLabel">Muted</span>';
}
function updateMusicVolumeIcon(){
  // Music volume button removed - always plays at 20%
}
function updateSfxIcon() {
  const btn = document.getElementById('sfxToggle');
  if (btn) btn.innerHTML = SFX_ON ? '🔔 <span class="controlLabel">SFX</span>' : '🔕 <span class="controlLabel">SFX Off</span>';
}

document.addEventListener('DOMContentLoaded', () => {
  const musicBtn = document.getElementById('musicToggle');
  const sfxBtn = document.getElementById('sfxToggle');

  if (musicBtn) {
    musicBtn.addEventListener('click', () => {
      MUSIC_ON = !MUSIC_ON;
      updateMusicIcon();
      if (!MUSIC_ON) {
        if (musicEl) musicEl.pause();
      } else {
        const age = PLAYERS[ME]?.age || lastAge;
        if (!musicEl) ensureMusic(age);
        lastAge = age || lastAge;
        if (lastAge) playAgeTrack(lastAge);
      }
    });
  }

  if (sfxBtn) {
    sfxBtn.addEventListener('click', () => {
      SFX_ON = !SFX_ON;
      updateSfxIcon();
      // Play a test sound when enabling
      if (SFX_ON) sfxTone(660, 0.05, 0.05);
    });
  }

  // Warn before unloading/closing the page unless explicitly exiting
  try{
    window.addEventListener('beforeunload', (e) => {
      if (SUPPRESS_LEAVE_PROMPT) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }catch(e){}

  // Set initial icons
  updateMusicIcon();
  updateSfxIcon();
  
  // Start lobby music immediately
  if (MUSIC_ON) {
    ensureMusic('Wood');
    playAgeTrack('Wood');
  }
});

// ===== Toast =====
let TOAST_TIMER = null;

function classifyToast(msg){
  const m = String(msg||'').toLowerCase();
  if (m.includes('good event') || m.includes('advanced to') || m.includes('critical success') || m.includes('saved') || m.includes('accepted')) return { kind:'good', icon:'✨' };
  if (m.includes('bad event') || m.includes('failed') || m.includes('not enough') || m.includes('cannot afford') || m.includes('not your turn') || m.includes('declined')) return { kind:'bad', icon:'⚠️' };
  if (m.includes('message sent') || m.includes('offer sent') ) return { kind:'info', icon:'📨' };
  if (m.includes('your turn ended')) return { kind:'info', icon:'⏭️' };
  return { kind:'info', icon:'ℹ️' };
}
function toast(msg, ms){
  const t=$("#toast"); if(!t) return;

  // Clear any existing timer to prevent overlapping toasts
  if (TOAST_TIMER) {
    clearTimeout(TOAST_TIMER);
    TOAST_TIMER = null;
  }

  const cls = classifyToast(msg);
  t.classList.remove('good','bad','warn','info');
  t.classList.add(cls.kind||'info');
  t.innerHTML = `<span class="icon">${cls.icon}</span><span class="txt">${msg}</span>`;
  t.classList.add("show");

  const duration = Math.max(1800, ms||3000);
  TOAST_TIMER = setTimeout(()=>{
    t.classList.remove("show");
    TOAST_TIMER = null;
  }, duration);
}

// Custom confirmation modal (replaces browser confirm dialog)
function showConfirm(message, title = 'Confirm Action') {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirmModal');
    const titleEl = document.getElementById('confirmTitle');
    const messageEl = document.getElementById('confirmMessage');
    const yesBtn = document.getElementById('confirmYes');
    const noBtn = document.getElementById('confirmNo');

    if (!modal || !titleEl || !messageEl || !yesBtn || !noBtn) {
      // Fallback to browser confirm if modal not found
      resolve(confirm(message));
      return;
    }

    titleEl.textContent = title;
    messageEl.textContent = message;

    const handleYes = () => {
      cleanup();
      resolve(true);
    };

    const handleNo = () => {
      cleanup();
      resolve(false);
    };

    const cleanup = () => {
      yesBtn.removeEventListener('click', handleYes);
      noBtn.removeEventListener('click', handleNo);
      modal.classList.add('hidden');
    };

    yesBtn.addEventListener('click', handleYes);
    noBtn.addEventListener('click', handleNo);

    modal.classList.remove('hidden');
  });
}

// ===== SFX (~50%) =====
const Actx = window.AudioContext || window.webkitAudioContext;
let audioCtx=null;
function sfxTone(freq=660, dur=0.05, vol=0.05) {
  if (!SFX_ON) return;
  if (!audioCtx) audioCtx=new Actx();
  const o=audioCtx.createOscillator(), g=audioCtx.createGain();
  o.type="sine"; o.frequency.value=freq; g.gain.value=vol;
  o.connect(g).connect(audioCtx.destination); o.start(); setTimeout(()=>o.stop(), dur*1000);
}
function sfxNoise(dur=0.08, vol=0.06) {
  if (!SFX_ON) return;
  if (!audioCtx) audioCtx=new Actx();
  const len=audioCtx.sampleRate*dur, buf=audioCtx.createBuffer(1,len,audioCtx.sampleRate);
  const data=buf.getChannelData(0); for(let i=0;i<len;i++) data[i]=Math.random()*2-1;
  const src=audioCtx.createBufferSource(); src.buffer=buf; const g=audioCtx.createGain(); g.gain.value=vol;
  src.connect(g).connect(audioCtx.destination); src.start();
}

// ===== War result modal (player wars) =====
function formatNumber(n){
  try{ return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }catch(e){ return String(n); }
}
function narrativeLosses(committed, casualties){
  const c = Math.max(0, Math.floor(casualties|0));
  const sent = Math.max(0, Math.floor(committed|0));
  let scale = 100; // default hundreds
  if (sent >= 15) scale = 1000; // thousands for very large armies
  else if (sent >= 6) scale = 100; // hundreds
  else scale = 50; // dozens for very small forces
  let approx = Math.max(0, c * scale);
  // round to nearest reasonable chunk
  const step = scale >= 1000 ? 100 : 50;
  approx = Math.round(approx / step) * step;
  return `≈${formatNumber(approx)} warriors`;
}
function showWarResult(evt){
  try{
    const modal = document.getElementById('raidNotificationModal');
    const img = document.getElementById('raidImage');
    const outcomeText = document.getElementById('raidOutcomeText');
    const details = document.getElementById('raidDetailsText');
    const target = document.getElementById('raidTargetPlayer');
    if (!modal) return;
    if (img) img.src = evt.image || '/media/Dispatched.png';
    if (outcomeText){
      outcomeText.textContent = evt.outcome === 'success' ? 'WAR SUCCESS' : 'WAR FAILED';
      outcomeText.parentElement.style.background = evt.outcome === 'success' ? 'linear-gradient(135deg,#16a34a,#166534)' : 'linear-gradient(135deg,#991b1b,#7f1d1d)';
    }
    if (target) target.textContent = `${evt.playerId} — ${evt.civ}`;
    const lootParts = Object.entries(evt.loot||{}).filter(([,v])=>v>0).map(([k,v])=>`${v} ${k}`);
    const lootStr = lootParts.length? `Loot: ${lootParts.join(', ')}` : 'No loot';
    const lossStr = (evt.casualties>0) ? `Losses: ${narrativeLosses(evt.committed||0, evt.casualties||0)}` : 'No losses';
    if (details) details.textContent = `${evt.lore || ''} ${lootStr}. ${lossStr}.`;
    modal.classList.remove('hidden');
    const closeBtn = document.getElementById('raidNotificationClose');
    if (closeBtn){ closeBtn.onclick = ()=> modal.classList.add('hidden'); }
  }catch(e){}
}

// Socket event for war results
socket.on('raidReturn', (evt)=>{ showWarResult(evt); });

// ===== Music per age =====
const MUSIC = { Wood:["wood1.mp3","wood2.mp3"], Stone:["stone1.mp3","stone2.mp3"], Modern:["modern1.mp3","modern2.mp3","modern3.mp3"] };
let musicEl=null, lastAge=null, audioCtxMusic=null, gainNodeMusic=null, sourceNodeMusic=null;
const MUSIC_VOLUME = 0.15; // 15% volume

function ensureMusic(age) {
  if (!MUSIC_ON) return;
  if (!musicEl) {
    // Create audio element
    musicEl = new Audio();
    musicEl.loop = false;
    musicEl.volume = MUSIC_VOLUME; // Set HTML5 volume too
    musicEl.addEventListener("ended", () => playAgeTrack(lastAge));
    
    // Create Web Audio API context and gain node
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtxMusic = new AudioContext();
      
      // Create source from audio element
      sourceNodeMusic = audioCtxMusic.createMediaElementSource(musicEl);
      
      // Create gain node and set to 20%
      gainNodeMusic = audioCtxMusic.createGain();
      gainNodeMusic.gain.value = MUSIC_VOLUME;
      
      // Connect: source -> gain -> destination
      sourceNodeMusic.connect(gainNodeMusic);
      gainNodeMusic.connect(audioCtxMusic.destination);
      
      console.log('🎵 Web Audio API initialized with gain:', gainNodeMusic.gain.value);
    } catch(e) {
      console.error('Failed to initialize Web Audio API:', e);
      // Fallback to regular volume control
      musicEl.volume = MUSIC_VOLUME;
    }
  }
  if (age && age !== lastAge) { lastAge = age; playAgeTrack(age); }
}

function playAgeTrack(age) {
  if (!MUSIC_ON) return;
  const list = MUSIC[age] || [];
  if (!list.length) return;
  const pick = list[Math.floor(Math.random() * list.length)];
  musicEl.src = `/music/${pick}`;
  
  // Set HTML5 volume directly (fallback)
  musicEl.volume = MUSIC_VOLUME;
  
  // Resume audio context if needed (required for some browsers)
  if (audioCtxMusic && audioCtxMusic.state === 'suspended') {
    audioCtxMusic.resume();
  }
  
  // Ensure gain is at 5%
  if (gainNodeMusic) {
    gainNodeMusic.gain.value = MUSIC_VOLUME;
    console.log('🎵 Playing with Web Audio API gain:', gainNodeMusic.gain.value);
  } else {
    console.warn('⚠️ Web Audio API not available, using HTML5 volume:', musicEl.volume);
  }
  
  musicEl.play().then(() => {
    musicEl.volume = MUSIC_VOLUME;
    console.log('🎵 After play - HTML5 volume:', musicEl.volume);
  }).catch(() => {});
}

// ===== Helpers =====

// Play vs AI setup (pre-room)
let PENDING_AI = [];
let aiSetupPending = false;

function openAiSetupModal(){
  PENDING_AI = [];
  const modal = document.getElementById('aiSetupModal');
  if (!modal) { toast('Setup UI missing.'); return; }
  renderAiList();
  modal.classList.remove('hidden');
}

function closeAiSetupModal(){
  const modal = document.getElementById('aiSetupModal');
  if (modal) modal.classList.add('hidden');
}

function renderAiList(){
  const list = document.getElementById('aiList');
  if (!list) return;
  if (!PENDING_AI.length){
    list.innerHTML = '<div class="muted">No AI added yet.</div>';
    return;
  }
  list.innerHTML = PENDING_AI.map((it,idx)=>{
    return `<div class="aiRow" style="display:flex; justify-content:space-between; align-items:center; padding:6px; border:1px solid rgba(255,255,255,0.15); border-radius:6px; margin-bottom:6px;">
      <div><strong>${it.civ}</strong> — <span>${it.color}</span></div>
      <button class="secondary" data-remove-ai="${idx}">Remove</button>
    </div>`;
  }).join('');
}

document.addEventListener('DOMContentLoaded', ()=>{
  const addBtn = document.getElementById('aiAddBtn');
  const startBtn = document.getElementById('aiStartBtn');
  const cancelBtn = document.getElementById('aiCancelBtn');
  const modal = document.getElementById('aiSetupModal');
  // Scope selects to the modal to avoid picking sidebar defaults with duplicate IDs
  const colorSel = modal ? modal.querySelector('#aiColor') : null;
  const civSel = modal ? modal.querySelector('#aiCiv') : null;

  if (addBtn) addBtn.addEventListener('click', ()=>{
    const color = colorSel?.value || 'gray';
    const civ = civSel?.value || 'Romans';
    PENDING_AI.push({ color, civ });
    renderAiList();
  });
  if (cancelBtn) cancelBtn.addEventListener('click', ()=>{ closeAiSetupModal(); });
  if (startBtn) startBtn.addEventListener('click', ()=>{
    aiSetupPending = true;
    closeAiSetupModal();
    // Now create room; AI additions will be sent after first roomUpdate where we are host
    joinOrCreate('create', true);
  });
  // Remove handlers via delegation
  document.addEventListener('click', (ev)=>{
    const btn = ev.target.closest && ev.target.closest('button[data-remove-ai]');
    if (btn){
      const idx = parseInt(btn.getAttribute('data-remove-ai'), 10);
      if (!isNaN(idx) && idx>=0 && idx<PENDING_AI.length){
        PENDING_AI.splice(idx,1);
        renderAiList();
      }
    }
  });
});

function setThemeByAge(age){
  const b=document.body;
  b.classList.remove("theme-wood","theme-stone","theme-modern");
  if(age==="Wood") b.classList.add("theme-wood");
  else if(age==="Stone") b.classList.add("theme-stone");
  else if(age==="Modern") b.classList.add("theme-modern");
}

function disableActions(disabled){
  $$(".actions button").forEach(b=>{
    // Skip train button - it has its own logic in updateUI
    if (b.id === 'trainBtn') return;
    b.disabled=disabled;
  });
}
const BUILD_ICONS = { Hut:"🛖", Sawmill:"🪓", Field:"🌾", Palisade:"🛡️", Market:"🏪",
                      Quarry:"🧱", Mill:"⚙️", Workshop:"🔧", Granary:"🏚️", StoneWall:"🧱",
                      Factory:"🏭", Greenhouse:"🏡", Bank:"🏦", PowerPlant:"⚡", Monument:"🗽" };
const COST_ICON = { wood:"🪵", rock:"🪨", metal:"⚙️", food:"🍞", coins:"💰" };

function chips(cost, me, enableHighlight = true){
  try{
    const res = me?.resources || {};
    return Object.entries(cost).map(([k,v])=>{
      const have = Math.max(0, res[k]|0);
      const ok = enableHighlight && (have >= (v|0));
      const cls = ok ? 'chip ok' : 'chip';
      return `<span class="${cls}" data-res="${k}">${COST_ICON[k]||""} ${v}</span>`;
    }).join("");
  }catch(e){
    return Object.entries(cost).map(([k,v])=>`<span class="chip">${COST_ICON[k]||""} ${v}</span>`).join("");
  }
}

function apFloat(delta){
  const apEl = $("#ap"); if(!apEl) return;
  const span = document.createElement("span");
  span.textContent = (delta>0?`+${delta}`:`${delta}`) + " Moves";
  span.style.position="fixed";
  const rect = apEl.getBoundingClientRect();
  span.style.left=(rect.left+10)+"px"; span.style.top=(rect.top-6)+"px";
  span.style.color= delta<0 ? "#a53b3b" : "#1bb56d"; span.style.fontWeight="800"; span.style.transition="all .8s ease"; span.style.opacity="1";
  document.body.appendChild(span);
  requestAnimationFrame(()=>{ span.style.top=(rect.top-28)+"px"; span.style.opacity="0"; });
  setTimeout(()=>span.remove(),900);
}

// ===== Build Grid =====
function buildCardHTML(name, def, me){
  const owned = !!me.structures[name];
  const lvl = owned ? (me.structures[name].level||1) : 0;
  const iconScale = owned ? (1 + (lvl-1)*0.05) : 1;
  const civ = (PLAYERS[ME]&&PLAYERS[ME].civ)||'Romans';
  const theme = (CIV_BUILD_THEME[civ] && CIV_BUILD_THEME[civ][name]) || null;
  const displayName = theme?.name || name;
  const icon = theme?.icon || BUILD_ICONS[name] || '🏠';

  // Add size prefix based on level
  let sizePrefix = '';
  if (owned) {
    if (lvl === 1) sizePrefix = 'Small ';
    else if (lvl === 2) sizePrefix = 'Medium ';
    else if (lvl === 3) sizePrefix = 'Large ';
  }
  const title = owned ? `${sizePrefix}${displayName}` : displayName;

  // Update description to show actual yield based on level (base + level bonus)
  let desc = def.desc || "";
  if (owned && lvl > 1) {
    // Calculate level bonus: Level 1 = +0, Level 2 = +1, Level 3 = +2
    const levelBonus = lvl - 1;
    // Update description to reflect actual yield with level bonus
    desc = desc.replace(/\+(\d+)\s+(Wood|Rock|Metal|Food|coins)/gi, (match, baseYield, resource) => {
      const actualYield = parseInt(baseYield) + levelBonus;
      return `+${actualYield} ${resource}`;
    });
  }

  // Disable build/upgrade for buildings not in current age
  const currentAge = me.age;
  let isCurrentAge = false;
  try{ for (const [age, defs] of Object.entries(BUILDINGS||{})){ if (defs && defs[name] && age===currentAge){ isCurrentAge=true; break; } } }catch(e){}

  // Hide upgrade button if building is at level 3 (max level)
  let upgradeBtn = '';
  if (owned && lvl < 3 && isCurrentAge) {
    upgradeBtn = `<button class="small" data-action="upgrade" data-name="${name}" data-ico="🔨">Upgrade</button>`;
  } else if (owned && lvl < 3 && !isCurrentAge) {
    upgradeBtn = `<button class="small" data-action="upgrade" data-name="${name}" data-ico="🔨" disabled title="Old age — cannot upgrade">Upgrade</button>`;
  }

  const buttons = owned
    ? upgradeBtn
    : `<button class="small ${canAfford(def.cost, me)?'available':'locked'}" data-action="build" data-name="${name}" data-ico="🔨" ${isCurrentAge?'':'disabled title="Old age — cannot build"'}>Build</button>`;

  return `
    <div class="bcard ${owned?'owned':''}">
      <div class="iconWrap" style="transform: scale(${iconScale.toFixed(2)});"><div class="icon">${icon}</div></div>
      <div class="meta">
        <div class="title">${title}</div>
        <div class="desc">${desc}</div>
        <div class=\"cost\">${chips(def.cost, me, !owned)}</div>
        <div class="actions">${buttons}</div>
      </div>
    </div>
  `;
}

function canAfford(cost, me){ return Object.keys(cost).every(k => (me.resources[k]||0) >= cost[k]); }

function renderBuildGrid(me){
  const grid = $("#buildGrid"); grid.innerHTML="";
  const age=me.age; const defs=BUILDINGS[age]||{};

  // Filter buildings based on visibleBuildings
  const visibleBuildings = me.visibleBuildings?.[age] || [];
  const entriesToShow = Object.entries(defs).filter(([name, def]) => {
    return visibleBuildings.includes(name);
  });

  // Sort Monument to the end if it's visible
  entriesToShow.sort(([nameA], [nameB]) => {
    if (nameA === 'Monument') return 1;
    if (nameB === 'Monument') return -1;
    return 0;
  });

  entriesToShow.forEach(([name,def])=>{
    const cardHTML = buildCardHTML(name,def,me);
    grid.insertAdjacentHTML("beforeend", cardHTML);
  });
}

// Update gather labels with yields
function updateGatherLabels(me){
  const bw=$('[data-action="gather-wood"]');
  if (bw) bw.innerHTML = `<span class="icon">🪓</span><span class="lbl">GATHER WOOD</span><span class="yieldBadge">+${me.stats.woodYield}</span>`;

  const br=$('[data-action="gather-rock"]');
  if (br) br.innerHTML = `<span class="icon">⛏️</span><span class="lbl">MINE ROCK</span><span class="yieldBadge">+${me.stats.rockYield}</span>`;

  const bm=$('[data-action="gather-metal"]');
  if (bm) bm.innerHTML = `<span class="icon">⚙️</span><span class="lbl">SALVAGE METAL</span><span class="yieldBadge">+${me.stats.metalYield}</span>`;

  const bf=$('[data-action="gather-food"]');
  if (bf) bf.innerHTML = `<span class="icon">🌾</span><span class="lbl">HARVEST FOOD</span><span class="yieldBadge">+${me.stats.foodYield}</span>`;

  // Update trade button with coin income
  const tb = document.getElementById('openTradeBtn');
  if (tb && typeof me.coinIncome === 'number') {
    tb.innerHTML = `<span class="icon">🤝</span><span class="lbl">TRADE</span><span class="yieldBadge">+${me.coinIncome}</span>`;
  }
}

function setSeasonTheme(season){
  const b=document.body;
  b.classList.remove("season-spring","season-summer","season-autumn","season-winter");
  if(season) b.classList.add(`season-${season.toLowerCase()}`);
}

// Map soldier count to descriptive army size by civ/age
function armyDescriptor(soldiers, age, civ){
  const n = Math.max(0, soldiers|0);
  const tiers = {
    Vikings: [ { t:2, name:'Small Band' }, { t:6, name:'Warband' }, { t:10, name:'Shieldwall' }, { t:15, name:'Great Host' } ],
    Romans:  [ { t:2, name:'Contubernium' }, { t:6, name:'Maniple' }, { t:10, name:'Cohort' }, { t:15, name:'Legion' } ],
    Mongols: [ { t:2, name:'Scout Pair' }, { t:6, name:'War Party' }, { t:10, name:'Tumen Wing' }, { t:15, name:'Great Horde' } ],
    Slavs:   [ { t:2, name:'Village Band' }, { t:6, name:'War Party' }, { t:10, name:'Shield Circle' }, { t:15, name:'Grand Host' } ]
  };
  const list = tiers[civ] || tiers.Romans;
  let label = 'No army';
  for (let i=list.length-1;i>=0;i--){ if (n>=list[i].t){ label = list[i].name; break; } }
  return label;
}

function clientBuildingEffect(name){
  try{
    for (const defs of Object.values(BUILDINGS||{})){
      if (defs && defs[name]) return defs[name].effect||{};
    }
  }catch(e){}
  return null;
}
function estimateWarChance(me, commit){
  const soldiers = Math.max(0, commit|0);
  let base = 0.08; // mirrors server tuning
  if (soldiers >= 15) base = 0.70; else if (soldiers >= 10) base = 0.55; else if (soldiers >= 6) base = 0.30;
  let bonus = 0;
  try{
    for (const [name, info] of Object.entries(me.structures||{})){
      const eff = clientBuildingEffect(name); if (!eff) continue;
      if (eff.raidPower){
        const lvl = (info&&info.level)||1;
        bonus += (eff.raidPower + (lvl-1)*0.01);
      }
    }
  }catch(e){}
  const chance = Math.max(0.05, Math.min(0.90, base + bonus));
  return chance;
}
function warChanceLabel(p){
  if (p >= 0.95) return 'Guaranteed success';
  if (p >= 0.85) return 'Very likely';
  if (p >= 0.65) return 'Likely';
  if (p >= 0.35) return 'Even odds';
  if (p >= 0.15) return 'Unlikely';
  return 'Very unlikely';
}

// Persist war-risk lore per player and success chance so it doesn't change every action
// Structure: { [playerId]: { lastChanceKey: string|null, lastBracket: string|null, indexByBracket: { [bracket]: number } } }
let WAR_LORE_STATE = {};

function getWarOutcomeLore(civ, successChance, playerId) {
  // War outcome lore messages based on civ and success chance
  const civLore = {
    Romans: {
      veryUnlikely: [
        "Roman scouts report overwhelming enemy forces ahead. The wise leader considers retreat...",
        "Your legions face an uncertain fate. The omens are poor for victory this day.",
        "Intelligence suggests a formidable foe awaits. Even Rome's greatest generals would pause."
      ],
      unlikely: [
        "The enemy prepares strong defenses. Your campaign will require careful planning.",
        "Reports suggest worthy adversaries. Victory is possible, but far from certain.",
        "The path to triumph is treacherous. Prepare yourself for a difficult struggle."
      ],
      moderate: [
        "Your forces are well-prepared, yet the outcome remains uncertain. This will be a true test.",
        "An evenly matched contest awaits. Victory depends on courage and cunning.",
        "The battle ahead will be fierce and costly. But fortune may smile upon the bold."
      ],
      likely: [
        "Your legions march with confidence! The enemy appears overmatched.",
        "Roman discipline and numbers favor your cause. Victory seems within reach.",
        "The odds turn in your favor. Strike now while momentum is on your side!"
      ],
      veryLikely: [
        "Your army is vastly superior! The enemy has no chance against your might.",
        "Destiny beckons! Your victory is nearly assured. March forth with pride!",
        "The enemy trembles before your power. This will be a swift and glorious victory!"
      ]
    },
    Vikings: {
      veryUnlikely: [
        "The skalds warn that this foe is like a stone—immovable and dreadful.",
        "Your warriors sense danger ahead. Even Odin's favor may not save you this day.",
        "Ancient spirits whisper warnings. The enemy's strength is legendary."
      ],
      unlikely: [
        "The enemy prepares their defenses with skill. Your raid faces great peril.",
        "Your scouts report a formidable foe. Caution is the wise path, friend.",
        "The runes suggest hardship ahead. This conquest will not come easily."
      ],
      moderate: [
        "The gods seem indifferent. Courage and steel will decide this battle!",
        "Your warriors hunger for glory, yet the enemy is no mere rabble.",
        "The outcome hangs in the balance. Only the boldest will claim victory."
      ],
      likely: [
        "Your raiders grow fierce and ready! The enemy falters before you.",
        "The gods smile upon your cause! Your army thirsts for enemy blood and gold.",
        "Fortune turns in your favor! Strike now and seize what is rightfully yours!"
      ],
      veryLikely: [
        "Your warriors are like a storm at sea—unstoppable and terrible!",
        "Victory is written in the stars! The enemy's doom is sealed!",
        "The fates decree your triumph! March forth to claim eternal glory!"
      ]
    },
    Mongols: {
      veryUnlikely: [
        "Your scouts bring dire news: the enemy is as numerous as grass on the steppe.",
        "The enemy's defenses are like mountains—solid and impenetrable.",
        "The winds carry whispers of defeat. Even the great khans would hesitate."
      ],
      unlikely: [
        "The enemy demonstrates cunning and strength. Your path to victory is uncertain.",
        "Your riders report prepared defenses. This will be a hard ride, friend.",
        "The steppe spirits speak of struggle. Caution is warranted before you charge."
      ],
      moderate: [
        "Your horses stamp with eagerness, yet the enemy is no coward's quarry.",
        "The battle will be swift or slow—only time will tell. Strike with courage!",
        "The outcome rests on speed and strength. Your cavalry has both!"
      ],
      likely: [
        "Your riders circle with confidence! The enemy cannot match your mobility.",
        "The steppe trembles beneath your hooves! The enemy is already broken.",
        "Your horde is mighty and swift! Victory is within your grasp!"
      ],
      veryLikely: [
        "Your cavalry is like a typhoon—swift, terrible, and unstoppable!",
        "The enemy's fate is sealed! Your riders will crush them utterly!",
        "The khan himself would envy your army! March forth to glorious conquest!"
      ]
    },
    Slavs: {
      veryUnlikely: [
        "The forest spirits warn of great danger ahead. Even their ancient power may not save you.",
        "Your people sense a mighty foe approaching. The gods seem distant and cold.",
        "Dark omens surround this path. Wise warriors choose to fight another day."
      ],
      unlikely: [
        "The enemy fortifies themselves well. This conquest will demand much sacrifice.",
        "Your people report a formidable adversary. Caution and wisdom suggest waiting.",
        "The frozen earth speaks of hardship ahead. Prepare for a bitter struggle."
      ],
      moderate: [
        "Your people gather their strength. The enemy is worthy, but not invincible.",
        "This will be a battle of endurance. Slavic stubbornness may yet prevail!",
        "The spirits are neutral. Victory will belong to the bravest heart."
      ],
      likely: [
        "Your warriors stand tall and ready! The enemy crumbles before your might.",
        "The forest itself seems to aid you! Your people are unstoppable!",
        "Your strength is beyond question! The enemy's defeat is nearly assured!"
      ],
      veryLikely: [
        "Your people are like the winter itself—harsh, enduring, and unbreakable!",
        "The gods favor your cause! Your victory will be swift and total!",
        "Destiny demands this conquest! March forth to eternal triumph!"
      ]
    }
  };

  // Determine bracket
  let bracket = 'moderate';
  if (successChance <= 0.15) {
    bracket = 'veryUnlikely';
  } else if (successChance <= 0.35) {
    bracket = 'unlikely';
  } else if (successChance <= 0.65) {
    bracket = 'moderate';
  } else if (successChance <= 0.80) {
    bracket = 'likely';
  } else {
    bracket = 'veryLikely';
  }

  const civLoreMessages = civLore[civ] || civLore.Romans;
  const messages = civLoreMessages[bracket] || civLoreMessages.moderate;

  // Stabilize by player and success percentage so it doesn't change every render
  const pid = playerId || ME || 'anonymous';
  const chanceKey = (successChance * 100).toFixed(2); // percent with 2 decimals
  let state = WAR_LORE_STATE[pid];
  if (!state) {
    state = { lastChanceKey: null, lastBracket: null, indexByBracket: {} };
    WAR_LORE_STATE[pid] = state;
  }

  // Initialize index for this bracket if missing with a random start
  if (typeof state.indexByBracket[bracket] !== 'number') {
    state.indexByBracket[bracket] = Math.floor(Math.random() * messages.length);
  }

  // On first encounter, don't advance; just show the initialized random message
  if (state.lastChanceKey === null) {
    state.lastChanceKey = chanceKey;
    state.lastBracket = bracket;
    const idx0 = state.indexByBracket[bracket] % messages.length;
    return messages[idx0];
  }

  // If success percentage changed, update displayed message deterministically
  if (state.lastChanceKey !== chanceKey) {
    if (state.lastBracket === bracket) {
      // Same bracket: rotate to next message in this bracket
      const next = (state.indexByBracket[bracket] + 1) % messages.length;
      state.indexByBracket[bracket] = next;
    } else {
      // Different bracket: if we've seen it before, advance; otherwise initialize to a random start
      if (typeof state.indexByBracket[bracket] === 'number') {
        state.indexByBracket[bracket] = (state.indexByBracket[bracket] + 1) % messages.length;
      } else {
        state.indexByBracket[bracket] = Math.floor(Math.random() * messages.length);
      }
    }
  }

  state.lastChanceKey = chanceKey;
  state.lastBracket = bracket;
  const idx = state.indexByBracket[bracket] % messages.length;
  return messages[idx];
}
function updateUI(){
  if(!ROOM||!ME) return;
  const me=PLAYERS[ME]; if(!me) return;
  setTint(me.color||"blue");
  setThemeByAge(me.age);
  setSeasonTheme(ROOM?.season);
  const rname=$('#roomName'); if (rname) rname.textContent = ROOM.code + (ROOM.active ? '' : ' (waiting…)');
  const calendar = ROOM?.calendar;
  const raidsUnlocked = true; // Raids are always available from year 1

  // Update season benefits box with calendar and narrative lore
  const sBenefits = document.getElementById('seasonBenefits');
  if (sBenefits && ROOM?.season && calendar) {
    const seasonData = formatSeasonBenefits(ROOM.season, ROOM.seasonalMultipliers);
    const loreText = seasonData.lore || 'The season passes quietly...';
    const dateString = calendar.dateString || 'Year 1, Month 1';

    console.log('📅 Calendar updated:', dateString, '| Month:', calendar.monthInYear, '| Day:', calendar.day, '| Season:', ROOM.season);

    sBenefits.innerHTML = `
      <div style="font-weight: 700; margin-bottom: 4px;">
        <span id="dateLine">${dateString}</span>
      </div>
      <div style="font-weight: 700; margin-bottom: 6px;">
        <span id="seasonName">${ROOM.season}</span> <span class="muted" id="seasonLeft"></span>
      </div>
      <div style="font-style: italic; opacity: 0.9; font-size: 15px; line-height: 1.6; padding: 10px; background: rgba(0,0,0,0.15); border-radius: 6px; border-left: 3px solid rgba(255,255,255,0.2);">
        ${loreText}
      </div>
    `;
  } else if (!calendar) {
    console.warn('⚠️ No calendar data in ROOM');
  }

  // Update season name next to Resource Management title
  const seasonDisplay = document.getElementById('seasonDisplay');
  if (seasonDisplay && ROOM?.season) {
    seasonDisplay.textContent = `- ${ROOM.season}`;
  }
  const attackLine = document.getElementById('attackChanceLine');
  if (attackLine){
    const lines = buildSeasonSummaryLines(LAST_SEASON_SUMMARY);
    let content = '';

    // Only show season summary (raid reports, truce messages) - no tribal raid chance
    if (lines.length > 0) {
      content += lines.map(line => `<span style="display: block; margin-top: 4px;">${line}</span>`).join('');
    }

    attackLine.innerHTML = content || '';
  }
  // Lobby banner + Ready button
  try{
    const banner = document.getElementById('statusBanner');
    const lobbyActions = document.getElementById('lobbyActions');
    const readyBtn = document.getElementById('readyBtn');
    if (banner && lobbyActions){
      if (!ROOM.active){
        const ids = Object.keys(PLAYERS||{});
        const have2 = ids.length>=2;
        const allReady = have2 && ids.every(id=>!!PLAYERS[id]?.ready);
        if (!have2) banner.textContent = 'Waiting for other players…';
        else if (!allReady) banner.textContent = 'Select Ready to begin.';
        else banner.textContent = 'All players ready — starting…';
        lobbyActions.style.display = '';
        if (readyBtn){
          const mineReady = !!(PLAYERS[ME]?.ready);
          readyBtn.textContent = mineReady? 'Not Ready':'Ready';
          readyBtn.disabled = false;
        }
      } else {
        banner.textContent=''; lobbyActions.style.display='none';
      }
    }
  }catch(e){}
  const soldierCount = Math.max(0, me.soldiers|0);
  const soldierCap = Math.max(0, me.soldierCap|0);
  const armySizeLabelEl = document.getElementById('armySizeLabel');
  if (armySizeLabelEl){
    armySizeLabelEl.textContent = armyDescriptor(soldierCount, me.age||'Wood', me.civ||'Romans');
  }
  const defencePct = Math.max(0, Math.min(100, Math.round(me.defense||0)));
  const raidActive = !!(me.raid?.active);
  const raidCommitted = raidActive ? (me.raid?.committed||0) : 0;
  const raidStatusDetail = raidActive ? `War in progress — forces are marching` : 'No war in progress.';

  // Update Army Command section only (removed duplicate sidebar stats)
  const armySoldiersEl = document.getElementById('armySoldiers');
  const armyCapEl = document.getElementById('armyCap');
  const armyDefenseEl = document.getElementById('armyDefense');
  const armyRaidStatusEl = document.getElementById('armyRaidStatus');

  // Show numeric soldiers/cap again
  if (armySoldiersEl) armySoldiersEl.textContent = soldierCount;
  if (armyCapEl) armyCapEl.textContent = soldierCap;
  if (armyDefenseEl) armyDefenseEl.textContent = `${defencePct}%`;
  if (armyRaidStatusEl) armyRaidStatusEl.textContent = raidStatusDetail;

  // Update dynamic soldier icon based on army size
  const soldierIconEl = document.getElementById('soldierIcon');
  const soldierLoreEl = document.getElementById('soldierLore');
  if (soldierIconEl && soldierLoreEl) {
    const armyRatio = soldierCap > 0 ? soldierCount / soldierCap : 0;

    if (soldierCount === 0) {
      soldierIconEl.textContent = '🏚️';
      soldierLoreEl.textContent = 'No warriors to defend your realm';
    } else if (armyRatio < 0.3) {
      soldierIconEl.textContent = '🛡️';
      soldierLoreEl.textContent = 'A small garrison mans the walls';
    } else if (armyRatio < 0.7) {
      soldierIconEl.textContent = '⚔️';
      soldierLoreEl.textContent = 'Your army grows in strength';
    } else {
      soldierIconEl.textContent = '👑';
      soldierLoreEl.textContent = 'A mighty host ready for battle';
    }
  }

  // Update defense lore based on defense percentage
  const defenseLoreEl = document.getElementById('defenseLore');
  if (defenseLoreEl) {
    if (defencePct < 10) {
      defenseLoreEl.textContent = 'Your borders lie vulnerable';
    } else if (defencePct < 30) {
      defenseLoreEl.textContent = 'Basic defenses in place';
    } else if (defencePct < 60) {
      defenseLoreEl.textContent = 'Sturdy fortifications protect you';
    } else if (defencePct < 90) {
      defenseLoreEl.textContent = 'Mighty walls guard your realm';
    } else {
      defenseLoreEl.textContent = 'Impenetrable fortress of legend';
    }
  }

  const armyHint = document.getElementById('armyHint');
  if (armyHint){
    const age = me?.age || 'Wood';
    const config = getTrainingConfig(age);
    armyHint.textContent = `Cost: ${config.cost.food} Food + ${config.cost.coins} Coins to train a Small Army (+${config.batchSize})`;
  }

  // Compact players list under Overview
  const mini=$('#playersMini');
  if (mini){
    const toRGB = (name)=>{
      try{ const r=COLOR_RGB[name]||COLOR_RGB[COLOR]||[31,95,184]; return `rgb(${r[0]},${r[1]},${r[2]})`; }catch(e){ return 'rgb(31,95,184)'; }
    };
    mini.innerHTML = Object.keys(PLAYERS).map(pid=>{
      const p=PLAYERS[pid];
      const turn = ROOM.turnOf===pid;
      const pct = Math.max(0, Math.min(100, p.progress||0));
      const pc = toRGB(p.color||'blue');
      const civIcon = CIV_PLAYER_ICON[p.civ] || '👤';
      const movesInline = '';
      const ageDisplay = p.age ? `Age: <strong>${p.age}</strong>` : '';

      // Only show military info for own player - hidden from others
      let militaryInfo = '';
      if (pid === ME && typeof p?.soldiers !== 'undefined') {
        const soldiers = Math.max(0, p?.soldiers|0);
        const cap = Math.max(0, p?.soldierCap|0);
        const defence = Math.max(0, Math.min(100, p?.defense||0));
        militaryInfo = ` &bull; Soldiers: <strong>${soldiers}/${cap}</strong> &bull; Defence: <strong>${defence}%</strong>`;
      }
      const canKick = ROOM?.host && ROOM.host===ME && pid!==ME;
      const kickBtn = canKick ? ` <button class=\"kickBtn\" data-kick=\"${pid}\" title=\"Kick player\">✖</button>` : '';

      return `<div class=\"p-item ${turn?'turn':''}\" style=\"--pc:${pc}\">\n        <div class=\"pnameRow\"><span class=\"dot\"></span><span class=\"civIcon\">${civIcon}</span><span class=\"name\">${pid}</span>${movesInline}${kickBtn}</div>\n        <div class=\"villRow\">${ageDisplay}${militaryInfo}</div>\n        <div class=\"progress mini\"><div class=\"fill\" style=\"width:${pct}%\"></div></div>\n      </div>`;
    }).join('');
  }
  // Visitor open button label
  { const btn=document.getElementById('openVisitBtn'); if (btn){ btn.textContent = VISIT_PENDING? 'Visitor pending…' : '🐪 Send a Visitor'; } }

  // Show visitor notification in inbox area (non-interactive, modal handles interaction)
  const inbox = document.getElementById('visitInbox');
  // (Visitor inbox removed - now uses immediate modal like trade offers)

  // Enable End Turn button
  const endBtn = document.querySelector('[data-action=\"endTurn\"]');
  const overlay = document.getElementById('endTurnOverlay');
  const overlayWrap = document.getElementById('endTurnOverlayWrap');
  const overlayBtn = document.getElementById('endTurnOverlayBtn');
  if (endBtn){
    const canEnd = (ROOM.active && ROOM.turnOf===ME);
    endBtn.disabled = !canEnd;
    endBtn.classList.toggle('inactive', !canEnd);
    try{
      const meNow = PLAYERS[ME];
      const apLeft = Math.max(0, meNow?.ap|0);
      if (canEnd) {
        const html = `END TURN <span class=\"movesNum\">${apLeft}</span> <span class=\"movesLabel\">Moves left</span>`;
        endBtn.innerHTML = html;
        endBtn.setAttribute('aria-label', `End Turn, ${apLeft} moves left`);
        if (overlayBtn) { overlayBtn.innerHTML = html; overlayBtn.classList.remove('inactive'); overlayBtn.disabled = false; }
      } else {
        const current = ROOM?.turnOf || 'Opponent';
        endBtn.textContent = `${current}'s Turn`;
        endBtn.setAttribute('aria-label', `${current}'s Turn`);
        if (overlayBtn) { overlayBtn.textContent = `${current}'s Turn`; overlayBtn.classList.add('inactive'); overlayBtn.disabled = true; }
      }
    }catch(e){}
  }
  try{ window.__refreshEndTurnOverlay && window.__refreshEndTurnOverlay(); }catch(e){}
  // Disable send in modal if not enough coins
  { const btn=document.getElementById('visitSendBtn'); if (btn){ const canAff = (PLAYERS[ME]?.resources.coins||0)>=5; btn.disabled = !canAff; } }
  // Update resource counts
  $("#wood").textContent = me.resources.wood;
  $("#rock").textContent = me.resources.rock;
  $("#metal").textContent = me.resources.metal;
  $("#food").textContent = me.resources.food;
  $("#coins").textContent = me.resources.coins;
  { const apEl = $("#ap"); if (apEl) apEl.textContent = me.ap; }

  renderBuildGrid(me);
  updateGatherLabels(me);

  const canAct = ROOM.active && (ROOM.turnOf===ME);
  disableActions(!canAct);

  // Add not-your-turn class to all building buttons when it's not player's turn
  document.querySelectorAll('#buildGrid button[data-action="build"], #buildGrid button[data-action="upgrade"]').forEach(btn => {
    if (!canAct) {
      btn.classList.add('not-your-turn');
    } else {
      btn.classList.remove('not-your-turn');
    }
  });
  ['gather-wood','gather-rock','gather-metal','gather-food'].forEach(a=>{
    const b = document.querySelector(`[data-action="${a}"]`);
    if (b) {
      b.disabled = !canAct;
      b.classList.toggle('not-your-turn', !canAct);
      const tile = b.closest('.resTile');
      if (tile) tile.classList.toggle('not-your-turn', !canAct);
    }
  });
  { const tb = document.getElementById('openTradeBtn'); if (tb) { tb.disabled = !canAct; tb.classList.toggle('not-your-turn', !canAct); const tile = tb.closest('.resTile'); if (tile) tile.classList.toggle('not-your-turn', !canAct); } }
  { const vb = document.getElementById('openVisitBtn'); if (vb) { vb.disabled = !canAct; vb.classList.toggle('not-your-turn', !canAct); } }
  const trainBtn = document.getElementById('trainBtn');
  if (trainBtn){
    const age = me?.age || 'Wood';
    const config = getTrainingConfig(age);
    const hasBarracks = !!(me.structures && me.structures.Barracks);
    const baseCanTrain = canAct && soldierCount < soldierCap && (me.resources.food||0) >= config.cost.food && (me.resources.coins||0) >= config.cost.coins;
    if (!hasBarracks){
      trainBtn.disabled = true;
      trainBtn.style.opacity = '0.6';
      trainBtn.style.filter = 'grayscale(0.7)';
      trainBtn.title = 'Build Barracks to unlock training';
      trainBtn.textContent = 'Build Barracks';
    } else if (raidActive){
      trainBtn.disabled = false;
      trainBtn.style.opacity = '0.6';
      trainBtn.style.filter = 'grayscale(0.7)';
      trainBtn.title = 'Your army is at war';
      trainBtn.textContent = 'Recruit Soldiers';
  } else {
      trainBtn.style.opacity = '';
      trainBtn.style.filter = '';
      trainBtn.title = '';
        trainBtn.disabled = !baseCanTrain;
      trainBtn.textContent = 'Recruit Soldiers';
}
  }
  const raidBtn = document.getElementById('raidBtn');
  if (raidBtn){
    const canRaid = canAct && !raidActive && soldierCount >= RAID_MIN_COMMIT;
    raidBtn.disabled = !canRaid;
    raidBtn.textContent = raidActive ? 'War In Progress' : 'Go To War';
    const riskEl = document.getElementById('warRiskLine');
    if (riskEl){
      if (raidActive){
        riskEl.textContent = 'At war — awaiting results';
      } else if (soldierCount < RAID_MIN_COMMIT){
        riskEl.textContent = `Need at least ${RAID_MIN_COMMIT} soldiers to go to war.`;
      } else {
        const chance = estimateWarChance(me, soldierCount);
        const lore = getWarOutcomeLore(me.civ, chance, ME);
        riskEl.innerHTML = `<em style="font-style: italic; opacity: 0.9;">${lore}</em>`;
      }
    }
  }
  // Mercenary hire availability
  const mercBtn = document.getElementById('triggerRaidBtn');
  if (mercBtn) {
    const canMerc = canAct && (me.resources.coins || 0) >= 20;
    mercBtn.disabled = !canMerc;
  }
  // Moved seasonReport display to Army Command section - see attackLine section above
  ensureMusic(me.age);
  // Set building age label
  try{ const ba=document.getElementById('buildAge'); if (ba) ba.textContent = me.age||'—'; }catch(e){}
  // Set army civilization label
  try{ const ac=document.getElementById('armyCiv'); if (ac) ac.textContent = me.civ||'—'; }catch(e){}
  // Toggle Next Age button visibility
  try{
    const btn=document.getElementById('advanceAgeBtn');
    if (btn){
      const idx = AGES.indexOf(me.age);
      // Count current age buildings owned
      const names = Object.keys((BUILDINGS[me.age]||{}));
      const have = names.filter(n=>!!me.structures[n]).length;

      // Age-specific building requirements:
      // Wood -> Stone: need 2 buildings
      // Stone -> Modern: need 3 buildings
      let required = 2;
      if (me.age === 'Stone') {
        required = 3;
      }

      const show = (ROOM?.active && ROOM?.turnOf===ME) && (idx>=0 && idx<AGES.length-1) && (have >= required);
      btn.style.display = show ? '' : 'none';
      btn.disabled = !show;
    }
  }catch(e){}
}

function formatBundleSummary(bundle){
  if (!bundle) return '';
  return Object.entries(bundle)
    .filter(([,val])=>val>0)
    .map(([key,val])=>`${val} ${key}`)
    .join(', ');
}
function buildSeasonSummaryLines(summary){
  if (!summary) return [];
  const lines=[];
  // Raids are now enabled from year 1, so no truce message needed
  const attacks=Array.isArray(summary.attackReports)?summary.attackReports:[];
  attacks.forEach(rep=>{
    const name = rep.playerId || 'Unknown';
    // Use lore if available, otherwise fall back to simple message
    if (rep.lore){
      let extra = '';
      if (Array.isArray(rep.collapsed) && rep.collapsed.length){
        extra += ` Buildings destroyed: ${rep.collapsed.join(', ')}.`;
      }
      const lootText = formatBundleSummary(rep.stolen);
      if (lootText){
        extra += ` Stolen: ${lootText}.`;
      }
      lines.push(`${name}: ${rep.lore}${extra}`);
    } else {
      // Fallback to old format
      const pct = Math.round((rep.attackStrength||0)*100);
      if (rep.outcome === 'defended'){
        lines.push(`${name} repelled raiders (${pct}% strength).`);
      } else {
        let extra = '';
        if (Array.isArray(rep.collapsed) && rep.collapsed.length){
          extra += ` Lost: ${rep.collapsed.join(', ')}.`;
        }
        const lootText = formatBundleSummary(rep.stolen);
        if (lootText){
          extra += ` Stolen: ${lootText}.`;
        }
        lines.push(`${name} was breached (${pct}% strength).${extra}`);
      }
    }
  });
  // Do not include player war results in this section anymore
  return lines;
}

let addAiPlayer = false;



$("#playVsAiBtn").addEventListener("click",()=>{
  addAiPlayer = true;
  openAiSetupModal();
});

function joinOrCreate(kind, playVsAi = false){
  const name=$("#playerName").value.trim()||`Player${Math.floor(Math.random()*90+10)}`;
  const codeInput=$("#roomCode").value.trim().toUpperCase();
  const color=$("#playerColor").value||"blue";
  const civ=$("#playerCiv") ? $("#playerCiv").value : "Romans";
  ME=name; COLOR=color; setTint(color);
  // Validate join requires a code; create may generate a random one on server when blank
  if (kind === 'join' && !codeInput){ toast('Enter Field Code to join.'); return; }
  const code = codeInput;

  // IMPORTANT: Reset the lore flag when joining/creating
  LORE_SHOWN = false;
  console.log('🔄 Resetting LORE_SHOWN to false');
  // Reset war lore cache so war-risk text starts fresh in new rooms
  WAR_LORE_STATE = {};
  console.log('🔄 Resetting WAR_LORE_STATE');

  if(kind==="create") {
    // For Play vs AI, send presetAIs to server to add before first room update
    const payload = addAiPlayer ? { code, playerId:name, color, civ, presetAIs: (Array.isArray(PENDING_AI)?PENDING_AI:[]) } : { code, playerId:name, color, civ };
    socket.emit("createRoom", payload);
  } else {
    socket.emit("joinRoom",{ code, playerId:name, color, civ });
  }
  $("#lobby").classList.add("hidden"); $("#game").classList.remove("hidden");
  sfxTone(500,0.05,0.05);
  // Prime lobby status immediately so player sees feedback while waiting on server
  const banner = document.getElementById('statusBanner');
  const lobbyActions = document.getElementById('lobbyActions');
  const readyBtn = document.getElementById('readyBtn');
  if (banner){ banner.textContent = kind==="create" ? 'Waiting for other players…' : 'Connecting to room…'; }
  if (lobbyActions){ lobbyActions.style.display=''; }
  if (readyBtn){ readyBtn.textContent='Ready'; readyBtn.disabled = true; }

  // Show lobby modal immediately for creator
  if (kind === "create" && !playVsAi) {
    setTimeout(() => {
      showLobbyModal(true); // Show waiting message for creator
    }, 100);
  }
}

function emitAction(action,payload){ if(!ROOM||!ME) return; socket.emit("performAction",{ code:ROOM.code, playerId:ME, action, payload }); }

// Delegated click handler
document.addEventListener("click",(ev)=>{
  // Kick button handler (host only)
  const kickBtn = ev.target.closest('button[data-kick]');
  if (kickBtn && ROOM && ROOM.host===ME){
    const target = kickBtn.getAttribute('data-kick');
    if (target){
      showConfirm(`Kick ${target} from the session?`, 'Confirm Kick').then(ok=>{
        if (ok){ socket.emit('kickPlayer', { code: ROOM.code, by: ME, target }); }
      });
    }
    return;
  }
  const btn=ev.target.closest("button[data-action]"); if(!btn) return;
  if(!(ROOM?.active && ROOM?.turnOf===ME)){ toast("Not your turn."); sfxTone(220,0.05,0.05); return; }
  const a=btn.dataset.action;
  if(a==="gather-wood"){
    if (!performActionWithDelay("Gathering Wood", ()=>{ emitAction("gather",{ type:"wood" }); apFloat(-1); sfxTone(500,0.04,0.05); })) return;
  }
  else if(a==="gather-rock"){
    if (!performActionWithDelay("Gathering Rock", ()=>{ emitAction("gather",{ type:"rock" }); apFloat(-1); sfxTone(500,0.04,0.05); })) return;
  }
  else if(a==="gather-metal"){
    if (!performActionWithDelay("Gathering Metal", ()=>{ emitAction("gather",{ type:"metal" }); apFloat(-1); sfxTone(500,0.04,0.05); })) return;
  }
  else if(a==="gather-food"){
    if (!performActionWithDelay("Gathering Food", ()=>{ emitAction("gather",{ type:"food" }); apFloat(-1); sfxTone(500,0.04,0.05); })) return;
  }
  else if(a==="endTurn"){
    // Animate transition to grayed out state
    const btnEl = document.querySelector('[data-action="endTurn"]');
    if (btnEl){ btnEl.classList.add('ending'); setTimeout(()=>btnEl.classList.remove('ending'), 350); }
    if (!performActionWithDelay('Ending Turn', ()=>{ emitAction('endTurn'); })) return;
  }
  else if(a==="build"){
    const me = PLAYERS[ME];
    if (!me) return;
    const name=btn.dataset.name;
    // Check if player can afford the building
    const age=me.age; const defs=BUILDINGS[age]||{};
    const buildingDef = defs[name];
    if (buildingDef && buildingDef.cost) {
      const cost = buildingDef.cost;
      const missing = [];
      for (const [resource, amount] of Object.entries(cost)) {
        const current = me.resources[resource] || 0;
        if (current < amount) {
          missing.push(`${resource}: need ${amount}, have ${current}`);
        }
      }
      if (missing.length > 0) {
        toast(`Cannot afford to build. ${missing.join(', ')}.`);
        sfxTone(220,0.05,0.05);
        return;
      }
    }
    if (!performActionWithDelay(name ? `Building ${name}` : "Building", ()=>{ emitAction("build",{ name }); apFloat(-1); sfxNoise(0.06,0.05); })) return;
  }
  else if(a==="upgrade"){
    const me = PLAYERS[ME];
    if (!me) return;
    const name=btn.dataset.name;
    // Check if player can afford the upgrade (costs 1 AP, but also check resources if needed)
    // For now, upgrades typically just cost 1 move, but we could add resource validation here too
    if (!performActionWithDelay(name ? `Upgrading ${name}` : "Upgrading", ()=>{ emitAction("upgrade",{ name }); apFloat(-1); sfxNoise(0.06,0.05); })) return;
  }
  else if(a==="train"){
    const me = PLAYERS[ME];
    if (!me) return;
    // Require Barracks
    if (!(me.structures && me.structures.Barracks)) { toast('Build Barracks to unlock training.'); sfxTone(220,0.05,0.05); return; }
    // Block training while army is at war
    if (me.raid?.active){ toast('Cannot train while your army is at war.'); sfxTone(220,0.05,0.05); return; }
    const soldierCount = Math.max(0, me.soldiers|0);
    const soldierCap = Math.max(0, me.soldierCap|0);
    const age = me.age || 'Wood';
    const config = getTrainingConfig(age);
    const foodNeeded = config.cost.food;
    const coinsNeeded = config.cost.coins;
    const batchSize = config.batchSize;
    const currentFood = me.resources.food || 0;
    const currentCoins = me.resources.coins || 0;
    // Validation checks
    if (soldierCount >= soldierCap) { toast('Cannot train more soldiers. Army is at capacity.'); sfxTone(220,0.05,0.05); return; }
    if (soldierCount + batchSize > soldierCap) { toast(`Not enough room. Training ${batchSize} soldiers would exceed capacity.`); sfxTone(220,0.05,0.05); return; }
    if (currentFood < foodNeeded) { toast(`Not enough food. Need ${foodNeeded}, have ${currentFood}.`); sfxTone(220,0.05,0.05); return; }
    if (currentCoins < coinsNeeded) { toast(`Not enough Golden Coins. Need ${coinsNeeded}, have ${currentCoins}.`); sfxTone(220,0.05,0.05); return; }
    if (!performActionWithDelay(`Training ${batchSize} Soldiers`, ()=>{ emitAction("train",{ batches:1 }); apFloat(-1); sfxNoise(0.08,0.05); })) return;
  }
  else if(a==="raid"){
    const me = PLAYERS[ME];
    if (!me) return;
    const soldierCount = Math.max(0, me.soldiers|0);
    const raidActive = !!(me.raid?.active);
    const ap = Math.max(0, me.ap|0);
    const commitVal = soldierCount; // send all

    if (raidActive) { toast('❌ You already went to war. Wait for results.'); sfxTone(220,0.05,0.05); return; }
    if (soldierCount < RAID_MIN_COMMIT) { toast(`❌ Not enough soldiers. Need at least ${RAID_MIN_COMMIT} to go to war.`); sfxTone(220,0.05,0.05); return; }
    if (ap < 1) { toast('❌ Not enough Moves. You need 1 Move to go to war.'); sfxTone(220,0.05,0.05); return; }

    if (!performActionWithDelay('Going To War', ()=>{ emitAction('raid',{ commit:commitVal }); apFloat(-1); sfxTone(620,0.06,0.05); })) return;
  }
  // old trade buttons removed
  else if(a==="skip"){
    if (!performActionWithDelay("Skipping Turn", ()=>{ emitAction("skip",{}); sfxTone(400,0.05,0.05); })) return;
  }
  else if(a==="endTurn"){
    if (!performActionWithDelay("Ending Turn", ()=>{ emitAction("endTurn",{}); sfxTone(320,0.05,0.05); })) return;
  }
});

// Sockets
// (roomUpdate handler moved below to avoid duplication)
socket.on("turnFlag", ({ yourTurn }) => { YOUR_TURN=!!yourTurn; updateUI(); });
socket.on("toast", ({ text }) => { toast(text); });
socket.on("gameOver", (gameStats) => {
  console.log('Game Over! Stats:', gameStats);
  showVictoryScreen(gameStats);
});

// Chat (old - kept for backwards compatibility if needed)
function renderChat(msgs){ const top6 = (msgs||[]).slice(0,6); const chatEl = $("#chat"); if (chatEl) chatEl.innerHTML=top6.map(m=>`<div><strong>${m.player}:</strong> ${m.text}</div>`).join(""); }

// Event Slider: Combined logs & chat
let EVENT_FEED_DATA = [];
const CHAT_SEEN_KEYS = new Set();

function chatMessageKey(msg){
  if (!msg) return "";
  const player = msg.player || "";
  const ts = msg.ts || 0;
  const text = msg.text || msg.message || "";
  return `${player}|${ts}|${text}`;
}

function formatEventTime(ts){
  if (!ts) return '';
  const now = Date.now();
  const diff = Math.floor((now - ts) / 1000); // seconds
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

function escapeHtml(str){
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderEventFeed(){
  const feed = $("#eventFeed");
  if (!feed) return;

  // Limit to last 20 events for performance
  const events = EVENT_FEED_DATA.slice(-20);

  if (!events.length){
    feed.innerHTML = '<div class="event-item event-info" style="text-align:center; opacity:0.6;">No events yet...</div>';
    return;
  }

  feed.innerHTML = events.map(evt => {
    let typeClass = 'event-info';
    let playerName = '';
    let text = evt.text || evt.message || '';
    let playerColor = '';

    // Determine event type styling
    if (evt.personal){
      typeClass = 'event-personal';
      playerName = 'You';
      if (evt.type) typeClass = `event-${evt.type}`;
    } else if (evt.game){
      typeClass = 'event-game';
      if (evt.type) typeClass = `event-${evt.type}`;
    } else if (evt.player){
      // Chat message
      typeClass = 'event-chat';
      playerName = evt.player;

      // Get player color
      if (PLAYERS && PLAYERS[playerName]) {
        const color = PLAYERS[playerName].color || 'blue';
        const rgb = COLOR_RGB[color] || [31,95,184];
        playerColor = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      }
    }

    const timeStr = formatEventTime(evt.ts);
    const playerStyle = playerColor ? `style="color: ${playerColor};"` : '';

    const safePlayerName = escapeHtml(playerName);
    const safeText = escapeHtml(text).replace(/\n/g, '<br>');
    const imageHtml = evt.image ? `<div class="event-image-wrap"><img src="${escapeHtml(evt.image)}" alt="Event image"></div>` : '';

    return `
      <div class="event-item ${typeClass}">
        <div class="event-header">
          ${playerName ? `<span class="event-player" ${playerStyle}>${safePlayerName}</span>` : ''}
          ${timeStr ? `<span class="event-time">${timeStr}</span>` : ''}
        </div>
        <div class="event-text">${safeText}</div>
        ${imageHtml}
      </div>
    `;
  }).join('');

  const aiLog = $("#aiLog");
  if (aiLog) {
    const aiEvents = EVENT_FEED_DATA.filter(evt => evt.type === 'ai');
    if (aiEvents.length > 0) {
      aiLog.innerHTML = aiEvents.map(evt => {
        return `<div class="event-item event-info">${evt.text}</div>`;
      }).join('');
    }
  }
}

function addEventToFeed(event){
  EVENT_FEED_DATA.push(event);
  if (EVENT_FEED_DATA.length > 50) EVENT_FEED_DATA.shift(); // Keep max 50 events
  renderEventFeed();
}

function mergeEvents(personalLog, gameLog, chat){
  const combined = [];
  CHAT_SEEN_KEYS.clear();

  // Add personal log events
  if (Array.isArray(personalLog)){
    personalLog.forEach(log => combined.push({ ...log, ts: log.ts || Date.now() }));
  }

  // Add game log events
  if (Array.isArray(gameLog)){
    gameLog.forEach(log => combined.push({ ...log, ts: log.ts || Date.now() }));
  }

  // Add chat messages
  if (Array.isArray(chat)){
    chat.forEach(msg => {
      const normalized = { ...msg, ts: msg.ts || Date.now() };
      combined.push(normalized);
      const key = chatMessageKey(normalized);
      if (key) CHAT_SEEN_KEYS.add(key);
    });
  }

  // Sort by timestamp (oldest first)
  combined.sort((a, b) => (a.ts || 0) - (b.ts || 0));

  EVENT_FEED_DATA = combined;
  renderEventFeed();
}

// Event slider toggle
const eventSliderToggle = $("#eventSliderToggle");
const eventSlider = $("#eventSlider");
if (eventSliderToggle && eventSlider){
  eventSliderToggle.addEventListener("click", () => {
    eventSlider.classList.toggle("collapsed");
  });
}

// Event slider header click to toggle
const eventSliderHeader = document.querySelector(".event-slider-header");
if (eventSliderHeader){
  eventSliderHeader.addEventListener("click", () => {
    const slider = $("#eventSlider");
    if (slider) slider.classList.toggle("collapsed");
  });
}

// Event chat input
const eventChatInput = $("#eventChatInput");
const eventChatSend = $("#eventChatSend");
if (eventChatInput && eventChatSend){
  // Send on button click
  eventChatSend.addEventListener("click", () => {
    const text = eventChatInput.value.trim();
    if (!text || !ROOM || !ME) return;
    socket.emit("chat", { code: ROOM.code, playerId: ME, message: text });
    eventChatInput.value = "";
    sfxTone(750, 0.05, 0.05);
  });

  // Send on Enter key (without Shift)
  eventChatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey){
      e.preventDefault();
      const text = eventChatInput.value.trim();
      if (!text || !ROOM || !ME) return;
      socket.emit("chat", { code: ROOM.code, playerId: ME, message: text });
      eventChatInput.value = "";
      sfxTone(750, 0.05, 0.05);
    }
  });
}

socket.on("chatUpdate", (msgs) => {
  renderChat(msgs); // Keep old chat working if still in HTML
  // Chat updates are now handled by roomUpdate merging

  // Auto-scroll to bottom when new messages arrive
  const feed = $("#eventFeed");
  if (feed) {
    feed.scrollTop = feed.scrollHeight;
  }
});

// Handle incoming chat messages with modal
let chatModalTimeout = null;
socket.on("chatMessageReceived", (msg) => {
  try {
    // Add to event feed
    const normalized = { ...msg, ts: msg.ts || Date.now() };
    const key = chatMessageKey(normalized);
    if (key && !CHAT_SEEN_KEYS.has(key)) {
      CHAT_SEEN_KEYS.add(key);
      addEventToFeed(normalized);
    }

    // Auto-scroll to bottom
    const feed = $("#eventFeed");
    if (feed) {
      feed.scrollTop = feed.scrollHeight;
    }

    // Show modal with message
    const modal = $("#chatMessageModal");
    const playerEl = $("#chatMessagePlayer");
    const textEl = $("#chatMessageText");

    if (modal && playerEl && textEl) {
      // Clear any existing timeout BEFORE updating content
      if (chatModalTimeout) {
        clearTimeout(chatModalTimeout);
        chatModalTimeout = null;
      }

      const modalPlayerName = msg.player || 'Dispatch';
      playerEl.textContent = modalPlayerName;

      // Apply player color
      if (PLAYERS && msg.player && PLAYERS[msg.player]) {
        const color = PLAYERS[msg.player].color || 'blue';
        const rgb = COLOR_RGB[color] || [31,95,184];
        playerEl.style.color = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      } else {
        playerEl.style.color = '#facc15';
      }

      const imageWrap = $("#chatMessageImageWrap");
      const imageEl = $("#chatMessageImage");
      if (imageWrap && imageEl) {
        if (msg.image) {
          imageEl.src = msg.image;
          imageWrap.classList.remove("hidden");
        } else {
          imageWrap.classList.add("hidden");
        }
      }

      textEl.textContent = msg.text || '';
      modal.classList.remove("hidden");

      // Play sound
      sfxTone(900, 0.05, 0.06);

      // Auto-close after 4 seconds (fixed to match documentation)
      chatModalTimeout = setTimeout(() => {
        modal.classList.add("hidden");
        chatModalTimeout = null;
      }, 4000);
    }
  } catch(e) {
    console.error("Error handling chat message:", e);
  }
});

// Chat message modal close button
const chatMessageClose = $("#chatMessageClose");
if (chatMessageClose) {
  chatMessageClose.addEventListener("click", () => {
    const modal = $("#chatMessageModal");
    if (modal) modal.classList.add("hidden");

    // Clear auto-close timeout if user manually closes
    if (chatModalTimeout) {
      clearTimeout(chatModalTimeout);
      chatModalTimeout = null;
    }
  });
}

// ===== Global Notification Cleanup Function =====
// Emergency cleanup function - call on critical errors or stuck modals
function forceCleanupAllNotifications() {
  try {
    // Clear toast
    const toast = $("#toast");
    if (toast) {
      toast.classList.remove("show");
    }
    if (TOAST_TIMER) {
      clearTimeout(TOAST_TIMER);
      TOAST_TIMER = null;
    }

    // Clear action overlay
    hideActionOverlay();

    // Clear chat modal
    const chatModal = $("#chatMessageModal");
    if (chatModal) chatModal.classList.add("hidden");
    if (chatModalTimeout) {
      clearTimeout(chatModalTimeout);
      chatModalTimeout = null;
    }

    // Clear all non-blocking modals
    const allModals = document.querySelectorAll('.modal:not(#visitorDecisionModal)');
    allModals.forEach(m => {
      if (!m.classList.contains('hidden')) {
        m.classList.add('hidden');
      }
    });
  } catch(e) {
    console.error("Error in forceCleanupAllNotifications:", e);
  }
}

// ===== Global Escape Key Handler =====
// Close modals with Escape key (accessibility & mobile fix)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    // Close chat modal
    const chatModal = $("#chatMessageModal");
    if (chatModal && !chatModal.classList.contains('hidden')) {
      chatModal.classList.add('hidden');
      if (chatModalTimeout) {
        clearTimeout(chatModalTimeout);
        chatModalTimeout = null;
      }
      return;
    }

    // Close any other visible modals (except blocking ones)
    const allModals = document.querySelectorAll('.modal:not(.hidden)');
    allModals.forEach(modal => {
      // Don't close blocking modals (visitor decision)
      if (modal.id !== 'visitorDecisionModal') {
        modal.classList.add('hidden');
      }
    });
  }
});

// ===== Modal Background Click Handler =====
// Close non-blocking modals when clicking background
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal')) {
    // Only close non-blocking modals
    if (e.target.id === 'chatMessageModal') {
      e.target.classList.add('hidden');
      if (chatModalTimeout) {
        clearTimeout(chatModalTimeout);
        chatModalTimeout = null;
      }
    } else if (e.target.id === 'storyModal' || e.target.id === 'lobbyModal') {
      // Allow closing these modals by clicking background
      e.target.classList.add('hidden');
    }
    // Don't close trade modal or visitor decision modal (they require explicit action)
  }
});

// Lobby buttons
$("#createBtn").addEventListener("click",()=>joinOrCreate("create"));
$("#joinBtn").addEventListener("click",()=>joinOrCreate("join"));


// Mobile affix for End Turn button
(function setupEndTurnAffix(){
  let inited = false;
  const mql = window.matchMedia('(max-width: 768px)');
  let container = null;
  const overlay = document.getElementById('endTurnOverlay');
  const overlayWrap = document.getElementById('endTurnOverlayWrap');
  const overlayBtn = document.getElementById('endTurnOverlayBtn');

  function syncOverlayToContainer(){
    if (!container || !overlay || !overlayWrap) return;
    const rect = container.getBoundingClientRect();
    overlayWrap.style.left = rect.left + 'px';
    overlayWrap.style.width = rect.width + 'px';
    try{
      const h = (document.getElementById('endTurnOverlayBtn')?.offsetHeight||0);
      if (h>0) overlay.style.height = h + 'px';
    }catch(e){}
  }
  function onScroll(){
    if (!container) return;
    if (!mql.matches) {
      overlay && (overlay.style.display = 'none');
      container && (container.style.visibility = '');
      return;
    }
    // Decide based on live position, no stored offsets
    const rect = container.getBoundingClientRect();
    if (rect.top <= 0) {
      syncOverlayToContainer();
      overlay.style.display = 'block';
      container.style.visibility = 'hidden';
    } else {
      overlay.style.display = 'none';
      container.style.visibility = '';
    }
  }
  function onResize(){ syncOverlayToContainer(); onScroll(); }

  function init(){
    container = document.querySelector('.sidebarTurn');
    if (!container) return;
    if (!inited){
      window.addEventListener('scroll', onScroll, { passive:true });
      window.addEventListener('resize', onResize);
      mql.addEventListener?.('change', onResize);
      if (overlayBtn){
        overlayBtn.addEventListener('click', ()=>{
          const canEnd = ROOM?.active && ROOM?.turnOf===ME;
          if (!canEnd) return;
          overlayBtn.classList.add('ending'); setTimeout(()=>overlayBtn.classList.remove('ending'), 350);
          if (!performActionWithDelay('Ending Turn', ()=>{ emitAction('endTurn'); })) return;
        });
      }
      inited = true;
    }
    syncOverlayToContainer();
    onScroll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  window.__refreshEndTurnOverlay = () => { try{ init(); }catch(e){} };
  const origJoin = joinOrCreate;
  joinOrCreate = function(kind, playVsAi=false){
    origJoin(kind, playVsAi);
    setTimeout(()=>{ init(); }, 200);
  };
})();



// === Injected enhancements (v8-b) ===

// Map color names to RGB for overlays
const COLOR_RGB = {
  blue:[31,95,184], red:[199,54,54], green:[27,181,109], yellow:[198,160,31], purple:[123,63,184],
  orange:[217,122,23], teal:[26,163,156], pink:[195,52,123], cyan:[26,163,217], gray:[107,114,128]
};

// Strengthen theme: apply player tint class broadly
function setTint(color){
  COLOR = color || COLOR;
  document.body.classList.remove("tint-blue","tint-red","tint-green","tint-yellow","tint-purple","tint-orange","tint-tint-pink","tint-cyan","tint-gray");
  document.body.classList.add(`tint-${COLOR}`);

  // Apply colored borders to main sections
  applyPlayerColorBorders(color);
}

function applyPlayerColorBorders(color){
  const rgb = COLOR_RGB[color] || [31,95,184];
  const glow = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.28)`;
  const outline = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.6)`;

  // Resource Management card glow
  const resourceStats = document.getElementById('resourceStats');
  if (resourceStats) {
    resourceStats.style.border = '1px solid rgba(255,255,255,0.08)';
    resourceStats.style.borderRadius = '6px';
    resourceStats.style.padding = '8px';
    resourceStats.style.boxShadow = `0 0 0 1px ${outline}, 0 0 14px ${glow}`;
  }

  // Building Management card glow
  const buildGrid = document.getElementById('buildGrid');
  if (buildGrid) {
    buildGrid.style.border = '1px solid rgba(255,255,255,0.08)';
    buildGrid.style.borderRadius = '6px';
    buildGrid.style.padding = '8px';
    buildGrid.style.boxShadow = `0 0 0 1px ${outline}, 0 0 14px ${glow}`;
  }

  // Army Command card glow
  const armyStats = document.getElementById('armyStats');
  if (armyStats) {
    armyStats.style.border = '1px solid rgba(255,255,255,0.08)';
    armyStats.style.borderRadius = '6px';
    armyStats.style.padding = '8px';
    armyStats.style.boxShadow = `0 0 0 1px ${outline}, 0 0 14px ${glow}`;
  }
}

// Override renderChat sound for incoming messages
socket.off("chatUpdate");
socket.on("chatUpdate", (msgs)=>{
  try{
    const latest = (msgs||[])[0];
    if (latest && latest.player && latest.player!==ME) { sfxTone(900,0.05,0.06); }
  }catch(e){}
  try{
    renderChat(msgs);
  }catch(e){}
  try{
    if (Array.isArray(msgs)){
      const ordered = [...msgs].reverse();
      ordered.forEach(rawMsg => {
        const normalized = { ...rawMsg, ts: rawMsg.ts || Date.now() };
        const key = chatMessageKey(normalized);
        if (key && !CHAT_SEEN_KEYS.has(key)){
          CHAT_SEEN_KEYS.add(key);
          addEventToFeed(normalized);
        }
      });
    }
  }catch(e){}
});

// Update progress bar on each UI refresh
const _updateUI = updateUI;
updateUI = function(){
  try{ _updateUI(); }catch(e){}
  try{
    const me = PLAYERS[ME];
    if (me){
      const bar = document.getElementById("progressFill");
      const txt = document.getElementById("progressText");
      if (bar && typeof me.progress==='number'){
        bar.style.width = Math.max(0, Math.min(100, me.progress)) + '%';
        txt.textContent = Math.round(me.progress) + '%';
      }
      // Retitle action buttons if present
      const skipBtn = document.querySelector('[data-action="skip"]');
      if (skipBtn) skipBtn.textContent = 'Save All Moves & End Turn';
      // Rename any AP text to Moves in dynamic labels
      document.querySelectorAll('button, .sub, .stats, .actions').forEach(el=>{
        el.innerHTML = el.innerHTML.replaceAll('(1 AP)','(1 Move)').replaceAll(' AP',' Moves');
      });
    }
  }catch(e){}
};

// Remove icon scaling & add building color overlay based on upgrade level
const _buildCardHTML = buildCardHTML;
buildCardHTML = function(name, def, me){
  const html = _buildCardHTML(name, def, me);
  // compute level
  let lvl = 0, owned=false;
  try{ owned = !!(me.structures&&me.structures[name]); lvl = owned ? (me.structures[name].level||1) : 0; }catch(e){}
  const rgb = COLOR_RGB[COLOR] || [31,95,184];
  const alpha = Math.min(0.65, Math.max(0, (lvl<=1?0.06: 0.06 + (lvl-1)*0.08)));
  const overlay = `background-color: rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha});`;
  // remove any scale() on iconWrap and apply overlay to the card
  return html
    .replace(/transform:\s*scale\([^\)]*\)/g, 'transform: scale(1)')
    .replace('<div class="bcard', `<div class="bcard" style="${owned?overlay:''}"`);
};

// ===== New: Integrated Trade UI =====
// track selected resource for market trade
let SELECTED_RES=null;

// Capture prices from roomUpdate
const _roomUpdateHandler = (data)=>{}; // placeholder to keep the structure readable
// rebind the socket handler to also capture prices
socket.off("roomUpdate");
let VISIT_PENDING=false;
let LORE_SHOWN=false;  // Track if we've shown the lore screen
socket.on("roomUpdate", ({ room, players, buildings, ages, prices, visitPending, chat, seasonSummary }) => {
  const prevActive = ROOM?.active;
  ROOM=room; PLAYERS=players; BUILDINGS=buildings; AGES=ages; TRADE_PRICES=prices||TRADE_PRICES; VISIT_PENDING=!!visitPending;
  if (typeof seasonSummary !== "undefined") {
    LAST_SEASON_SUMMARY = seasonSummary;

    // Show raid notification modal for any tribal attacks
    if (seasonSummary && seasonSummary.attackReports && seasonSummary.attackReports.length > 0) {
      seasonSummary.attackReports.forEach(raid => {
        showRaidNotification(raid);
      });
    }
  }
  if (PLAYERS[ME]?.color) setTint(PLAYERS[ME].color);
  if(Array.isArray(chat)) renderChat(chat);

  // Merge personal logs, game logs, and chat into event feed
  const myPersonalLog = (PLAYERS[ME] && PLAYERS[ME].personalLog) || [];
  const gameLog = room.gameLog || [];
  mergeEvents(myPersonalLog, gameLog, chat);

  // Lobby modal logic
  if (!ROOM.active) {
    const playerCount = Object.keys(PLAYERS||{}).length;
    console.log('🔍 roomUpdate lobby check - playerCount:', playerCount, 'LORE_SHOWN:', LORE_SHOWN, 'ROOM.active:', ROOM.active);

    // Check if modal is currently visible
    const modal = document.getElementById('lobbyModal');
    const isModalVisible = modal && !modal.classList.contains('hidden');

    if (playerCount < 2) {
      // Waiting for players - show waiting screen
      console.log('⏳ Less than 2 players, showing waiting modal');
      showLobbyModal(true);
    } else if (playerCount >= 2) {
      // 2+ players in room
      console.log('👥 2+ players detected! LORE_SHOWN:', LORE_SHOWN, 'isModalVisible:', isModalVisible);
      if (!LORE_SHOWN) {
        // First time seeing 2+ players - show lore!
        console.log('🎮 TRIGGERING LORE MODAL - playerCount:', playerCount);
        showLobbyModal(false);
        LORE_SHOWN = true;
        console.log('✅ Lore shown, flag set to true');
      } else if (isModalVisible) {
        // Modal already showing - just update ready status
        console.log('📊 Modal visible, updating ready status');
        updateLobbyReadyStatus();
      } else {
        console.log('⚠️ Modal should be visible but isnt, playerCount:', playerCount, 'LORE_SHOWN:', LORE_SHOWN);
      }
    }
  } else if (ROOM.active) {
    // Game is active - make sure modal is closed
    const modal = document.getElementById('lobbyModal');
    const isModalVisible = modal && !modal.classList.contains('hidden');

    console.log('🔍 Game active check - prevActive:', prevActive, 'isModalVisible:', isModalVisible);

    if (isModalVisible) {
      if (!prevActive) {
        // Game just started - add delay for "Starting game..." message
        console.log('🎯 Game just started! Hiding modal after 1.5s delay');
        setTimeout(() => {
          hideLobbyModal();
          LORE_SHOWN = false;
          console.log('✅ Modal hidden after delay');
        }, 1500);
      } else {
        // Modal is still showing but game was already active - hide immediately
        console.log('⚠️ Game already active but modal still visible - hiding immediately');
        hideLobbyModal();
        LORE_SHOWN = false;
      }
    } else {
      console.log('✓ Game active and modal already hidden');
    }
  }

  // Clear pending list once room starts streaming updates
  try{ if (aiSetupPending) { PENDING_AI = []; aiSetupPending = false; } }catch(e){}
  updateUI();
});

// Visitor handling (works like trade offers - immediate popup)
let CURRENT_VISITOR = null;

socket.on('visitorOffer', (visitor) => {
  CURRENT_VISITOR = visitor;
  const modal = document.getElementById('visitorDecisionModal');
  const fromEl = document.getElementById('visitorFrom');
  const loreEl = document.getElementById('visitorLore');

  if (fromEl) fromEl.textContent = visitor.from;
  if (loreEl) loreEl.textContent = visitor.lore || 'A mysterious visitor stands at your gates...';
  if (modal) modal.classList.remove('hidden');

  sfxTone(880, 0.05, 0.06);
});

function closeVisitorModal() {
  const modal = document.getElementById('visitorDecisionModal');
  if (modal) modal.classList.add('hidden');
}

// Setup visitor modal buttons
document.addEventListener('DOMContentLoaded', () => {
  const acceptBtn = document.getElementById('visitorAcceptBtn');
  const rejectBtn = document.getElementById('visitorRejectBtn');

  if (acceptBtn) {
    acceptBtn.addEventListener('click', () => {
      if (!CURRENT_VISITOR) return;
      socket.emit('resolveVisit', { code: ROOM.code, playerId: ME, id: CURRENT_VISITOR.id, decision: 'accept' });
      closeVisitorModal();
    });
  }

  if (rejectBtn) {
    rejectBtn.addEventListener('click', () => {
      if (!CURRENT_VISITOR) return;
      socket.emit('resolveVisit', { code: ROOM.code, playerId: ME, id: CURRENT_VISITOR.id, decision: 'reject' });
      closeVisitorModal();
    });
  }
});

// OLD TRADE MODAL FUNCTIONS - DISABLED (using new trade-modal-controller.js)
// function openTradeModal(type){
//   SELECTED_RES = (type && ["wood","rock","metal","food"].includes(type)) ? type : (SELECTED_RES || 'wood');
//   const modal = document.getElementById('tradeModal');
//   const selLbl = document.getElementById('selRes'); if (selLbl) selLbl.textContent = SELECTED_RES.toUpperCase();
//   const resDdl = document.getElementById('marketRes'); if (resDdl) resDdl.value = SELECTED_RES;
//   document.getElementById('marketAmount').value = 5;
//   updateMarketCost();
//   // populate player list
//   const ddl = document.getElementById('tradePlayer');
//   ddl.innerHTML = Object.keys(PLAYERS).filter(p=>p!==ME).map(p=>`<option value="${p}">${p}</option>`).join('') || '<option value="" disabled>(No other players)</option>';
//   // age + tint theming accents
//   const me = PLAYERS[ME];
//   const mc = document.getElementById('tradeModalContent');
//   if (mc){ mc.classList.remove('age-wood','age-stone','age-modern'); if (me?.age){ mc.classList.add('age-'+me.age.toLowerCase()); } }
//   const ageSpan = document.getElementById('tradeAge'); if (ageSpan) ageSpan.textContent = me?.age ? `Age: ${me.age}` : '';
//   // default to Bank tab each open
//   setTradeTab('bank');
//   modal.classList.remove('hidden');
// }
// function closeTradeModal(){ document.getElementById('tradeModal').classList.add('hidden'); }
// function updateMarketCost(){
//   const amt = Math.max(1, parseInt(document.getElementById('marketAmount').value||'1',10));
//   const sellGain = Math.floor(amt/4);
//   const buyCost = amt*4;
//   document.getElementById('marketCost').textContent = `Sell -> +${sellGain} Golden Coins (1:4) | Buy -> -${buyCost} Golden Coins (4:1) | Costs 1 Move`;
// }

document.addEventListener('DOMContentLoaded', ()=>{
  // Make entire resource tiles clickable for gathering
  document.addEventListener('click', (ev)=>{
    // Check if click is on a resource tile (but not already on a button)
    const tile = ev.target.closest('.resTile');
    if (!tile) return;

    // Don't trigger if clicking directly on the button itself (button handler will take care of it)
    if (ev.target.closest('.tileAction')) return;

    // Find which resource this tile belongs to
    const resline = tile.closest('.resline');
    if (!resline) return;

    const resType = resline.dataset.res;
    if (!resType) return;

    // Check if it's the player's turn
    if (!(ROOM?.active && ROOM?.turnOf===ME)) {
      toast("Not your turn.");
      sfxTone(220,0.05,0.05);
      return;
    }

    // Trigger the appropriate action based on resource type with loading overlay
    if (resType === 'wood') {
      if (!performActionWithDelay("Gathering Wood", ()=>{ emitAction("gather",{ type:"wood" }); apFloat(-1); sfxTone(500,0.04,0.05); })) return;
    }
    else if (resType === 'rock') {
      if (!performActionWithDelay("Gathering Rock", ()=>{ emitAction("gather",{ type:"rock" }); apFloat(-1); sfxTone(500,0.04,0.05); })) return;
    }
    else if (resType === 'metal') {
      if (!performActionWithDelay("Gathering Metal", ()=>{ emitAction("gather",{ type:"metal" }); apFloat(-1); sfxTone(500,0.04,0.05); })) return;
    }
    else if (resType === 'food') {
      if (!performActionWithDelay("Harvesting Food", ()=>{ emitAction("gather",{ type:"food" }); apFloat(-1); sfxTone(500,0.04,0.05); })) return;
    }
    // Coins/trade now handled by dedicated TRADE button with new modal
  });

  // Remove previous click-to-trade bindings; use explicit Trade button instead
  try{
    document.querySelectorAll('.resline').forEach(el=>{
      const clone = el.cloneNode(true); el.replaceWith(clone);
    });
  }catch(e){}
  // Trade button now uses new modal (handled by trade-modal-controller.js)
  // const tradeBtn = document.getElementById('openTradeBtn');
  // if (tradeBtn) tradeBtn.addEventListener('click', ()=>openTradeModal());
  // Next Age click
  const advanceAgeBtn = document.getElementById('advanceAgeBtn');
  if (advanceAgeBtn){
    advanceAgeBtn.addEventListener('click', ()=>{
      if (!(ROOM?.active && ROOM?.turnOf===ME)) { toast('Not your turn.'); return; }
      emitAction('advance', {});
    });
  }
  // Old trade modal code removed - now using new trade-modal-controller.js
  // Delegated fallback disabled
  // document.addEventListener('click', (ev)=>{
  //   const t = ev.target.closest && ev.target.closest('#openTradeBtn');
  //   if (t && !t.disabled) { openTradeModal(); }
  // });
  // const tradeClose = document.getElementById('tradeClose'); if (tradeClose) tradeClose.addEventListener('click', closeTradeModal);
  // const tabBank = document.getElementById('tabBank'); if (tabBank) tabBank.addEventListener('click', ()=>setTradeTab('bank'));
  // const tabPlayer = document.getElementById('tabPlayer'); if (tabPlayer) tabPlayer.addEventListener('click', ()=>setTradeTab('player'));
  // Old market event listeners disabled - using new trade modal
  // const marketAmount = document.getElementById('marketAmount'); if (marketAmount) marketAmount.addEventListener('input', updateMarketCost);
  // const marketRes = document.getElementById('marketRes'); if (marketRes) marketRes.addEventListener('change', ()=>{
  //   const v = marketRes.value;
  //   if (["wood","rock","metal","food"].includes(v)){
  //     SELECTED_RES = v;
  //     const selLbl2 = document.getElementById('selRes'); if (selLbl2) selLbl2.textContent = SELECTED_RES.toUpperCase();
  //     updateMarketCost();
  //   }
  // });
  // const marketSell = document.getElementById('marketSell'); if (marketSell) marketSell.addEventListener('click', ()=>{
  //   if (!(ROOM?.active && ROOM?.turnOf===ME)) { toast('Not your turn.'); return; }
  //   const amt = Math.max(1, parseInt(document.getElementById('marketAmount').value||'1',10));
  //   emitAction('trade',{ mode:'sell', type:SELECTED_RES, amount:amt });
  // });
  // const marketBuy = document.getElementById('marketBuy'); if (marketBuy) marketBuy.addEventListener('click', ()=>{
  //   if (!(ROOM?.active && ROOM?.turnOf===ME)) { toast('Not your turn.'); return; }
  //   const amt = Math.max(1, parseInt(document.getElementById('marketAmount').value||'1',10));
  //   emitAction('trade',{ mode:'buy', type:SELECTED_RES, amount:amt });
  // });

  // P2P trading - disabled, using new trade modal
  // const sendOffer = document.getElementById('sendOffer'); if (sendOffer) sendOffer.addEventListener('click', ()=>{
  //   if (!(ROOM?.active && ROOM?.turnOf===ME)) { toast('Offer only on your turn.'); return; }
  //   const to = document.getElementById('tradePlayer').value;
  //   if (!to) return toast('No player selected.');
  //   const giveType = document.getElementById('giveType').value;
  //   const wantType = document.getElementById('wantType').value;
  //   const giveAmt = Math.max(1, parseInt(document.getElementById('giveAmt').value||'1',10));
  //   const wantAmt = Math.max(1, parseInt(document.getElementById('wantAmt').value||'1',10));
  //   socket.emit('proposeTrade', { code:ROOM.code, from:ME, to, offer:{ give:{ type:giveType, amount:giveAmt }, want:{ type:wantType, amount:wantAmt } } });
  //   toast('Offer sent');
  //   // Close the trade modal after sending an offer; we'll only reopen on counter-offer
  //   closeTradeModal();
  // });

  // Special Actions: Visitor modal
  const openVisitBtn = document.getElementById('openVisitBtn');
  const visitModal = document.getElementById('visitModal');
  const visitClose = document.getElementById('visitClose');
  const visitSendBtn = document.getElementById('visitSendBtn');
  const visitTarget2 = document.getElementById('visitTarget2');
  const visitKind2 = document.getElementById('visitKind2');

  function openVisitModal(){
    if (!(ROOM?.active && ROOM?.turnOf===ME)) { toast('Only on your turn.'); return; }
    if (VISIT_PENDING) { toast('Visitor pending…'); return; }
    const me = PLAYERS[ME];
    if (!me || (me.resources.coins||0) < 5){ toast('Not enough Golden Coins (need 5).'); return; }
    if (visitTarget2){ visitTarget2.innerHTML = Object.keys(PLAYERS).filter(pid=>pid!==ME).map(pid=>`<option value="${pid}">${pid}</option>`).join(''); }
    if (visitKind2){ visitKind2.value='trader'; }
    visitModal && visitModal.classList.remove('hidden');
  }
  if (openVisitBtn) openVisitBtn.addEventListener('click', openVisitModal);
  // Delegated fallback in case early binding fails
  document.addEventListener('click', (ev)=>{
    const b = ev.target.closest && ev.target.closest('#openVisitBtn');
    if (b) openVisitModal();
  });
  if (visitClose) visitClose.addEventListener('click', ()=>visitModal.classList.add('hidden'));

  // Trigger Raid button - Open mercenary modal
  const triggerRaidBtn = document.getElementById('triggerRaidBtn');
  if (triggerRaidBtn) {
    triggerRaidBtn.addEventListener('click', () => {
      const me = PLAYERS[ME];
      if (!me) return;

      // Must be your turn
      if (!(ROOM?.active && ROOM?.turnOf === ME)) {
        toast('Only on your turn.');
        return;
      }

      // Check if player has enough coins
      if ((me.resources.coins || 0) < 20) {
        toast('Not enough Golden Coins (need 20 to hire mercenaries).');
        return;
      }

      // Open mercenary modal
      openMercenaryModal();
    });
  }

  // Mercenary modal handlers
  function openMercenaryModal() {
    const modal = document.getElementById('mercenaryModal');
    const targetSelect = document.getElementById('mercenaryTarget');

    if (!modal || !targetSelect) return;

    // Populate player list (excluding current player)
    const otherPlayers = Object.keys(PLAYERS).filter(pid => pid !== ME);
    targetSelect.innerHTML = '<option value="">-- Choose a player to raid --</option>' +
      otherPlayers.map(pid => `<option value="${pid}">${pid}</option>`).join('');

    modal.classList.remove('hidden');
  }

  const mercenaryClose = document.getElementById('mercenaryClose');
  const mercenaryCancel = document.getElementById('mercenaryCancel');
  const mercenaryConfirm = document.getElementById('mercenaryConfirm');

  if (mercenaryClose) {
    mercenaryClose.addEventListener('click', () => {
      document.getElementById('mercenaryModal')?.classList.add('hidden');
    });
  }

  if (mercenaryCancel) {
    mercenaryCancel.addEventListener('click', () => {
      document.getElementById('mercenaryModal')?.classList.add('hidden');
    });
  }

  if (mercenaryConfirm) {
    mercenaryConfirm.addEventListener('click', () => {
      const targetSelect = document.getElementById('mercenaryTarget');
      const target = targetSelect?.value;

      if (!target) {
        toast('Please select a target player.');
        return;
      }

      // Close modal
      document.getElementById('mercenaryModal')?.classList.add('hidden');

      // Send request to server with target
      socket.emit('triggerRaid', { code: ROOM.code, playerId: ME, targetPlayerId: target });
      toast('Mercenaries hired! They will strike at the end of this season.');
    });
  }

  // Raid notification close button
  const raidNotificationClose = document.getElementById('raidNotificationClose');
  if (raidNotificationClose) {
    raidNotificationClose.addEventListener('click', () => {
      const modal = document.getElementById('raidNotificationModal');
      if (modal) modal.classList.add('hidden');
    });
  }

  // Ready toggle (sidebar button)
  const readyBtn = document.getElementById('readyBtn');
  if (readyBtn) readyBtn.addEventListener('click', ()=>{
    try{ socket.emit('setReady', { code:ROOM.code, playerId:ME, ready: !(PLAYERS[ME]?.ready) }); }catch(e){}
  });

  // Exit and Restart buttons
  const exitBtn = document.getElementById('exitBtn');
  const restartBtn = document.getElementById('restartBtn');
  if (exitBtn){
    exitBtn.addEventListener('click', ()=>{
      showConfirm('Leave this session?', 'Exit Session').then(ok=>{
        if (!ok) return;
        SUPPRESS_LEAVE_PROMPT = true;
        try{ socket.emit('leaveRoom', { code: ROOM?.code, playerId: ME }); }catch(e){}
        // Return to lobby UI
        try{
          document.getElementById('game')?.classList.add('hidden');
          document.getElementById('lobby')?.classList.remove('hidden');
          // Reset theme/tint classes to lobby defaults
          document.body.classList.remove('theme-wood','theme-stone','theme-modern');
          document.body.classList.remove('tint-blue','tint-red','tint-green','tint-yellow','tint-purple','tint-orange','tint-tint-pink','tint-cyan','tint-gray');
        }catch(e){}
        ROOM=null; PLAYERS={};
      });
    });
  }
  if (restartBtn){
    restartBtn.addEventListener('click', ()=>{
      if (!(ROOM && ROOM.host===ME)) { toast('Only host can restart.'); return; }
      showConfirm('Restart the game for all players? Everyone will return to lobby.', 'Restart Game').then(ok=>{
        if (ok){ socket.emit('restartGame', { code: ROOM.code, by: ME }); }
      });
    });
  }

  // Kicked handler
  socket.on('kicked', ()=>{
    toast('You were removed from the session.');
    SUPPRESS_LEAVE_PROMPT = true;
    try{
      document.getElementById('game')?.classList.add('hidden');
      document.getElementById('lobby')?.classList.remove('hidden');
    }catch(e){}
    ROOM=null; PLAYERS={};
  });

  // Ready toggle (lobby modal button)
  const lobbyReadyBtn = document.getElementById('lobbyReadyBtn');
  if (lobbyReadyBtn) lobbyReadyBtn.addEventListener('click', ()=>{
    try{
      socket.emit('setReady', { code:ROOM.code, playerId:ME, ready: !(PLAYERS[ME]?.ready) });
      sfxTone(600,0.05,0.06);
    }catch(e){}
  });

  // Handle visitor card selection
  let selectedVisitorKind = 'trader'; // default
  document.querySelectorAll('.visitor-option-card').forEach(card => {
    card.addEventListener('click', () => {
      // Remove selection from all cards
      document.querySelectorAll('.visitor-option-card').forEach(c => {
        c.style.transform = 'scale(1)';
        c.style.boxShadow = 'none';
      });
      // Mark this card as selected
      card.style.transform = 'scale(1.05)';
      card.style.boxShadow = '0 0 20px rgba(250, 204, 21, 0.5)';
      selectedVisitorKind = card.getAttribute('data-kind');
    });
  });

  if (visitSendBtn) visitSendBtn.addEventListener('click', ()=>{
    if (!(ROOM?.active && ROOM?.turnOf===ME)) { toast('Only on your turn.'); return; }
    const to = visitTarget2 && visitTarget2.value;
    const kind = selectedVisitorKind;
    if (!to) return toast('Pick a player');
    const me = PLAYERS[ME];
    if (!me || (me.ap||0) < 1){ toast('Not enough Moves (need 1).'); return; }
    if (!me || (me.resources.coins||0) < 10){ toast('Not enough Golden Coins (need 10).'); return; }
    socket.emit('sendVisit', { code:ROOM.code, from:ME, to, kind });
    visitModal && visitModal.classList.add('hidden');

    let dispatchMsg = 'Visitor dispatched.';
    if (kind === 'trader') dispatchMsg = 'Trader dispatched.';
    else if (kind === 'spy') dispatchMsg = 'Spy dispatched (disguised as trader).';
    else if (kind === 'robber') dispatchMsg = 'Robber dispatched (disguised as trader).';
    toast(dispatchMsg);
  });

  // Visitor outcome modal close button
  const visitorOutcomeClose = document.getElementById('visitorOutcomeClose');
  if (visitorOutcomeClose) {
    visitorOutcomeClose.addEventListener('click', () => {
      const modal = document.getElementById('visitorOutcomeModal');
      if (modal) modal.classList.add('hidden');
    });
  }

  // Handle visitor outcome from server
  socket.on('visitorOutcome', ({ message, type, image }) => {
    const modal = document.getElementById('visitorOutcomeModal');
    const textEl = document.getElementById('visitorOutcomeText');
    const imageEl = document.getElementById('visitorOutcomeImage');

    if (!modal || !textEl || !imageEl) return;

    // Set the message
    textEl.textContent = message;

    // Set the image
    imageEl.src = image || '/media/trader.png';

    // Show the modal
    modal.classList.remove('hidden');
  });

  // Incoming offers - using new trade modal
  socket.on('tradeOffer', (offer)=>{
    console.log('Received trade offer:', offer);
    if (typeof TradeModal !== 'undefined' && TradeModal.showIncomingOffer) {
      TradeModal.showIncomingOffer(offer);
      sfxTone(900,0.07,0.07);
    } else {
      console.error('TradeModal not available for showing offer');
    }
  });

  // Handle accept/decline with event delegation
  document.body.addEventListener('click', (e) => {
    if (e.target.id === 'tradeOfferAccept') {
      const modal = document.getElementById('tradeModal');
      const offerData = modal?.dataset.currentOffer;
      if (offerData) {
        const offer = JSON.parse(offerData);
        console.log('Accepting trade offer:', offer);
        socket.emit('respondTrade', { code:ROOM.code, playerId:ME, offerId:offer.id, action:'accept' });
        modal.classList.add('hidden');
      }
    } else if (e.target.id === 'tradeOfferDecline') {
      const modal = document.getElementById('tradeModal');
      const offerData = modal?.dataset.currentOffer;
      if (offerData) {
        const offer = JSON.parse(offerData);
        console.log('Declining trade offer:', offer);
        socket.emit('respondTrade', { code:ROOM.code, playerId:ME, offerId:offer.id, action:'decline' });
        modal.classList.add('hidden');
      }
    }
  });
});
// OLD TRADE TAB FUNCTION - DISABLED
// function setTradeTab(which){
//   const bank = document.getElementById('bankSection');
//   const player = document.getElementById('playerSection');
//   const tBank = document.getElementById('tabBank');
//   const tPlayer = document.getElementById('tabPlayer');
//   const isBank = which==='bank';
//   if (bank && player){ bank.classList.toggle('hidden', !isBank); player.classList.toggle('hidden', isBank); }
//   if (tBank && tPlayer){ tBank.classList.toggle('active', isBank); tPlayer.classList.toggle('active', !isBank); }
// }
// Civilization theming
const CIV_PLAYER_ICON = { Vikings:'⚔️', Romans:'🏛️', Mongols:'🐎', Slavs:'🌿' };
const CIV_BUILD_THEME = {
  Vikings: {
    Hut:{ name:'Longhouse', icon:'🛖' }, Sawmill:{ name:"Woodcutter's Lodge", icon:'🪓' }, Field:{ name:'Hunting Lodge', icon:'🏹' }, Market:{ name:'Trading Post', icon:'🏪' },
    Quarry:{ name:'Stone Pit', icon:'🪨' }, Mill:{ name:'Smokehouse', icon:'🍖' }, TownCenter:{ name:'Thingstead', icon:'⚖️' },
    Factory:{ name:'Shipyard', icon:'⚓' }, Greenhouse:{ name:'Fishery', icon:'🐟' }, Bank:{ name:'Treasure Hoard', icon:'💰' }, Monument:{ name:'Rune Monument', icon:'🗿' }
  },
  Romans: {
    Hut:{ name:'Insula', icon:'🏘️' }, Sawmill:{ name:'Lumber Yard', icon:'🪓' }, Field:{ name:'Villa Farm', icon:'🌾' }, Market:{ name:'Forum Market', icon:'🏛️' },
    Quarry:{ name:'Stoneworks', icon:'🧱' }, Mill:{ name:'Aqueduct Mill', icon:'⚙️' }, TownCenter:{ name:'Basilica', icon:'🏛️' },
    Factory:{ name:'Foundry', icon:'🔩' }, Greenhouse:{ name:'Hortus', icon:'🪴' }, Bank:{ name:'Treasury', icon:'🏦' }, Monument:{ name:'Triumphal Arch', icon:'🏛️' }
  },
  Mongols: {
    Hut:{ name:'Ger', icon:'🛖' }, Sawmill:{ name:'Timber Camp', icon:'🪓' }, Field:{ name:'Pasture', icon:'🐄' }, Market:{ name:'Raiding Camp', icon:'⚔️' },
    Quarry:{ name:'Stone Camp', icon:'🪨' }, Mill:{ name:'Smoke Tent', icon:'🍖' }, TownCenter:{ name:"Khan's Tent", icon:'⛺' },
    Factory:{ name:'Forge Wagon', icon:'⚒️' }, Greenhouse:{ name:'Herding Grounds', icon:'🐑' }, Bank:{ name:'Tribute Hall', icon:'🏦' }, Monument:{ name:'Eternal Blue Monument', icon:'🗿' }
  },
  Slavs: {
    Hut:{ name:'Izba', icon:'🏚️' }, Sawmill:{ name:'Timber Yard', icon:'🪓' }, Field:{ name:'Collective Farm', icon:'🌾' }, Market:{ name:'Market Square', icon:'🏪' },
    Quarry:{ name:'Earthworks', icon:'⛏️' }, Mill:{ name:'Windmill', icon:'🌬️' }, TownCenter:{ name:'Veche Hall', icon:'🏛️' },
    Factory:{ name:'Steelworks', icon:'🏭' }, Greenhouse:{ name:'Dacha Greenhouse', icon:'🪴' }, Bank:{ name:"People's Bank", icon:'🏦' }, Monument:{ name:'Motherland Monument', icon:'🗽' }
  }
};

// Story intro modal
function civBlurb(name){
  switch(name){
    case 'Romans': return 'Steeped in order and ambition, the Romans raise roads and law wherever their banners fall.';
    case 'Vikings': return 'From frost-bitten fjords, the Vikings row with iron will—traders at dawn, raiders by dusk.';
    case 'Mongols': return 'Swift as the steppe winds, the Mongols roam—unyielding riders bound by iron discipline.';
    case 'Slavs': return 'Rooted in forest and field, the Slavs endure—communal strength forged through hard seasons.';
    default: return 'A people with deep memory and bold horizons.';
  }
}
function clashHook(a,b){
  return `When ${a} met ${b}, old grudges stirred and new ambitions sparked. The frontier holds room for only one vision.`;
}
function showStoryIntro(){
  const modal = document.getElementById('storyModal');
  const close = document.getElementById('storyClose');
  const text = document.getElementById('storyText');
  if (!modal || !text) return;
  const pids = Object.keys(PLAYERS||{});
  const civs = pids.map(id=>PLAYERS[id]?.civ).filter(Boolean);
  const uniq = [...new Set(civs)];
  const lines = [];
  if (uniq.length===1){
    lines.push(`${uniq[0]} rise together, but unity frays when power is near.`);
    lines.push(civBlurb(uniq[0]));
  } else {
    uniq.forEach(c=>lines.push(civBlurb(c)));
    if (uniq.length>=2) lines.push(clashHook(uniq[0], uniq[1]));
  }
  lines.push('Gather, build, and etch your legacy before your rivals do.');
  text.innerHTML = `<p>${lines.join('</p><p>')}</p>`;
  modal.classList.remove('hidden');
  if (close) close.addEventListener('click', ()=>modal.classList.add('hidden'), { once:true });
}

// ===== Lobby Modal System =====
function showLobbyModal(waitingForPlayers) {
  const modal = document.getElementById('lobbyModal');
  const title = document.getElementById('lobbyModalTitle');
  const text = document.getElementById('lobbyModalText');
  const readySection = document.getElementById('lobbyReadySection');

  console.log('showLobbyModal called', { waitingForPlayers, modal: !!modal, text: !!text, readySection: !!readySection });

  if (!modal || !text || !readySection) {
    console.log('showLobbyModal - missing elements, returning');
    return;
  }
  if (waitingForPlayers) {
    console.log('Showing waiting message');
    title.textContent = 'Preparing for Battle';
    text.innerHTML = '<p style="font-size: 1.2em; color: #666; margin: 20px 0;">⌛ Waiting for other players to join...</p>';
    readySection.classList.add('hidden');
  } else {
    console.log('Showing lore message');
    const pids = Object.keys(PLAYERS||{});
    const civs = pids.map(id=>PLAYERS[id]?.civ).filter(Boolean);
    const uniq = [...new Set(civs)];
    const lore = gatherLoreSegments(uniq);
    const lines = [];

    title.textContent = 'The Stage is Set';

    if (lore.media){
      lines.push(`<div class="loreVideoFrame"><img src="${lore.media}" alt="Lore vignette" loading="lazy"></div>`);
    }
    if (Array.isArray(lore.segments) && lore.segments.length){
      lore.segments.forEach(snippet=>{
        lines.push(`<p class="loreSnippet">${snippet}</p>`);
      });
    }
    if (uniq.length){
      uniq.forEach(c=>{
        const blurb = civBlurb(c);
        if (blurb){
          lines.push(`<p class="loreFlavor"><strong>${c}:</strong> <span>${blurb}</span></p>`);
        }
      });
    }
    if (!lines.length){
      lines.push('<p class="loreSnippet">The drums are quiet for now, but ambition is already awake.</p>');
    }

    text.innerHTML = lines.join('');
    readySection.classList.remove('hidden');

    console.log('About to call updateLobbyReadyStatus');
    updateLobbyReadyStatus();
  }

  console.log('Removing hidden class from modal');
  modal.classList.remove('hidden');
  console.log('Modal should now be visible, classList:', modal.classList.toString());
}

function hideLobbyModal() {
  const modal = document.getElementById('lobbyModal');
  if (modal) modal.classList.add('hidden');
}

let CLOSE_MODAL_TIMER = null;

function updateLobbyReadyStatus() {
  const statusDiv = document.getElementById('lobbyReadyStatus');
  const readyBtn = document.getElementById('lobbyReadyBtn');

  console.log('updateLobbyReadyStatus called', { statusDiv: !!statusDiv, readyBtn: !!readyBtn, PLAYERS, ME });

  if (!statusDiv || !readyBtn || !PLAYERS || !ME) {
    console.log('updateLobbyReadyStatus early return - missing elements');
    return;
  }

  const pids = Object.keys(PLAYERS);
  const readyCount = pids.filter(pid => PLAYERS[pid]?.ready).length;
  const totalCount = pids.length;
  const myReady = PLAYERS[ME]?.ready;

  readyBtn.textContent = myReady ? '✓ Ready (Click to Cancel)' : 'Ready';
  readyBtn.style.backgroundColor = myReady ? '#27a844' : '';
  readyBtn.style.borderColor = myReady ? '#27a844' : '';

  if (readyCount === totalCount && totalCount >= 2) {
    // All players ready - show loading animation and close modal after 3 seconds
    statusDiv.innerHTML = `
      <p style="color: #27a844; font-weight: bold; font-size: 1.1em;">
        🎮 All players ready!
      </p>
      <p style="color: #666; margin-top: 8px; font-size: 0.95em;">
        <span style="display: inline-block; animation: pulse 1.5s ease-in-out infinite;">⚡</span>
        Starting game...
      </p>
      <style>
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
        }
      </style>
    `;
    // Disable the ready button
    readyBtn.disabled = true;
    readyBtn.style.opacity = '0.6';

    // Close modal after 3 seconds (only set timer once)
    if (!CLOSE_MODAL_TIMER) {
      console.log('⏰ Setting 3 second timer to close modal');
      CLOSE_MODAL_TIMER = setTimeout(() => {
        console.log('✅ 3 seconds elapsed - closing modal now');
        hideLobbyModal();
        LORE_SHOWN = false;
        CLOSE_MODAL_TIMER = null;
      }, 3000);
    }
  } else {
    statusDiv.innerHTML = `<p>${readyCount} of ${totalCount} players ready</p>`;
    readyBtn.disabled = false;
    readyBtn.style.opacity = '1';

    // Clear timer if someone unreadies
    if (CLOSE_MODAL_TIMER) {
      console.log('❌ Clearing close timer - someone unreadied');
      clearTimeout(CLOSE_MODAL_TIMER);
      CLOSE_MODAL_TIMER = null;
    }
  }

  console.log('Ready status updated:', { readyCount, totalCount, myReady });
}

// =================== Victory Screen ===================
function showVictoryScreen(gameStats) {
  const modal = document.getElementById('victoryModal');
  if (!modal || !gameStats || !gameStats.playerStats) return;

  const winnerId = gameStats.winner;
  const w = gameStats.playerStats[winnerId] || {};
  const winnerNameEl = document.getElementById('victoryWinnerName');
  const winnerCivEl = document.getElementById('victoryWinnerCiv');
  const subtitleEl = document.getElementById('victorySubtitle');
  const factsEl = document.getElementById('victoryFacts');
  const narrativeEl = document.getElementById('victoryNarrative');

  // Winner header
  if (winnerNameEl) winnerNameEl.textContent = winnerId || 'Unknown';
  if (winnerCivEl) winnerCivEl.textContent = w.civ ? `(${w.civ})` : '';

  // Monument name by civ
  const monName = (w.civ && CIV_BUILD_THEME[w.civ] && CIV_BUILD_THEME[w.civ].Monument && CIV_BUILD_THEME[w.civ].Monument.name) || 'Monument';
  const totalTurnsDerived = gameStats?.totalTurns || (gameStats?.sessionSummary?.turns || 0);
  if (subtitleEl) subtitleEl.textContent = `${monName} completed • ${gameStats?.duration?.formatted || ''} • ${totalTurnsDerived} turns`;

  // Quick facts
  try {
    const players = Object.values(gameStats.playerStats || {});

    // First to reach Stone/Modern
    function firstToAge(target) {
      let best = null;
      players.forEach(p => {
        const hit = Array.isArray(p.ageProgression) ? p.ageProgression.find(x => x.age === target) : null;
        if (hit) {
          if (!best || (hit.turn||Infinity) < (best.turn||Infinity)) best = { player: p.name, turn: hit.turn };
        }
      });
      return best;
    }

    const firstStone = firstToAge('Stone');
    const firstModern = firstToAge('Modern');

    // Lead dynamics from wealth history
    function nearestWealthAtTurn(p, targetTurn){
      const hist = Array.isArray(p.wealthHistory) ? p.wealthHistory : [];
      if (!hist.length) return { turn: 0, wealth: 0 };
      let best = hist[0];
      let bestDiff = Math.abs((best.turn||0) - targetTurn);
      for (const h of hist){
        const d = Math.abs((h.turn||0) - targetTurn);
        if (d < bestDiff){ best = h; bestDiff = d; }
      }
      return best;
    }
    const totalTurns = gameStats.totalTurns || 0;
    const earlyTurn = Math.max(1, Math.round(totalTurns * 0.25));
    let earlyLeader = null;
    let maxEarlyWealth = -1;
    players.forEach(p => {
      const wpt = nearestWealthAtTurn(p, earlyTurn);
      if ((wpt.wealth||0) > maxEarlyWealth){ maxEarlyWealth = wpt.wealth||0; earlyLeader = p.name; }
    });

    // Count lead changes by scanning combined wealth histories
    const combined = [];
    players.forEach(p => (p.wealthHistory||[]).forEach(h => combined.push({ turn:h.turn||0, name:p.name, wealth:h.wealth||0 })));
    combined.sort((a,b)=>a.turn-b.turn);
    let leadChanges = 0, currentLeader = null, currentWealth = -1;
    combined.forEach(pt => {
      if (pt.wealth > currentWealth){
        if (currentLeader && currentLeader !== pt.name) leadChanges++;
        currentLeader = pt.name; currentWealth = pt.wealth;
      }
    });

    // Winner army descriptor
    const army = w.finalSoldiers|0;
    let armyDesc = 'modest';
    if (army >= 30) armyDesc = 'majestic';
    else if (army >= 15) armyDesc = 'formidable';
    else if (army >= 5) armyDesc = 'sturdy';

    // Defense/raid mentions from event feed (best-effort)
    function countMentions(player, includes){
      const arr = Array.isArray(EVENT_FEED_DATA)?EVENT_FEED_DATA:[];
      const name = String(player||'');
      return arr.filter(e => {
        const t = String(e.text||e.message||'');
        return t.toLowerCase().includes(name.toLowerCase()) && includes.some(s=>t.toLowerCase().includes(s));
      }).length;
    }
    const defended = countMentions(winnerId, ['repelled','defended','repeLled']);
    const breached = countMentions(winnerId, ['breached','attacked','raided']);

    // Build facts grid
    if (factsEl){
      const fact = (label, value)=>`<div style="background:#0f1419; border:1px solid rgba(250,204,21,0.15); border-radius:8px; padding:10px;">
        <div style="font-size:12px; color:#94a3b8; text-transform:uppercase; letter-spacing:.04em;">${label}</div>
        <div style="font-size:16px; font-weight:800; color:#e2e8f0; margin-top:4px;">${value}</div>
      </div>`;
      factsEl.innerHTML = [
        fact('Winner', `${winnerId} • ${w.civ||''}`),
        fact('Monument', monName),
        fact('Duration', gameStats?.duration?.formatted || '—'),
        fact('Total turns', totalTurnsDerived),
        fact('Lead changes', leadChanges),
        fact('Early leader', earlyLeader || '—'),
        fact('Raids (S/F)', `${w.raidsSucceeded|0}/${w.raidsFailed|0}`),
        fact('Trades', w.tradesCompleted|0),
      ].join('');
    }

    // Narrative
    if (narrativeEl){
      const civLine = w.civ ? civBlurb(w.civ) : '';
      const firsts = [];
      if (firstStone) firsts.push(`First to Stone: <strong>${firstStone.player}</strong> (turn ${firstStone.turn})`);
      if (firstModern) firsts.push(`First to Modern: <strong>${firstModern.player}</strong> (turn ${firstModern.turn})`);

      const raidLine = (w.raidsLaunched|0) > 0
        ? `${winnerId} launched ${w.raidsLaunched} raid(s) (${w.raidsSucceeded|0} victories, ${w.raidsFailed|0} defeats).`
        : `${winnerId} kept their swords sheathed, winning through industry and will.`;
      const tradeLine = (w.tradesCompleted|0) > 0
        ? `${winnerId} struck ${w.tradesCompleted} trade deal(s), proving shrewd at the market.`
        : `${winnerId} spurned the bazaar and built with their own hands.`;

      const defendLine = (defended+breached) > 0
        ? `${winnerId} ${defended?`repelled ${defended} raid(s)`:''}${defended&&breached?', ':''}${breached?`rebuilt after ${breached} breach(es)`:''}.`
        : '';

      const tribalRaids = (gameStats?.sessionSummary?.raids || []);
      const raidsLine = tribalRaids.length
        ? `${tribalRaids.length} tribal raid(s) struck this land${tribalRaids.length<=3?`: ${tribalRaids.map(r=>`${r.target} (${r.season})`).join(', ')}`:''}.`
        : '';

      const lines = [
        `In the end, <strong>${winnerId}</strong> of the <strong>${w.civ||''}</strong> sealed victory by completing the <strong>${monName}</strong>. ${civLine}`,
        firsts.length ? firsts.join(' • ') : '',
        leadChanges>0 ? `The lead changed ${leadChanges} time(s): ${earlyLeader||'—'} set the early pace, but <strong>${winnerId}</strong> surged ahead late.` : '',
        raidsLine,
        `Their army stood ${armyDesc} at ${army} soldiers. ${raidLine} ${tradeLine}`,
        defendLine
      ].filter(Boolean);

      narrativeEl.innerHTML = `<p>${lines.join('</p><p>')}</p>`;
    }
  } catch(e) { console.error('Victory facts build error', e); }

  // Player cards
  displayPlayerStatistics(gameStats);

  // Show modal
  modal.classList.remove('hidden');
}

function displayPlayerStatistics(gameStats) {
  const container = document.getElementById('playerStatsContainer');
  if (!container) return;

  const players = Object.values(gameStats.playerStats);

  let html = '';

  players.forEach((player, idx) => {
    const isWinner = player.name === gameStats.winner;
    const borderColor = isWinner ? '#fbbf24' : '#475569';

    html += `
      <div class="player-stat-row" style="border-left: 6px solid ${borderColor}; ${isWinner ? 'border: 3px solid #fbbf24; border-left: 6px solid #fbbf24;' : ''}">
        <!-- Player Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <div style="display: flex; align-items: center; gap: 15px;">
            <span style="font-size: 36px; color: ${player.color || '#fff'}; font-weight: 900;">${player.name}</span>
            <span style="color: #94a3b8; font-size: 18px;">${player.civ}</span>
            <span style="color: #94a3b8; font-size: 18px;">${player.age} Age</span>
            ${isWinner ? '<span style="font-size: 48px;">👑</span>' : ''}
          </div>
          ${isWinner ? '<div style="font-size: 28px; font-weight: 900; color: #fbbf24; text-shadow: 2px 2px 4px rgba(0,0,0,0.5);">WINNER</div>' : ''}
        </div>

        <!-- Resources Grid -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px;">
          <div style="background: rgba(30, 41, 59, 0.8); padding: 15px; border-radius: 8px; text-align: center;">
            <div style="font-size: 24px; margin-bottom: 8px;">🪵</div>
            <div style="font-size: 14px; color: #94a3b8; margin-bottom: 5px;">Wood</div>
            <div style="font-size: 24px; font-weight: 700; color: #fbbf24;">${player.finalResources.wood || 0}</div>
          </div>
          <div style="background: rgba(30, 41, 59, 0.8); padding: 15px; border-radius: 8px; text-align: center;">
            <div style="font-size: 24px; margin-bottom: 8px;">🪨</div>
            <div style="font-size: 14px; color: #94a3b8; margin-bottom: 5px;">Rock</div>
            <div style="font-size: 24px; font-weight: 700; color: #fbbf24;">${player.finalResources.rock || 0}</div>
          </div>
          <div style="background: rgba(30, 41, 59, 0.8); padding: 15px; border-radius: 8px; text-align: center;">
            <div style="font-size: 24px; margin-bottom: 8px;">⚙️</div>
            <div style="font-size: 14px; color: #94a3b8; margin-bottom: 5px;">Metal</div>
            <div style="font-size: 24px; font-weight: 700; color: #fbbf24;">${player.finalResources.metal || 0}</div>
          </div>
          <div style="background: rgba(30, 41, 59, 0.8); padding: 15px; border-radius: 8px; text-align: center;">
            <div style="font-size: 24px; margin-bottom: 8px;">🌾</div>
            <div style="font-size: 14px; color: #94a3b8; margin-bottom: 5px;">Food</div>
            <div style="font-size: 24px; font-weight: 700; color: #fbbf24;">${player.finalResources.food || 0}</div>
          </div>
          <div style="background: rgba(30, 41, 59, 0.8); padding: 15px; border-radius: 8px; text-align: center;">
            <div style="font-size: 24px; margin-bottom: 8px;">💰</div>
            <div style="font-size: 14px; color: #94a3b8; margin-bottom: 5px;">Coins</div>
            <div style="font-size: 24px; font-weight: 700; color: #fbbf24;">${player.finalResources.coins || 0}</div>
          </div>
          <div style="background: rgba(30, 41, 59, 0.8); padding: 15px; border-radius: 8px; text-align: center;">
            <div style="font-size: 24px; margin-bottom: 8px;">⚔️</div>
            <div style="font-size: 14px; color: #94a3b8; margin-bottom: 5px;">Soldiers</div>
            <div style="font-size: 24px; font-weight: 700; color: #fbbf24;">${player.finalSoldiers || 0}</div>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// =================== Raid Notification ===================
function showRaidNotification(raidReport) {
  if (!raidReport) return;

  const modal = document.getElementById('raidNotificationModal');
  if (!modal) return;

  const targetPlayer = raidReport.playerId || 'Unknown';
  const outcome = raidReport.outcome || 'unknown';
  const isMercenaryRaid = raidReport.isMercenaryRaid || false;
  const isHirer = isMercenaryRaid && raidReport.hirerId === ME;

  // Determine the age for the image
  const targetAge = raidReport.age || (PLAYERS[targetPlayer]?.age) || 'Wood';

  // Set the raid image based on age
  const raidImage = document.getElementById('raidImage');
  if (raidImage) {
    raidImage.src = `/media/Raid ${targetAge}.png`;
  }

  // Set outcome text and styling (different for hirer)
  const outcomeText = document.getElementById('raidOutcomeText');
  const outcomeBadge = document.getElementById('raidOutcomeBadge');
  if (outcomeText && outcomeBadge) {
    if (isHirer) {
      // Special display for the player who hired mercenaries
      outcomeText.textContent = '💰 MERCENARIES VICTORIOUS';
      outcomeText.parentElement.style.background = 'linear-gradient(135deg, #fdba74 0%, #fb923c 100%)';
      outcomeText.parentElement.style.color = '#78350f';
    } else if (outcome === 'defended') {
      outcomeText.textContent = '🛡️ REPELLED';
      outcomeText.parentElement.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
      outcomeText.parentElement.style.color = '#fff';
    } else {
      outcomeText.textContent = '⚔️ BREACHED';
      outcomeText.parentElement.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
      outcomeText.parentElement.style.color = '#fff';
    }
  }

  // Set target player (different message for hirer)
  const targetElement = document.getElementById('raidTargetPlayer');
  if (targetElement) {
    if (isHirer) {
      targetElement.textContent = `Your mercenaries successfully raided ${targetPlayer}!`;
      targetElement.style.color = '#fdba74';
    } else {
      targetElement.textContent = `${targetPlayer} was attacked!`;
      targetElement.style.color = '#fbbf24';
    }
  }

  // Set raid details from lore
  const detailsText = document.getElementById('raidDetailsText');
  if (detailsText) {
    let details = '';

    if (isHirer) {
      // Show special message for hirer with resource breakdown
      details = `<div style="font-size: 15px; font-weight: 700; color: #fbbf24; margin-bottom: 12px;">Your hired mercenaries have returned from ${targetPlayer}'s settlement!</div>`;

      details += raidReport.lore || 'The raid was successful.';

      // Show hirer's gains
      if (raidReport.hirerGains && Object.keys(raidReport.hirerGains).length > 0) {
        const gainsList = Object.entries(raidReport.hirerGains)
          .filter(([, val]) => val > 0)
          .map(([key, val]) => `<span style="color: #10b981; font-weight: 700;">${val} ${key}</span>`)
          .join(', ');

        if (gainsList) {
          details += `<br><br><div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 6px; padding: 12px; margin-top: 10px;">`;
          details += `<strong style="color: #10b981;">💎 Your Share (70%):</strong> ${gainsList}`;
          details += `</div>`;
        }
      }

      // Show mercenary cut
      if (raidReport.mercenaryCut && Object.keys(raidReport.mercenaryCut).length > 0) {
        const cutList = Object.entries(raidReport.mercenaryCut)
          .filter(([, val]) => val > 0)
          .map(([key, val]) => `<span style="color: #94a3b8;">${val} ${key}</span>`)
          .join(', ');

        if (cutList) {
          details += `<div style="background: rgba(71, 85, 105, 0.1); border: 1px solid rgba(71, 85, 105, 0.3); border-radius: 6px; padding: 12px; margin-top: 8px;">`;
          details += `<strong style="color: #94a3b8;">⚔️ Mercenary Fee (30%):</strong> ${cutList}`;
          details += `</div>`;
        }
      }
    } else {
      // Standard raid notification for other players
      details = raidReport.lore || 'A raid occurred.';

      // Add stolen resources if any
      if (raidReport.stolen && Object.keys(raidReport.stolen).length > 0) {
        const stolenItems = Object.entries(raidReport.stolen)
          .filter(([, val]) => val > 0)
          .map(([key, val]) => `${val} ${key}`)
          .join(', ');
        if (stolenItems) {
          details += `<br><br><strong style="color: #ef4444;">Stolen:</strong> ${stolenItems}`;
        }
      }

      // Add destroyed buildings if any
      if (raidReport.collapsed && raidReport.collapsed.length > 0) {
        details += `<br><br><strong style="color: #ef4444;">Buildings Destroyed:</strong> ${raidReport.collapsed.join(', ')}`;
      }
    }

    detailsText.innerHTML = details;
  }

  // Show the modal
  modal.classList.remove('hidden');
}

// =================== New: Player Dispatch & Return Notifications ===================
function showDispatchNotification(data){
  const modal = document.getElementById('raidNotificationModal');
  if (!modal) return;

  // Set image to the dispatch artwork
  const raidImage = document.getElementById('raidImage');
  if (raidImage) raidImage.src = data?.image || '/media/Dispatched.png';

  // Badge styling
  const outcomeText = document.getElementById('raidOutcomeText');
  if (outcomeText) {
    outcomeText.textContent = '⚔️ ARMY DISPATCHED';
    outcomeText.parentElement.style.background = 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)';
    outcomeText.parentElement.style.color = '#78350f';
  }

  // Header line
  const targetElement = document.getElementById('raidTargetPlayer');
  if (targetElement) {
    targetElement.textContent = `${data.playerId} has dispatched his army to conquer!`;
    targetElement.style.color = '#fbbf24';
  }

  // Details: lore + force size
  const detailsText = document.getElementById('raidDetailsText');
  if (detailsText) {
    const forceLine = `<div style="margin-top:6px; opacity:0.9;">Force: <strong>${data.committed||0} soldiers</strong>. They will return when the season changes.</div>`;
    const lore = data.lore || data.message || '';
    detailsText.innerHTML = `${lore ? lore : 'An army marches under your banner.'}${forceLine}`;
  }

  modal.classList.remove('hidden');
}

function showRaidReturnNotification(data){
  const modal = document.getElementById('raidNotificationModal');
  if (!modal) return;

  // Use same dispatch image for return as requested
  const raidImage = document.getElementById('raidImage');
  if (raidImage) raidImage.src = data?.image || '/media/Dispatched.png';

  const outcomeText = document.getElementById('raidOutcomeText');
  if (outcomeText) {
    const win = String(data.outcome||'').toLowerCase()==='success';
    outcomeText.textContent = win ? '🎉 VICTORY' : '💀 DEFEAT';
    if (win) {
      outcomeText.parentElement.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
      outcomeText.parentElement.style.color = '#fff';
    } else {
      outcomeText.parentElement.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
      outcomeText.parentElement.style.color = '#fff';
    }
  }

  const targetElement = document.getElementById('raidTargetPlayer');
  if (targetElement) {
    targetElement.textContent = `${data.playerId}'s army has returned`;
    targetElement.style.color = '#fbbf24';
  }

  const detailsText = document.getElementById('raidDetailsText');
  if (detailsText) {
    const lore = data.lore || '';
    const lootEntries = data.loot ? Object.entries(data.loot).filter(([,v])=>v>0) : [];
    const lootStr = lootEntries.length ? lootEntries.map(([k,v])=>`${v} ${k}`).join(', ') : '';
    const lossesStr = (data.casualties>0) ? `${data.casualties} soldiers` : '';

    let html = '';
    if (lore) html += lore;
    if (lootStr) html += `${html?'<br><br>':''}<strong style="color:#10b981;">Loot:</strong> ${lootStr}`;
    if (lossesStr) html += `${html?'<br><br>':''}<strong style="color:#ef4444;">Losses:</strong> ${lossesStr}`;
    if (!html) html = 'The army returned with no notable outcome.';

    detailsText.innerHTML = html;
  }

  modal.classList.remove('hidden');
}

// Socket events for the new notifications
socket.on('raidDispatched', (data)=>{
  try{ showDispatchNotification(data); }catch(e){}
});

socket.on('raidReturn', (data)=>{
  try{ showRaidReturnNotification(data); }catch(e){}
});







