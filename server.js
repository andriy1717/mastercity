
import express from "express";
import http from "http";
import { Server } from "socket.io";
import fs from "fs";
import path from "path";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors:{ origin:"*" } });
app.use(express.static("public"));
let PORT = Number(process.env.PORT) || 3000;

// ===== Helper: Generate random visitor lore message =====
function generateVisitorLore(senderName, senderCiv) {
  const loreMessages = [
    `Greetings! I am a trader from the ${senderCiv} civilization. Our great leader ${senderName} has sent me to you with the hope of fostering good trade relations between our peoples.`,
    `Hail, friend! I come from ${senderName}'s lands, a humble merchant seeking to establish trade routes. I bring exotic goods and the goodwill of the ${senderCiv}!`,
    `Good day to you. I am but a weary visitor who got lost on the road. I merely seek a place to rest for the night and perhaps some food before I continue my journey.`,
    `Traveler approaching! I am a wandering trader who has heard tales of your prosperous city. Might you have some time to do business with an honest merchant?`,
    `Peace be upon your gates! ${senderName} of the ${senderCiv} sends their regards. I am tasked with delivering their offer of friendship and trade to your people.`,
    `A stranger at your doorstep! I've been traveling for weeks and my supplies have run thin. Could you spare some food? I would be most grateful and can offer fair trade in return.`,
    `Salutations! I represent the ${senderCiv} trading guild. Our records show you are a skilled ruler, and ${senderName} believes our civilizations could benefit from mutual cooperation.`,
    `Hello there! Just a simple peddler passing through your territory. I carry news from distant lands and goods from ${senderName}'s markets. Might we talk business?`
  ];
  return loreMessages[Math.floor(Math.random() * loreMessages.length)];
}

// =================== Config (v8 + Seasons) ===================
const AGES = ["Wood","Stone","Modern"];
// Logs directory for per-game AI logs
const LOGS_DIR = path.join(process.cwd(), "logs");
function ensureLogsDir(){ try{ if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR,{ recursive:true }); }catch(e){} }
function writeAiLogLine(room, text){
  if (!room?.logFilePath) return;
  const ts = new Date().toISOString();
  const line = `[${ts}] ${text}\n`;
  try{ fs.appendFile(room.logFilePath, line, ()=>{}); }catch(e){}
}
function writeSessionLog(room, text){
  if (!room?.sessionLogPath) return;
  const ts = new Date().toISOString();
  const line = `[${ts}] ${text}\n`;
  try{ fs.appendFileSync(room.sessionLogPath, line, 'utf8'); }catch(e){ console.error('Session log error:', e); }
}


// Seasons: order, gather multipliers, and a single event per season (at most)
// Each season gets 1 positive and 1 negative bonus (25-75% range), other resources stay at 1.0
const SEASON_ORDER = ["Spring","Summer","Autumn","Winter"];
const SEASON_BONUS_MIN = 0.25; // Minimum 25% bonus/penalty
const SEASON_BONUS_MAX = 0.50; // Maximum 50% bonus/penalty (range: 0.5x to 1.5x)

// Season themes define which resources are more likely to be affected
const SEASON_THEMES = {
  Spring: { positive: ["food", "wood"], negative: ["rock", "metal"] },
  Summer: { positive: ["wood", "metal"], negative: ["food", "rock"] },
  Autumn: { positive: ["food", "rock"], negative: ["wood", "metal"] },
  Winter: { positive: ["rock", "metal"], negative: ["food", "wood"] }
};

// Seasonal Lore Messages - 10+ diverse messages for each resource/effect combination
const SEASONAL_LORE = {
  food: {
    positive: [
      "the harvest was abundant",
      "farmers rejoiced as crops grew exceptionally well",
      "the fields yielded far more than expected",
      "bountiful rains nurtured the soil",
      "livestock thrived and multiplied",
      "orchards bore fruit in unprecedented numbers",
      "grain stores swelled beyond capacity",
      "fertile lands blessed every seed planted",
      "fish swarmed the rivers in great schools",
      "wild game became plentiful in the forests",
      "beekeepers celebrated record honey yields",
      "vegetable gardens flourished magnificently"
    ],
    negative: [
      "the harvest suffered greatly",
      "crops withered in the fields",
      "famine threatened as food production plummeted",
      "drought parched the farmlands",
      "locusts descended upon the crops",
      "blight spread through the granaries",
      "livestock fell ill in great numbers",
      "floods swept away the fields",
      "early frosts destroyed the harvest",
      "vermin infested the food stores",
      "rivers ran dry, killing the fish",
      "disease ravaged the herds"
    ]
  },
  wood: {
    positive: [
      "the forests provided abundant timber",
      "woodcutters found exceptionally tall trees",
      "timber stocks grew rapidly",
      "new groves were discovered nearby",
      "fallen trees from storms provided easy lumber",
      "the woods grew thick and strong",
      "logging camps reported record yields",
      "ancient forests revealed hidden stands",
      "saplings matured faster than ever before",
      "dense thickets offered premium hardwood",
      "timber floated easily down swollen rivers",
      "forest paths opened to virgin woodlands"
    ],
    negative: [
      "timber became increasingly scarce",
      "the forests yielded disappointing returns",
      "logging operations faced severe setbacks",
      "wildfires consumed vast swaths of woodland",
      "trees grew thin and brittle",
      "woodcutters' axes broke against hardened bark",
      "lumber roads became impassable",
      "parasites infected the tree trunks",
      "storms toppled trees into ravines beyond reach",
      "the wood warped and cracked as it dried",
      "dense undergrowth choked the timber stands",
      "flooding made forest access impossible"
    ]
  },
  rock: {
    positive: [
      "quarries revealed rich veins of stone",
      "stone extraction improved dramatically",
      "miners uncovered superior quality rock",
      "new quarry sites were discovered",
      "rockfalls exposed pristine marble",
      "the mountains yielded generously",
      "limestone deposits proved vast",
      "granite blocks split cleanly and true",
      "cliff faces crumbled into perfect slabs",
      "underground caverns revealed rare stone",
      "avalanches deposited accessible boulders",
      "erosion uncovered ancient quarries"
    ],
    negative: [
      "heavy rains flooded the quarries",
      "stone production dropped alarmingly",
      "mines had to close due to poor conditions",
      "rockslides buried the extraction sites",
      "the stone cracked and crumbled easily",
      "seams ran dry throughout the region",
      "miners struck only soft, useless rock",
      "cave-ins threatened all operations",
      "the ground proved too hard to work",
      "veins of ore turned to worthless clay",
      "winter frost shattered the stone faces",
      "underground water weakened the formations"
    ]
  },
  metal: {
    positive: [
      "forges burned hotter than ever",
      "new ore deposits were discovered",
      "metal production soared magnificently",
      "veins of pure ore appeared in the mines",
      "smelting techniques improved dramatically",
      "iron flowed freely from the furnaces",
      "copper and tin were found in abundance",
      "the earth revealed its mineral treasures",
      "smiths mastered new alloy techniques",
      "ore quality exceeded all expectations",
      "rich lodes appeared near the surface",
      "ancient mines were reopened successfully"
    ],
    negative: [
      "the forges struggled to maintain heat",
      "ore became extremely difficult to extract",
      "metal production declined sharply",
      "mines collapsed, trapping equipment",
      "the ore proved impure and brittle",
      "fuel shortages forced furnaces to close",
      "smelting failures wasted precious materials",
      "seeps of water extinguished the forges",
      "metal corroded rapidly in storage",
      "veins played out across all sites",
      "poisonous gases drove miners from the shafts",
      "equipment failures halted all operations"
    ]
  }
};

const SEASONS_LIST = ["Spring", "Summer", "Autumn", "Winter"];

const SEASONS = {
  Spring: {
    mult:{ wood:1.0, rock:1.0, metal:1.0, food:1.0 }, // Will be randomized
    event:{ kind:"good", text:"Spring rains nurture the fields.", apply:p=>p.resources.food = (p.resources.food||0) + 6 }
  },
  Summer: {
    mult:{ wood:1.0, rock:1.0, metal:1.0, food:1.0 },
    event:{ kind:"bad", text:"Heat wave withers crops.", apply:p=>{ const loss=Math.min(p.resources.food||0, 5); p.resources.food=(p.resources.food||0)-loss; } }
  },
  Autumn: {
    mult:{ wood:1.0, rock:1.0, metal:1.0, food:1.0 },
    event:{ kind:"good", text:"Harvest season yields bounty.", apply:p=>p.resources.food = (p.resources.food||0) + 8 }
  },
  Winter: {
    mult:{ wood:1.0, rock:1.0, metal:1.0, food:1.0 },
    event:{ kind:"bad", text:"Frost kills vegetation.", apply:p=>{ const loss=Math.min(p.resources.food||0, 7); p.resources.food=(p.resources.food||0)-loss; } }
  }
};

const MONTH_LABELS = [
  "Early Spring",
  "Mid Spring",
  "Late Spring",
  "Early Summer",
  "High Summer",
  "Late Summer",
  "Harvest Dawn",
  "Harvest Peak",
  "Harvest Dusk",
  "Frostfall",
  "Deep Winter",
  "Thaw's Edge"
];

// Base tuning - balanced resource gathering
const BASE = {
  apPerTurn: 3,
  apBankLimit: 6,
  startingSoldiers: 3,
  baseSoldierCap: 6,
  yields: { wood: 5, rock: 4, metal: 2, food: 6 },
  tradeUnitPrice: { wood: 1, rock: 1, metal: 1, food: 1 },
  income: { perAge: 1 },
  upgradeMax: 3,
  upgradeStepPct: 0.08,
  upgradeCritChance: 0.03,
  soldierTraining: {
    Wood: { batchSize: 2, cost: { food: 25, coins: 5 } },
    Stone: { batchSize: 4, cost: { food: 50, coins: 10 } },
    Modern: { batchSize: 8, cost: { food: 100, coins: 25 } }
  },
  defense: {
    base: 0.05,
    perSoldier: 0.0025, // Doubled from 0.00125
    maxFromArmy: 0.5,
    wallRepairCosts: {
      none: {},
      wood: { wood: 6 },
      stone: { wood: 4, rock: 8 },
      steel: { rock: 8, metal: 6, coins: 3 }
    }
  },
  raid: {
    minCommit: 3,
    baseSuccess: 0.10,
    perSoldier: 0.0015,
    casualtyFloor: 0.12,
    lootMultiplier: { wood: 8, rock: 7, metal: 4, food: 9, coins: 5 }
  }
};

// Civilizations — meaningful but balanced trade-offs
const CIVS = {
  Vikings: { yieldMult:{ food:1.20, wood:0.95 }, coinPerTurnDelta: 0 },
  Romans:  { yieldMult:{ rock:1.15, metal:0.90 }, coinPerTurnDelta: 1 },
  Mongols: { yieldMult:{ metal:1.10, rock:0.90 }, coinPerTurnDelta: 0 },
  Slavs:   { yieldMult:{ wood:1.10, food:1.10, metal:0.85 }, coinPerTurnDelta: -1 }
};

// Raid Lore Stories - Age and Civilization specific
const RAID_LORE = {
  // DEFENSIVE STORIES - When player defends against tribal raids
  defense: {
    Vikings: {
      Wood: [
        "A band of frost-touched raiders emerged from the mist, axes gleaming. Your shieldwall held firm, and they retreated into the fog—bloodied but alive.",
        "Wild men from the north tested your palisades with fire and fury. Your warriors fought like wolves defending their den, driving them back to the frozen wastes.",
        "Berserkers charged your wooden walls, howling war-songs to Odin. Your archers rained death from the ramparts, sending them fleeing to their longships.",
        "A ragtag warband sought easy plunder, but found only iron resolve. Your defenders stood like the World Tree—unyielding, eternal.",
        "Thunder echoed as raiders clashed against your gates. The storm god smiled upon your warriors, and the attackers fled before Thor's wrath.",
        "Enemies came seeking gold and glory. They found neither—only your warriors' fury and the cold kiss of Nordic steel.",
        "Raiders thought your settlement easy prey. They learned the hard way that Vikings do not yield, not to kin nor stranger.",
        "A rival clan tested your strength with a dawn assault. Your warriors were awake, ready, and sent them limping home empty-handed.",
        "Wolves of the sea met wolves of the land. Your defenders proved fiercer, and the would-be raiders scattered like frightened gulls.",
        "They came with torches to burn your halls. They left with only wounds, their torches extinguished by Nordic rain and blood."
      ],
      Stone: [
        "Steel-clad warriors stormed your stone fortress, shields locked. Your defenders poured boiling pitch from above, breaking their formation and their will.",
        "A well-armed warband laid siege to your walls, rams battering at the gates. Your ballista answered with thunder, scattering them into the hills.",
        "Professional soldiers tested your defenses with ladder and rope. They found only stone, steel, and unbreakable resolve.",
        "An organized army approached with siege towers. Your catapults reduced their engines to kindling, and they retreated in disgrace.",
        "Mounted raiders circled your fortress like hungry wolves. Your archers darkened the sky with arrows, and they rode away nursing their losses.",
        "Mercenaries sought to breach your stone walls for promised gold. They earned only scars and the mockery of your warriors.",
        "A coordinated assault tested every gate and wall. Your defenders held at every point, shields locked, spears thrust, victory secured.",
        "Armored elites crashed against your fortifications like waves against cliffs. The cliffs remained. The waves broke.",
        "Professional raiders came with siegecraft and cunning. They met professionals—your defenders had both walls and wisdom.",
        "A winter assault sought to catch you unprepared. But Viking stone endures all seasons, and your guards never sleep."
      ],
      Modern: [
        "Advanced forces with gunpowder weapons assaulted your fortress. Your modern defenses and disciplined troops repelled them with coordinated firepower.",
        "An elite company tried to breach your steel-reinforced walls. Your defense grid activated perfectly, turning them back before they reached the gates.",
        "Well-equipped mercenaries with siege cannons targeted your stronghold. Your counterbattery fire silenced their guns, forcing a hasty withdrawal.",
        "A mechanized assault rolled toward your fortifications. Your defenders,trained in modern warfare, held every meter of ground.",
        "Professional soldiers with advanced tactics probed your defenses. They found a garrison equally modern, equally lethal, and twice as determined.",
        "Raiders equipped with industrial-age weapons learned that Viking ingenuity evolves. Your defenses were not ancient—they were perfected.",
        "An organized battalion thought technology would guarantee victory. Courage and steel walls proved stronger than their assumptions.",
        "Attackers with rifles and artillery met defenders with better positions, better training, and the fury of a thousand ancestors.",
        "Modern raiders sought plunder with modern weapons. They found modern defenses, ancestral courage, and total defeat.",
        "The age of gunpowder met the age of Viking resolve. Resolve won, as it always has, as it always will."
      ]
    },
    Romans: {
      Wood: [
        "Barbarians charged your crude fortifications with savage howls. Your disciplined militia formed testudo, shields locked, and they broke against Roman order.",
        "Wild raiders sought to pillage your granaries. They met the descendants of legionnaires—even in wood, Romans build to last and fight to win.",
        "A disorganized mob attacked your palisade. Your defenders stood in formation, gladii at the ready, and cut down any who breached the gate.",
        "Tribal warriors tested your wooden walls with fire. Roman engineers had already prepared—water channels doused every flame, and spears answered every assault.",
        "Raiders thought wooden defenses meant weakness. They learned Romans conquer the world not with gold walls, but with iron discipline.",
        "Enemies came expecting easy plunder. They found Roman military tradition alive even in simple timber fortifications.",
        "A raiding party stormed your settlement at dawn. Your guards, trained in the Roman way, repelled them with geometric precision.",
        "Attackers wielding crude weapons met defenders who remembered the glory of Rome. Wood may rot, but the legions are eternal.",
        "They saw timber walls and assumed vulnerability. They did not see Roman hearts beating behind those walls.",
        "Raiders fled when they heard the war-cry: 'Roma Invicta!' Even in the frontier, Rome never bends the knee."
      ],
      Stone: [
        "Organized soldiers besieged your Roman fortress with tactics and discipline. But no one outmaneuvers Rome—your counterattack was textbook perfection.",
        "A well-armed warband assaulted your stone walls with siege engines. Roman engineering held firm, and your ballistae shattered their machines.",
        "Professional mercenaries tested your defenses. They found walls built by masters of fortification, defended by masters of war.",
        "Enemies surrounded your fortress, confident in numbers. You opened the gates and sortied like Caesar himself—they broke and ran.",
        "A coordinated assault targeted your weakest wall. There were no weak walls. Every stone was placed by Roman hands, for Roman glory.",
        "Raiders came with scaling ladders and grappling hooks. They climbed into a storm of pila and oil, and descended as corpses.",
        "A siege meant to starve you lasted three days. On the fourth, your garrison emerged in formation and routed them utterly.",
        "Attackers brought rams and towers, confident in their craft. They did not account for Roman countermeasures—fire, stone, steel.",
        "An army tested every gate. Every gate held. Rome does not yield. Rome does not falter. Rome endures.",
        "They came expecting a battle. They received a lesson: you do not besiege Rome. Rome besieges you."
      ],
      Modern: [
        "Modern artillery bombarded your fortifications. Roman engineering, perfected over millennia, absorbed every shell. Your defenders held the line.",
        "An industrialized army sought to overwhelm you with firepower. They forgot that Rome conquered the ancient world with discipline—yours is no less fierce.",
        "Gunpowder and rifles clashed against stone and strategy. When the smoke cleared, the Roman standard still flew high.",
        "Attackers with advanced weapons thought technology would triumph. Roman legacy proved stronger—tactics, morale, unbreakable will.",
        "A modern assault force breached the outer wall. They met a counterattack so precise, so devastating, it could have been written by Caesar.",
        "Raiders with cannons thought stone obsolete. Roman engineers had modernized every fortification, every angle, every killing field.",
        "An elite battalion tried to storm your fortress. Roman discipline met modern firepower—and discipline never loses.",
        "They brought the latest weapons of war. You brought the oldest lesson of Rome: victory belongs to the prepared, the brave, the eternal.",
        "Attackers advanced under covering fire. Your defenders advanced under the eagles of Rome. The eagles won.",
        "The age changes. The weapons evolve. Rome endures, unconquered and unconquerable."
      ]
    },
    Mongols: {
      Wood: [
        "Rival horsemen rode down upon your camp, howling like demons. Your mounted archers wheeled and loosed—they fell like rain, and the survivors fled into the steppe.",
        "A raiding band sought to burn your yurts and steal your herds. They learned the Mongol bow has no equal, even behind wooden stakes.",
        "Enemies thought surprise would carry the day. They did not expect every Mongol to be born in the saddle, ready to fight at a moment's notice.",
        "Raiders charged your wooden palisade. Your warriors met them at full gallop, arrows singing, blades flashing—victory was swift and total.",
        "A warband approached under cover of dust. Your scouts had already seen them, and your warriors were waiting in ambush.",
        "They came seeking plunder. They found the descendants of Genghis Khan, and learned why the world once trembled at the Mongol name.",
        "Attackers thought wooden defenses meant weakness. They did not account for Mongol ferocity, speed, and fury.",
        "Raiders stormed your camp at dawn. By noon, their camp was ashes, and your banners flew over their former stronghold.",
        "A band of looters approached on foot. Mongol horses trampled them into the earth—never challenge the children of the steppe.",
        "They tested your walls. You tested your bows. They failed. You did not."
      ],
      Stone: [
        "A disciplined army marched upon your fortress, banners high. Your cavalry poured from the gates in a crescent formation, encircling and annihilating them.",
        "Siege engines rolled toward your stone walls. Mongol horsearchers made short work of the engineers, and the machines burned unmanned.",
        "Professional soldiers dug trenches and settled in for a long siege. You emerged on horseback, shattered their lines, and returned before they could regroup.",
        "An organized warband thought stone walls would make you predictable. They forgot Mongols fight on horseback, and horses don't respect walls.",
        "Attackers surrounded your fortress, confident. You sallied forth with mounted lancers, broke their formation, and chased them to the horizon.",
        "A well-armed force assaulted your gates. They found gates that opened—not in surrender, but to release Mongol cavalry like a thunderbolt.",
        "Raiders brought ladders and ropes. Your archers fired from horseback in the courtyard, making every scaling attempt a death sentence.",
        "They expected a static defense. They got a whirlwind—your riders struck from every angle, and they never recovered.",
        "A siege dragged on for days. On the seventh night, your horsemen slipped out, circled, and fell upon them from behind. It was over by dawn.",
        "They learned the hard way: Mongols do not hide behind walls. Walls are where Mongols keep their horses until it's time to destroy you."
      ],
      Modern: [
        "Modern soldiers with firearms laid siege to your stronghold. Your mounted riflemen harassed them day and night until they abandoned the assault.",
        "An industrialized army sought to pin you down. Mongol mobility proved timeless—your cavalry struck their supply lines until they starved.",
        "Attackers with cannons thought firepower would win. Mongol horsemen moved too fast for artillery to track, and sabotaged every gun emplacement.",
        "A mechanized force advanced with discipline. Your defenders struck like the ancient hordes—swift, everywhere, impossible to pin down.",
        "Professional troops dug in for a siege. Your mobile forces raided their camps nightly, and they withdrew in exhaustion and fear.",
        "They brought modern weapons. You brought Mongol tactics—speed, surprise, relentless pressure. The ancient ways still conquer.",
        "An organized battalion thought walls would hold you static. They learned Mongols never stay still, not in the age of Genghis, not in any age.",
        "Gunfire rained on your fortress. Your horsemen emerged through hidden gates, encircled the attackers, and left none alive to retreat.",
        "Raiders with rifles expected a defensive stand. They got a Mongol charge—fury, speed, and victory.",
        "The world changes. Weapons evolve. But the steppe remembers: Mongols conquered half the world on horseback. You still can."
      ]
    },
    Slavs: {
      Wood: [
        "Forest raiders crept through the trees, axes ready. Your hunters were already in the branches, arrows nocked—none of the attackers left the woods alive.",
        "A band of brigands sought to burn your village. They did not expect every Slav to be armed, every villager a warrior. They ran, screaming, into the dark.",
        "Wild men charged from the forest's edge. Your people melted into the trees, struck from shadows, and vanished. The raiders never saw their killers.",
        "Enemies torched your outer huts. Your defenders emerged from the mist with axes and fury, driving them back to the frozen rivers.",
        "They came seeking plunder. They found a people born of ice and forest, who do not yield, do not break, and do not forget.",
        "Raiders thought wooden walls meant weakness. Slavic wood is oak and iron-heart, and it does not burn easily.",
        "A warband assaulted at dusk. By dawn, their bodies fed the wolves, and your village stood unbroken.",
        "They underestimated the forest folk. Slavs know every tree, every trail, every shadow. The raiders learned this too late.",
        "Attackers came with torches. Your warriors came with cold steel and colder hearts. The torches went out. Permanently.",
        "They fled into the woods, thinking escape possible. The forest belongs to Slavs. No one escapes the forest."
      ],
      Stone: [
        "A professional army besieged your stone fortress. Your defenders held for weeks, then emerged in a blizzard and slaughtered the frozen besiegers.",
        "Organized soldiers battered your walls with rams. Your garrison poured down rocks, oil, and fury until the attackers broke and fled.",
        "Mercenaries thought gold would buy victory. Slavic stone and Slavic blood cannot be bought—only respected or feared.",
        "A coordinated assault targeted your gates. Your defenders opened them—not in surrender, but to pour forth like a river of blades.",
        "Raiders brought siege towers. Your defenders burned them with pitch and laughter, then descended to finish the survivors in close combat.",
        "They surrounded your fortress, confident in numbers. You held for a season, then emerged and hunted them through the snow until none remained.",
        "An army of professionals met an army of survivors. Slavs are always survivors. The professionals were not prepared for what that means.",
        "Attackers came with tactics and training. Your people came with ancestral fury and a thousand years of holding the line against invaders.",
        "A well-planned siege collapsed when your defenders sortied in a snowstorm, invisible and unstoppable.",
        "They learned the oldest lesson of the East: you do not invade Slavic lands. The land itself fights back."
      ],
      Modern: [
        "Modern artillery pounded your walls. Slavic endurance outlasted every shell, every assault, every desperate charge.",
        "An industrial army brought rifles and cannons. You brought the will of a people who survived every conqueror history ever sent.",
        "Attackers with advanced weapons learned that technology does not defeat spirit. Slavic defenders held every inch of ground.",
        "A mechanized assault rolled forward. Your garrison met them with modern weapons and ancient determination—they did not pass.",
        "Professional soldiers thought firepower would break you. They forgot that Slavs have never broken, not to Napoleon, not to anyone.",
        "Raiders with gunpowder met defenders with something stronger: the unbreakable will of a people who remember every invasion, every betrayal, every victory.",
        "They brought the weapons of a new age. You brought the fury of an old world. Old fury won.",
        "An organized battalion sought to overwhelm you. Slavic defenders fought like their grandfathers—unbreakable, relentless, victorious.",
        "Modern siege tactics met ancient defiance. The defiance endured. The siege did not.",
        "The world changes. Empires rise and fall. But Slavic lands remain, and Slavic people endure, unconquered."
      ]
    }
  },
  // BREACHED STORIES - When player's defenses fail
  breached: {
    Vikings: {
      Wood: [
        "Raiders overwhelmed your palisade, axes shattering timber. They took what they wanted and vanished into the mist, leaving only smoke and shame.",
        "Your shieldwall broke under relentless assault. The enemy plundered your stores, laughing as they sailed away with your winter's harvest.",
        "Berserkers breached the gates with savage fury. Your warriors fought bravely, but numbers and rage carried the day—for them.",
        "They came at dawn when the guards drowsed. By the time the horns sounded, half your granaries were already burning.",
        "Your wooden walls splintered beneath their rams. They took gold, grain, and glory—and left you with only lessons in blood.",
        "The raid was swift, brutal, efficient. Your defenders fell back, and the enemy feasted in your halls before the sun set.",
        "They outnumbered, outsmarted, outfought you. When they left, your settlement was poorer, bloodied, but still alive. Barely.",
        "Your archers loosed every arrow. It wasn't enough. Raiders stormed over the walls and took everything not nailed down.",
        "A rival jarl tested your defenses and found them wanting. You'll rebuild. You'll remember. You'll have vengeance—later.",
        "They struck like lightning from the sea, grabbed your treasures, and were gone before you could mount a true defense."
      ],
      Stone: [
        "Disciplined soldiers breached your fortress with siege engines and tactics. They looted your vaults and left your banners torn.",
        "Your stone walls held—but your gates did not. Raiders poured through, seizing coin and provisions before withdrawing in good order.",
        "A coordinated assault overwhelmed your defenses. They knew your weak points, exploited every gap, and took their prize.",
        "Mercenaries with siege towers scaled your walls. Your defenders fought hard, but gold and skill won the day—for the enemy.",
        "They battered your fortress for days. When the walls finally cracked, they poured in like a flood, unstoppable and merciless.",
        "Professional soldiers outmaneuvered your garrison. They seized your treasury, burned your armory, and withdrew before reinforcements arrived.",
        "Your defenses were strong—but theirs were stronger. They breached, plundered, and left you counting losses and dead.",
        "A well-planned assault shattered your gates. Raiders took what they came for and disappeared into the mountains.",
        "They knew siege warfare better than you did. When the dust settled, your fortress was intact—but your pride and wealth were gone.",
        "Your warriors fought to the last arrow, the last sword, the last breath. It wasn't enough. The raiders took everything."
      ],
      Modern: [
        "Artillery shattered your outer defenses. Professional soldiers stormed in, seized industrial resources, and withdrew under covering fire.",
        "Modern tactics and firepower overwhelmed your garrison. They plundered your steel reserves and left your fortifications smoking.",
        "A coordinated assault with rifles and explosives breached your walls. They looted your armories and vanished before you could regroup.",
        "Advanced forces hit you where it hurt—supply depots, munitions, coin. Your defenses were modern, but theirs were better.",
        "They came with cannons and discipline. Your walls fell, your defenders retreated, and the enemy claimed their prize.",
        "A mechanized assault rolled through your gates. They took everything of value and left your fortress in ruins.",
        "Professional soldiers with superior firepower crushed your defense. They seized your resources and withdrew with military precision.",
        "Your modern defenses met a more modern enemy. When the smoke cleared, they had your wealth and you had only rubble.",
        "Gunfire, explosives, chaos—your garrison fought bravely but was outmatched. The raiders took what they wanted and left you broken.",
        "They struck with industrial-age efficiency. Your fortress held—but your supplies, your gold, your pride did not."
      ]
    },
    Romans: {
      Wood: [
        "Barbarian hordes overwhelmed your timber defenses with sheer ferocity. They burned, looted, and fled before Roman discipline could rally.",
        "Your palisade held briefly, then collapsed under relentless assault. Raiders took grain, coin, and dignity before withdrawing.",
        "Wild tribesmen swarmed your gates, ignoring casualties. Roman formations broke, and they plundered your stores.",
        "They struck at night, torches blazing. By dawn, half your settlement was ash and the raiders were gone with your treasury.",
        "Your guards fought in formation, but there were too many enemies, too few defenders. The raiders took their fill.",
        "Rome's might was not enough today. The enemy breached, looted, and left you to rebuild from the ruins.",
        "Barbarians crashed through your wooden walls like a flood. Roman discipline could not hold back the tide.",
        "They came for plunder and found it. Your defenders fell back, regrouped, but the damage was done.",
        "A disorganized mob became an unstoppable wave. They overwhelmed your fortifications and stole everything of value.",
        "Your settlement burned. Raiders carried off coin and provisions. Rome will remember this—and Rome will have vengeance."
      ],
      Stone: [
        "Organized enemies besieged your fortress and broke through with siege engines. They looted your vaults and left your eagles trampled.",
        "Professional soldiers outmaneuvered Roman tactics. They breached your walls, seized your treasury, and withdrew victoriously.",
        "A coordinated assault shattered your gates. Raiders poured in, took what they wanted, and escaped before you could counterattack.",
        "They knew Roman weaknesses—and exploited every one. Your fortress stood, but your wealth and pride were lost.",
        "Mercenaries with gold and skill breached your defenses. They looted your armories and left you counting your dead.",
        "Your stone walls held for days, then crumbled under relentless assault. The enemy took everything Rome had built here.",
        "A well-armed force overwhelmed your garrison. They plundered your city and left your banners in the mud.",
        "Your defenders fought with Roman discipline, but superior numbers and tactics won the day—for the enemy.",
        "They besieged, they breached, they looted. Rome will rebuild, but today belongs to them.",
        "Your fortress fell. Raiders seized coin, grain, steel. Rome does not forget defeat—vengeance will come."
      ],
      Modern: [
        "Modern artillery reduced your defenses to rubble. Enemy soldiers looted your industrial resources and withdrew under fire.",
        "Advanced tactics and firepower overwhelmed Roman engineering. They breached, plundered, and left your fortress in ruins.",
        "A coordinated assault with modern weapons shattered your garrison. They took your steel, your coin, your pride.",
        "Your defenses were strong—but not strong enough. The enemy seized your resources with military efficiency.",
        "Gunpowder and discipline crushed Roman stone. They looted your armories and left your eagles broken.",
        "Professional forces outgunned and outmaneuvered you. When the smoke cleared, they had your wealth.",
        "A mechanized assault breached your walls. They plundered everything of value and vanished into the hills.",
        "Modern warfare proved superior today. Your garrison fell, your treasury was looted, your pride was shattered.",
        "They struck with rifles, cannons, and ruthless efficiency. Rome will rebuild—but today, Rome bleeds.",
        "Your fortress crumbled under modern firepower. The enemy took what they wanted. Rome will remember."
      ]
    },
    Mongols: {
      Wood: [
        "Rival horsemen outmaneuvered your scouts and struck your camp at full gallop. They took your herds and vanished into the steppe.",
        "Raiders hit your wooden defenses like a storm. Your warriors fought from horseback, but numbers overwhelmed you.",
        "A better-mounted force encircled your camp and picked you apart. They looted your supplies and rode away laughing.",
        "They came from three directions at once. Your warriors were fast, but the enemy was faster.",
        "Your mounted archers loosed every arrow. It wasn't enough—the raiders breached your camp and took everything.",
        "A steppe warband caught you off-guard. They plundered your yurts and were gone before you could mount a true pursuit.",
        "They struck at dawn, horses thundering. Your defenders fought bravely, but the enemy took what they wanted.",
        "Rival clans united against you. Your camp fell, your stores were looted, your horses stolen.",
        "They outflanked, outran, and outlasted you. When the dust settled, your camp was empty and your pride broken.",
        "The steppe is cruel. Today, it favored your enemies. Tomorrow, the fury of the Mongols will answer."
      ],
      Stone: [
        "Disciplined cavalry encircled your fortress and harassed you relentlessly. When supplies ran low, they breached and looted.",
        "Raiders with siege tactics overwhelmed your stone walls. They took your treasures and rode away before you could regroup.",
        "A coordinated assault pinned you inside while cavalry raided your supply lines. When they breached, you had nothing left to fight with.",
        "Professional soldiers used Mongol tactics against you. They struck fast, looted faster, and were gone.",
        "Your horsemen sallied forth—into an ambush. While you fought outside, raiders breached from behind.",
        "They knew every trick you knew, and a few more. Your fortress fell, your wealth was taken.",
        "A rival khan's forces overwhelmed your defenses with superior numbers and tactics. They took everything.",
        "Your stone walls held—but your gates did not. Raiders poured through and plundered your vaults.",
        "They besieged you until hunger forced your hand. When you opened the gates, they took what they wanted.",
        "The steppe breeds the best raiders. Today, they were better than you. Tomorrow will be different."
      ],
      Modern: [
        "Modern cavalry with rifles overwhelmed your defenses. They looted your industrial supplies and vanished into the plains.",
        "Advanced forces used Mongol mobility with modern firepower. They breached, plundered, and withdrew before you could respond.",
        "A mechanized assault struck your fortress with lightning speed. They took your steel and left you with ruin.",
        "Professional soldiers on horseback harassed your defenses until they broke. Then they looted everything.",
        "Your mounted riflemen fought bravely, but the enemy had better tactics, better weapons, better luck.",
        "They struck with modern weapons and ancient fury. Your defenses crumbled, your wealth was seized.",
        "A coordinated assault with firearms overwhelmed your garrison. They plundered and rode away victorious.",
        "Modern warfare met Mongol tactics—and you lost. They took your resources and left you broken.",
        "They hit you with gunfire and cavalry charges. Your fortress fell, your treasury was looted.",
        "The enemy proved that Mongol tactics never die—they evolve. Today, they evolved past you."
      ]
    },
    Slavs: {
      Wood: [
        "Forest raiders knew the woods as well as you did. They struck from the shadows and took your winter stores.",
        "A band of brigands overwhelmed your wooden defenses with sheer numbers. They looted and vanished into the mist.",
        "Wild men charged from the treeline, axes swinging. Your defenders fought hard, but the enemy took what they wanted.",
        "They burned your outer huts and stole your provisions. The forest gave them cover, and they used it well.",
        "Your hunters became the hunted. Raiders ambushed your patrols and plundered your village unchallenged.",
        "A warband stormed your palisade at dusk. By dawn, they were gone—and so were your supplies.",
        "They knew every trail, every hiding spot. When they struck, you never saw them coming.",
        "Raiders melted into the forest after the assault, carrying your grain and coin. The trees swallowed them whole.",
        "Your warriors fought like demons, but the enemy had demons of their own—and more of them.",
        "They came from the frozen north, took what they wanted, and disappeared. The forest keeps its secrets."
      ],
      Stone: [
        "Professional soldiers besieged your fortress and broke through after weeks of attrition. They looted your vaults and left.",
        "Organized raiders overwhelmed your stone defenses with superior tactics. They took your treasury and withdrew.",
        "A coordinated assault shattered your gates. Raiders poured in, seized your coin and grain, then vanished.",
        "Mercenaries with siege engines battered your walls until they fell. They plundered everything of value.",
        "Your defenders held for days, then hunger and exhaustion broke them. The enemy took what they came for.",
        "A well-armed force breached your fortress with discipline and skill. They looted your stores and left you broken.",
        "Your stone walls were strong—but not strong enough. Raiders took your wealth and left you with only rubble.",
        "They knew siege warfare better than you. When your defenses fell, they plundered without mercy.",
        "A blizzard hid their approach. When they struck, you were unprepared. They took everything.",
        "Your fortress fell to superior numbers and tactics. Slavic lands will remember—and revenge will come."
      ],
      Modern: [
        "Modern artillery shattered your defenses. Professional soldiers looted your industrial resources and withdrew.",
        "Advanced forces with rifles and cannons overwhelmed your garrison. They took your steel, your coin, your pride.",
        "A mechanized assault breached your walls. Raiders plundered your armories and left your fortress smoking.",
        "Professional soldiers outgunned and outmaneuvered you. They seized your wealth with ruthless efficiency.",
        "Gunpowder and modern tactics crushed your defenses. The enemy took what they wanted and left you in ruins.",
        "Your garrison fought to the last bullet, but the enemy had more bullets, more men, more luck.",
        "A coordinated assault with modern weapons shattered your fortress. They looted everything of value.",
        "Modern warfare proved superior today. Your defenses fell, your treasury was seized.",
        "They struck with industrial-age firepower. Your fortress crumbled, your wealth was taken.",
        "The enemy won today—but Slavic people never forget. Vengeance is patient. Vengeance is eternal."
      ]
    }
  },
  // PLAYER RAID SUCCESS - When player's raid succeeds
  raidSuccess: {
    Vikings: {
      Wood: ["Your raiders returned victorious, longships heavy with plunder. The enemy never saw the dragon-ships coming.", "A swift raid under cover of mist brought glory and gold. Your warriors sing of the easy victory in the mead halls."],
      Stone: ["Your war-band stormed the tribal camp with coordinated fury. They took everything worth taking and burned the rest.", "Viking steel and stone-backed tactics crushed the defenders. Your raiders returned with wagons full of spoils."],
      Modern: ["Modern Viking forces struck with precision and withdrew before reinforcements arrived. A textbook raid—swift, brutal, profitable."]
    },
    Romans: {
      Wood: ["Your legion raided with Roman discipline. The enemy scattered before your testudo formation, leaving their supplies undefended.", "Roman tactics prevailed over tribal chaos. Your soldiers returned in formation, carrying plunder and pride."],
      Stone: ["A perfectly executed raid—Caesar himself would approve. Your forces struck, plundered, and withdrew without a single casualty.", "Roman military precision turned a simple raid into a masterclass. The enemy never stood a chance."],
      Modern: ["Your forces executed a modern assault with Roman efficiency. The raid succeeded beyond expectations—victory and vengeance in one stroke."]
    },
    Mongols: {
      Wood: ["Your horsemen swept through the enemy camp like a whirlwind. They took everything and were gone before the dust settled.", "Mongol mobility proved decisive. Your riders struck from three directions, plundered the camp, and vanished into the steppe."],
      Stone: ["A lightning cavalry raid shattered enemy defenses. Your horsemen returned with plunder and tales of total victory.", "Classic Mongol tactics—strike fast, hit hard, take everything. The enemy is still trying to figure out what happened."],
      Modern: ["Your mounted riflemen combined ancient tactics with modern weapons. The raid was over before it began—total victory."]
    },
    Slavs: {
      Wood: ["Your warriors emerged from the forest, struck the enemy camp, and melted back into the trees with all their supplies.", "A brutal forest raid left the enemy with nothing. Your people know these woods—the enemy did not."],
      Stone: ["Slavic fury and stone-backed strength crushed the tribal defenders. Your raiders returned laden with spoils.", "A winter raid caught the enemy unprepared. Your warriors took everything and left only frozen corpses."],
      Modern: ["Your forces struck with Slavic determination and modern firepower. The raid succeeded completely—supplies, weapons, glory."]
    }
  },
  // PLAYER RAID FAILURE - When player's raid fails
  raidFailure: {
    Vikings: {
      Wood: ["Your raiders met fierce resistance. They withdrew with heavy losses and no plunder—a dark day for the clan.", "The enemy was ready. Your warriors fought bravely but returned empty-handed, bloodied and ashamed."],
      Stone: ["Even Viking stone could not break their defenses. Your raiders retreated, counting casualties instead of coin.", "The raid failed. Your warriors limped home with nothing to show but wounds and hard lessons."],
      Modern: ["Superior defenses repelled your modern assault. Your forces withdrew in defeat, having gained nothing but respect for the enemy."]
    },
    Romans: {
      Wood: ["The enemy proved more organized than expected. Your legion withdrew in good order, but without plunder or glory.", "Roman discipline could not overcome superior numbers. Your soldiers returned alive—but defeated."],
      Stone: ["The raid faltered against unexpected defenses. Roman tactics demand retreat when victory is impossible—today was such a day.", "Your forces met a prepared enemy and withdrew strategically. No plunder, but the legion survived to fight again."],
      Modern: ["Modern defenses proved superior. Your assault failed, your troops withdrew. Rome will remember this setback."]
    },
    Mongols: {
      Wood: ["The enemy ambushed your horsemen. Your riders escaped, but left dead and wounded behind—and all the plunder.", "Speed was not enough today. Your raid failed against prepared defenses, and your warriors returned empty-handed."],
      Stone: ["Enemy cavalry countered your tactics. The raid collapsed, and your survivors limped home defeated.", "The steppe teaches harsh lessons. Today's lesson: the enemy was better prepared than you thought."],
      Modern: ["Modern defenses neutralized Mongol mobility. Your raid failed, your casualties mounted, your warriors retreated."]
    },
    Slavs: {
      Wood: ["The forest did not protect your raiders today. The enemy fought back fiercely, and your warriors withdrew in defeat.", "A failed raid—your warriors returned bleeding, empty-handed, and humbled."],
      Stone: ["Stone walls met stone defenses. Your raid broke against their fortifications, and your survivors retreated.", "Slavic determination met equal determination. The raid failed, casualties were heavy, glory was nonexistent."],
      Modern: ["Modern weapons met modern defenses. Your assault failed, your troops withdrew. The enemy won this round."]
    }
  }
};

<<<<<<< HEAD
=======
const DEFEAT_LORE = [
  "Your army marched confidently into battle, but their confidence turned to chaos when the enemy's tactics proved superior. They were routed in a embarrassing retreat, with many soldiers not making it back home.",
  "The battle started well, but the enemy commander was far more cunning than expected. Your soldiers found themselves surrounded and were forced to flee for their lives.",
  "Your army's strategy seemed solid at first, but the enemy's reinforcements arrived faster than anticipated. Outnumbered and outmaneuvered, your soldiers broke ranks and scattered.",
  "The clash of steel was fierce, but your army was simply outmatched. After a brutal exchange, your soldiers wisely chose retreat over certain death.",
  "Your forces charged with fury, but the enemy's defensive formation held strong. After suffering heavy losses, your commanders ordered a desperate retreat.",
  "What was supposed to be a swift victory turned into a nightmare. The enemy's superior archers rained down arrows that decimated your army before they could close in.",
  "Your army fought valiantly, but sheer bad luck cost them dearly. Just when victory seemed close, the ground gave way under your troops' feet, and they tumbled into disarray.",
  "The enemy leader proved to be a tactical genius. Your army fell for clever feints and ambush tactics that left them confused and fleeing in shame.",
  "Your soldiers marched to battle with high spirits, but the morale shattered when they saw the size of the enemy force. They wisely chose discretion over valor and retreated.",
  "The battle was decided in the first few minutes when your cavalry charge was halted by a wall of spikes. Demoralized, your army fell back in defeat."
];

// War Outcome Prediction Lore - Historical events based on civilization and success chance
const WAR_OUTCOME_LORE = {
  Romans: {
    veryUnlikely: [
      "The Roman legionaries marched confidently forth, yet fate conspired against them. At Cannae, Hannibal's forces encircled 80,000 Roman soldiers, crushing them utterly—50,000 fell that day. Your army echoes their doom. **Advisors urge extreme caution.**",
      "Remember the Varian Disaster—Arminius destroyed three entire legions in the Teutoburg Forest, 20,000 men lost in a single ambush. The Germanic warriors overwhelmed Rome's finest. Your scouts report similar terrain ahead. **Do not march.**",
      "When Caesar's legions failed to recognize the strength of Pompey, they were routed at Dyrrhachium. Outnumbered and outmaneuvered, Roman discipline cracked. The odds are similarly grim. **Retreat is wisdom.**"
    ],
    unlikely: [
      "When Crassus marched into Parthia with 40,000 soldiers, he found 10,000 Parthian archers. Arrows rained from afar, and Rome suffered a catastrophic defeat at Carrhae. Your army faces equal uncertainty. **Caution advised.**",
      "At the siege of Alesia, Caesar faced Vercingetorix and a Gallic confederacy that nearly broke Rome's might. Though Caesar prevailed, the cost was tremendous. **Consider the price of victory.**",
      "The battle of the Milvian Bridge left Constantine victorious, yet his own army once outnumbered him. Luck and tactics, not certainty, won the day. **Fortune is fickle.**"
    ],
    moderate: [
      "Caesar's conquest of Gaul took eight years against fierce barbarian resistance. Rome prevailed, but thousands of legionaries never returned home. **Prepare for heavy losses.**",
      "When Augustus defeated Mark Antony at Actium, Rome's naval superiority proved decisive, yet the outcome hung in the balance until the final hour. **The gods may favor the brave.**",
      "Trajan's campaign into Dacia required careful planning, multiple legions, and brilliant strategy. Rome won, but at significant cost. **Rome needs steady resolve.**"
    ],
    likely: [
      "Caesar crushed the Helvetii with superior tactics and discipline—60,000 barbarians fell to 30,000 legionaries. Roman order conquered Germanic chaos. **Your army is well-positioned.**",
      "When Pompey defeated the pirates at sea, Roman naval superiority and organization decimated the unorganized enemy fleet. **Your forces hold the advantage.**",
      "During the conquest of Egypt, Augustus's legions overwhelmed local forces through discipline and coordination. The outcome was never in doubt. **Victory beckons.**"
    ],
    veryLikely: [
      "Caesar's subjugation of Egypt was swift and overwhelming. Cleopatra's forces crumbled before Roman might. Caesar's 3,000 soldiers defeated armies ten times their size through superior tactics and morale. **Rome will triumph.**",
      "When Roman legions faced the Lusitanians, Roman discipline and numbers proved absolutely insurmountable. The enemy was crushed utterly. **Your army cannot fail.**",
      "Trajan's final victory over Dacia was so complete that Rome annexed the land permanently. No enemy force could withstand the full might of Rome. **Glory awaits.**"
    ]
  },
  Vikings: {
    veryUnlikely: [
      "When the Norse raiders landed on unfamiliar shores and faced prepared defenses, they were slaughtered like seals. The Shield Wall of disciplined enemies broke Viking fury. **Your warriors face certain doom.**",
      "At Stiklestad, King Harold Hardrada's Viking force was decimated by organized enemies. The finest Viking warriors fell to disciplined spears. **Even the bravest can fall.**",
      "When Vikings sailed up the Thames toward London, they found city walls, trained archers, and coordinated defense. The raid collapsed. Few returned to the ships. **This path leads only to death.**"
    ],
    unlikely: [
      "The Varangian Guard faced enemies who matched them sword for sword and outnumbered them in discipline. Even Viking valor could not overcome overwhelming odds. **Reconsider this war.**",
      "Norwegian forces at the Stamford Bridge met English longbowmen. Arrows darkened the sky, and Viking shield walls crumbled under the assault. **Your army is not ready.**",
      "Ragnar Lothbrok's siege of Paris failed—French forces held the walls, and the Vikings were forced to sail away in shame. **Do not repeat this folly.**"
    ],
    moderate: [
      "When Eric Bloodaxe claimed his throne, the battles were fierce and casualties heavy on both sides. Viking cunning and strength eventually prevailed, but many warriors fell. **Prepare for bloodshed.**",
      "The invasion of England required multiple raids over years. No single Viking force could conquer the island in one assault. **Patience is needed.**",
      "Norse raiders often faced unexpected resistance and had to retreat. Not every raid returned laden with gold. **Fortune is uncertain.**"
    ],
    likely: [
      "When Viking longships descended upon coastal settlements, the unprepared inhabitants were overwhelmed swiftly. Swift action and brutal force ensured victory. **Your raiders have the advantage.**",
      "Leif Erikson's discovery of North America showed Viking explorers could venture anywhere unopposed. Undefended lands fell easily to Norse fury. **The gods favor the bold.**",
      "The sack of Lindisfarne showed how undefended monasteries fell to surprise Viking assault. Easy prey, rich treasure. **Strike now.**"
    ],
    veryLikely: [
      "Ivar the Boneless conquered vast tracts of England with brilliant strategy and overwhelming force. English kingdoms fell one by one, utterly defenseless against Viking coordination. **Your army will devastate all.**",
      "When Ragnar's sons invaded, they destroyed everything in their path—cities burned, armies broke, treasure flowed back to Scandinavia. **Victory is certain.**",
      "The Great Heathen Army swept across England leaving only ashes and submission in its wake. No force could stop the Nordic fury. **Destiny awaits.** Sail forth with pride!"
    ]
  },
  Mongols: {
    veryUnlikely: [
      "When the Mongol hordes faced the heavily armored European knights at Legnica, they were utterly routed. The knights' discipline and armor proved superior. **Your riders cannot win this battle.**",
      "At the Battle of Ain Jalut, the Mamluk forces stopped the Mongol advance cold. Cavalry charges met with coordinated spears and discipline. The Mongol legend ended that day. **Retreat while you can.**",
      "When Mongol forces overextended into fortified positions, concentrated defense broke their mobility. The horsemen were slaughtered like cattle. **This is not a steppe—you will be trapped.**"
    ],
    unlikely: [
      "The Mongols faced the Jin Dynasty's massive fortifications and were slowed to a grinding halt. The enemy held superior defensive positions for years. **Prepared defenses will break you.**",
      "At the siege of Baghdad, the Mongols suffered unexpected casualties from fortified positions and coordinated defense. Even the great Mongol war machine stumbled. **Do not commit your riders.**",
      "When Kublai Khan faced the Tocharians in prepared positions, losses were heavy and victory uncertain. **The steppe is your strength—this battle is not yours.**"
    ],
    moderate: [
      "Genghis Khan's conquest of Central Asia took years of brutal fighting. Many cities resisted, and Mongol forces suffered casualties they rarely admitted. **Victory will be costly.**",
      "The siege of Riazan required both speed and attrition. The Mongols prevailed, but not without price. **Prepare for a long campaign.**",
      "The conquest of Persia showed even the Mongols faced unexpected resistance. Organized kingdoms fought back fiercely. **Your riders will face hard resistance.**"
    ],
    likely: [
      "When Subutai's cavalry descended upon the Hungarian plain, scattered defenders were crushed utterly. Uncoordinated forces crumbled to Mongol mobility. **Your horses will outrun their defenses.**",
      "The Mongol conquest of Korea showed how unprepared defenders fell to rapid cavalry strikes. Cities fell in weeks. **Your mobility guarantees victory.**",
      "Against the Song Dynasty's southern territories, Mongol cavalry proved devastating to unprepared defenders. Rapid assaults won city after city. **Strike fast and often.**"
    ],
    veryLikely: [
      "Genghis Khan's obliteration of the Khwarazmian Empire was absolute and total. An entire civilization was erased—millions dead, cities razed. No force could withstand the Mongol fury. **Your army is unstoppable.**",
      "The conquest of Baghdad saw 200,000 defenders crushed by Mongol coordination. The enemy barely slowed the charge. **Your riders will sweep all aside.**",
      "When 100,000 Mongol horsemen descended upon the Jin Dynasty, the outcome was never in doubt. The empire fell to the hooves of Genghis Khan's warriors. **Destiny is yours. Ride forth!**"
    ]
  },
  Slavs: {
    veryUnlikely: [
      "When the Swedish knights faced the Slavic forces on the ice of Lake Peipus, they were trapped and broken utterly. The Slavic warriors showed no mercy. Yet your enemies now are prepared and well-fortified. **Even Slavic courage may falter.**",
      "At the Kulikovo Field, Russian forces faced the Mongol Horde and emerged bloodied but victorious—yet it cost 100,000 lives. **Your warriors cannot afford such losses.**",
      "When Slavic defenders held the fortress at Rzhev against overwhelming German forces, they were eventually crushed by sheer numbers and firepower. **Your fortifications will not hold.**"
    ],
    unlikely: [
      "Slavic forces held Moscow against medieval sieges, but invaders eventually broke through at terrible cost to both sides. **Prepared enemies will not yield easily.**",
      "When Ivan the Terrible's armies faced organized opposition, they sometimes faltered. Slavic strength is not always sufficient. **Reconsider this march.**",
      "The resistance at Novgorod delayed invaders, but eventual capitulation showed even Slavic defiance has limits against superior numbers. **Your army faces an equal foe.**"
    ],
    moderate: [
      "The Dnieper Cossacks resisted Ottoman expansion fiercely, winning battles but eventually losing the greater war through attrition. **This will be a long struggle.**",
      "Slavic warriors held their own against Mongol incursions, but victory required multiple seasons and great sacrifice. **Prepare your people for hardship.**",
      "When Alexander Nevsky defended the Russian lands, victory came through cunning and winter more than overwhelming force. **Strategy matters here.**"
    ],
    likely: [
      "When Suvorov's Russian army engaged the Ottomans, Slavic discipline and ferocity overwhelmed the enemy. Victory after victory fell to Russian courage. **Your force has the advantage.**",
      "Alexander Nevsky's destruction of the Swedish invaders was complete and swift. The enemy never expected Slavic tactical brilliance. **Strike with confidence.**",
      "The defense of Poltava showed Russian warriors absolutely shattering their opponents. Disciplined Slavic courage proved unbreakable. **Victory is yours.**"
    ],
    veryLikely: [
      "When Russia mobilized against invaders, entire armies were utterly annihilated. At Stalingrad, the enemy was consumed. Slavic willpower and the frozen earth became one unstoppable force. **Your army will triumph completely.**",
      "Kutuzov's maneuvers broke Napoleon himself. The Grande Armée was destroyed utterly—not by force but by Slavic endurance and strategy. **The enemy cannot withstand your people.**",
      "When Slavic warriors committed fully to war, enemies were ground to dust. Winter and resolve combined are absolutely unbeatable. **You will crush all before you. March!**"
    ]
  }
};

const ROBBER_LORE = [
  "The robber dressed as a humble merchant, but once inside your treasury, they 'accidentally' knocked over a vase, making a terrible mess. While you were distracted cleaning it up, they pocketed 10 coins with the sleight of hand of a seasoned pickpocket!",
  "Your robber befriended your treasurer over a cup of mead, offering increasingly generous compliments. Just as your treasurer let their guard down, the robber 'sneezed' directly into the coin pile, and in the chaos and laughter that followed, 10 coins mysteriously disappeared into their sleeve!",
  "The robber pretended to be deeply impressed by your city's architecture, asking to see the vault as a 'curious traveler.' Once inside, they started juggling gold coins and 'accidentally' pocketed 10 when everyone was clapping in amazement!",
  "Your robber claimed to be a tax collector from a distant land and asked to 'verify' your coin reserves. They used a magical-looking counting trick that confused everyone so completely that when the counting ended, 10 coins couldn't be accounted for!",
  "The robber sang the most beautiful trading songs, so captivating that when they finished their performance, they bowed deeply. As they straightened up, 10 coins had somehow transferred from your purse to theirs during the dramatic gesture!",
  "Your robber 'accidentally' spilled honey all over the trading floor, and while everyone was busy cleaning it up and the coins were slippery, they managed to pocket exactly 10 coins with practiced precision!",
  "The robber suggested a game to celebrate the trade deal—'coin flipping for luck.' After 10 rounds of increasingly elaborate tricks and distractions, 10 coins were 'left behind' at their feet when they departed!",
  "Your robber told the most hilarious jokes about previous failed trades they'd witnessed. Everyone was laughing so hard that when they left, 10 coins walked out with them unnoticed!",
  "The robber claimed to have a 'lucky coin' and asked if they could borrow one to 'bless your trade.' After examining your treasured coins and getting everyone distracted with stories of their legendary fortune, they returned the coin—but now you're 10 coins poorer!",
  "Your robber pretended their leg was injured and asked if they could sit by the coin vault while recovering. By the time they 'healed' and left, 10 coins had miraculously made their way into their travel pack!"
];

>>>>>>> 0080bf9 (Initial commit)
const DISPATCH_LORE = {
  Vikings: [
    "{{player}} unleashes {{soldiers}} Viking raiders, sworn to seize fresh coasts for the clans.",
    "{{player}} orders the longships made ready; {{soldiers}} warriors sail to carve new horizons for the Vikings."
  ],
  Romans: [
    "{{player}} rallies {{soldiers}} legionaries to extend the reach of Rome's eagles.",
    "{{player}} dispatches a {{soldiers}}-strong cohort to bind new provinces to the Roman imperium."
  ],
  Mongols: [
    "{{player}} whistles for {{soldiers}} riders, promising the Mongol empire will stretch beyond today's dawn.",
    "{{player}} lets the steppe thunder as {{soldiers}} horsemen surge out to claim fresh pasture for the khanate."
  ],
  Slavs: [
    "{{player}} gathers {{soldiers}} Slavic warriors, intent on planting new settlements in distant woods.",
    "{{player}} sends {{soldiers}} shieldbearers forward to widen the motherland's borders."
  ],
  Default: [
    "{{player}} marches {{soldiers}} soldiers outward, determined to expand their dominion."
  ]
};

function buildDispatchLore(playerName, civ, soldiers){
  const key = (civ && DISPATCH_LORE[civ]) ? civ : "Default";
  const pool = DISPATCH_LORE[key] || DISPATCH_LORE.Default;
  const template = pool[Math.floor(Math.random() * pool.length)] || DISPATCH_LORE.Default[0];
  return (template || "")
    .replace(/\{\{player\}\}/g, playerName || "A leader")
    .replace(/\{\{civ\}\}/g, civ || "their people")
    .replace(/\{\{soldiers\}\}/g, soldiers || 0);
}

const BUILDINGS = {
  Wood: {
    Hut:        { cost:{ wood:25, food:15 }, effect:{ soldiers:+1, soldierCap:+2 }, desc:"+1 Soldier, +2 Army Cap" },
    Sawmill:    { cost:{ wood:20, rock:8 }, effect:{ woodYield:+3 }, desc:"+3 Wood (scales with level)" },
    Field:      { cost:{ wood:18 }, effect:{ foodYield:+4 }, desc:"+4 Food (scales with level)" },
    Market:     { cost:{ wood:30, rock:12 }, effect:{ coins:+2 }, desc:"+2 coins/turn" },
    Barracks:   { cost:{ wood:32, food:24 }, effect:{ soldierCap:+6, defense:+0.05 }, desc:"Unlock training, +6 Army Cap, +5% Defence" },
    Palisade:   { cost:{ wood:40, rock:12 }, effect:{ defense:+0.12, wallTier:"wood" }, desc:"Wooden walls, +12% Defence" }
  },
  Stone: {
    Quarry:        { cost:{ rock:24, wood:16 }, effect:{ rockYield:+4 }, desc:"+4 Rock (scales with level)" },
    Mill:          { cost:{ wood:20, rock:16 }, effect:{ foodYield:+3 }, desc:"+3 Food (scales with level)" },
    TownCenter:    { cost:{ rock:35, wood:25, food:20 }, effect:{ coins:+3 }, desc:"+3 coins/turn" },
    Armory:        { cost:{ rock:38, wood:26, food:20 }, effect:{ soldierCap:+8, defense:+0.05, raidPower:+0.05 }, desc:"+8 Army Cap, +5% Defence, raids +5%" },
    StoneWall:     { cost:{ rock:42, wood:24 }, effect:{ defense:+0.20, wallTier:"stone" }, desc:"Stone walls, +20% Defence" },
    BallistaTower: { cost:{ rock:36, wood:22, metal:12 }, effect:{ defense:+0.16, raidPower:+0.08 }, desc:"+16% Defence, raids +8%" }
  },
  Modern: {
    Factory:     { cost:{ rock:30, metal:25, coins:18 }, effect:{ metalYield:+4 }, desc:"+4 Metal (scales with level)" },
    Greenhouse:  { cost:{ rock:24, metal:18, coins:15 }, effect:{ foodYield:+5 }, desc:"+5 Food (scales with level)" },
    Bank:        { cost:{ rock:40, metal:30, coins:35 }, effect:{ coins:+5 }, desc:"+5 coins/turn" },
    Fortress:    { cost:{ rock:52, metal:38, coins:26 }, effect:{ defense:+0.22, soldierCap:+8 }, desc:"+22% Defence, +8 Army Cap" },
    SteelWall:   { cost:{ rock:48, metal:36, coins:20 }, effect:{ defense:+0.25, wallTier:"steel" }, desc:"Steel curtain walls, +25% Defence" },
    DefenseGrid: { cost:{ metal:42, coins:30 }, effect:{ defense:+0.18, raidPower:+0.12 }, desc:"+18% Defence, raids +12%" },
    Monument:    { cost:{ wood:120, rock:120, metal:80, food:100, coins:70 }, effect:{ win:true }, desc:"Win condition" }
  }
};

// Random events (replaced by seasonal events) — kept helpers for possible future use

function downgradeSpecific(p, names) {
  const owned = names.filter(n => p.structures[n]);
  if (!owned.length) return;
  const name = owned[Math.floor(Math.random()*owned.length)];
  const info = p.structures[name];
  if (info.level>1) info.level -= 1;
  else delete p.structures[name];
}
function downgradeRandomBuilding(p, maxSteps) {
  const names = Object.keys(p.structures).filter(n => n!=="Monument");
  if (!names.length) return;
  const name = names[Math.floor(Math.random()*names.length)];
  const info = p.structures[name];
  const steps = Math.max(1, Math.min(maxSteps, info.level-1));
  if (info.level>1) info.level -= steps;
  else delete p.structures[name];
}

// =================== Core helpers ===================
<<<<<<< HEAD
function initialPlayer(color, isAi = false) {
=======
function initialPlayer(color, isAi = false, civ = null) {
>>>>>>> 0080bf9 (Initial commit)
  // Select 2 random buildings from Wood age to show initially
  const woodBuildings = Object.keys(BUILDINGS.Wood || {});
  const shuffled = woodBuildings.sort(() => Math.random() - 0.5);
  const initialVisible = shuffled.slice(0, 2);

<<<<<<< HEAD
  return {
    color: color || "blue",
    civ: "Romans",
=======
  // Randomize AI age progression thresholds (80% - 100% per age)
  const makeThreshold = () => 0.8 + Math.random() * 0.2;

  return {
    color: color || "blue",
    civ: civ || "Romans",
>>>>>>> 0080bf9 (Initial commit)
    ready: isAi ? true : false,
    resources: { wood:10, rock:10, metal:10, food:10, coins:10 },
    soldiers: BASE.startingSoldiers,
    ap: 0, bankedAp: 0,
    age: "Wood",
    structures: {}, // name -> { level:1 }
    progress: 0,
    raid: null,
    personalLog: [], // Personal event log (only visible to this player)
    isAi: isAi,
<<<<<<< HEAD
=======
    // Per-age advancement thresholds for AI (percent of buildings built in current age)
    aiAgeThresholds: { Wood: makeThreshold(), Stone: makeThreshold() },
>>>>>>> 0080bf9 (Initial commit)
    visibleBuildings: {
      Wood: initialVisible,
      Stone: [], // Will be populated when player reaches Stone age
      Modern: [] // Will be populated when player reaches Modern age
    },
    // Statistics tracking
    stats: {
      resourcesGathered: { wood: 0, rock: 0, metal: 0, food: 0, coins: 0 },
      resourcesSpent: { wood: 0, rock: 0, metal: 0, food: 0, coins: 0 },
      buildingsBuilt: 0,
      buildingsUpgraded: 0,
      soldiersRecruited: 0,
      raidsLaunched: 0,
      raidsSucceeded: 0,
      raidsFailed: 0,
      tradesCompleted: 0,
      ageProgression: [{ age: "Wood", turn: 0, timestamp: Date.now() }],
      wealthHistory: [] // { turn: number, wealth: number, timestamp: number }
    }
  };
}
function levelBonus(level){
  // Each upgrade level adds +1 to the base yield
  // Level 1 = +0, Level 2 = +1, Level 3 = +2
  return level - 1;
}

// Building visibility management
function unlockAllBuildingsForAge(player, age) {
  if (!player.visibleBuildings) {
    player.visibleBuildings = { Wood: [], Stone: [], Modern: [] };
  }
  const allBuildings = Object.keys(BUILDINGS[age] || {});
  // For Modern age, exclude Monument (it has separate unlock logic)
  if (age === 'Modern') {
    player.visibleBuildings[age] = allBuildings.filter(b => b !== 'Monument');
  } else {
    player.visibleBuildings[age] = allBuildings;
  }
}

function unlockRandomBuildingsForAge(player, age, count) {
  if (!player.visibleBuildings) {
    player.visibleBuildings = { Wood: [], Stone: [], Modern: [] };
  }
  const allBuildings = Object.keys(BUILDINGS[age] || {});
  // For Modern age, exclude Monument
  const availableBuildings = age === 'Modern'
    ? allBuildings.filter(b => b !== 'Monument')
    : allBuildings;

  const shuffled = availableBuildings.sort(() => Math.random() - 0.5);
  player.visibleBuildings[age] = shuffled.slice(0, count);
}

function countBuildingsInAge(player, age) {
  if (!BUILDINGS[age]) return 0;
  const buildingNames = Object.keys(BUILDINGS[age]);
  return buildingNames.filter(name => player.structures[name]).length;
}
<<<<<<< HEAD
=======
function totalBuildingsInAge(age) {
  if (!BUILDINGS[age]) return 0;
  // Exclude Monument for Modern age when counting age completion
  const names = Object.keys(BUILDINGS[age]);
  return age === 'Modern' ? names.filter(n => n !== 'Monument').length : names.length;
}
>>>>>>> 0080bf9 (Initial commit)

// Statistics tracking helpers
function trackResourceGathered(player, resource, amount) {
  if (!player.stats) return;
  if (!player.stats.resourcesGathered[resource]) player.stats.resourcesGathered[resource] = 0;
  player.stats.resourcesGathered[resource] += amount;
}

function trackResourceSpent(player, resources) {
  if (!player.stats) return;
  for (const [res, amount] of Object.entries(resources)) {
    if (!player.stats.resourcesSpent[res]) player.stats.resourcesSpent[res] = 0;
    player.stats.resourcesSpent[res] += amount;
  }
}

function trackWealth(room, player, playerId) {
  if (!player.stats) return;
  const wealth = (player.resources.wood || 0) + (player.resources.rock || 0) +
                 (player.resources.metal || 0) + (player.resources.food || 0) +
                 ((player.resources.coins || 0) * 3); // Weight coins higher
  player.stats.wealthHistory.push({
    turn: room.statistics.totalTurns,
    wealth: wealth,
    timestamp: Date.now()
  });
}

function calculateTotalWealth(resources) {
  return (resources.wood || 0) + (resources.rock || 0) +
         (resources.metal || 0) + (resources.food || 0) +
         ((resources.coins || 0) * 3);
}

function summarizeSessionText(text){
  try{
    const lines = String(text||'').split(/\r?\n/);
    const summary = { players: [], start: null, startingMonth: null, turns: 0, raids: [], mercRaids: [], months: 0, firstTo:{ Stone:null, Modern:null }, monumentUnlocks: [] };
    for (const ln of lines){
      if (ln.includes('Player Order: [')){
        const m = ln.match(/Player Order: \[(.*)\]/); if (m) summary.players = m[1].split(',').map(s=>s.trim());
      }
      if (ln.startsWith('Started:')){ summary.start = ln.split('Started:')[1].trim(); }
      if (ln.startsWith('Starting Month:')){ summary.startingMonth = Number(ln.split(':')[1].trim()); }
      if (ln.includes('NEXT_TURN:')){ summary.turns += 1; }
      if (ln.includes('MONTH_ADVANCED:')){ summary.months += 1; }
      if (ln.includes('RAID_EXECUTED:')){ const m=ln.match(/RAID_EXECUTED: Target (.*?), Season: (.*)$/); if (m) summary.raids.push({ target:m[1], season:m[2] }); }
      if (ln.includes('MERCENARY_RAID_HIRED')){ summary.mercRaids.push({ stage:'hired', line:ln }); }
      if (ln.includes('MERCENARY_RAID_EXECUTING')){ summary.mercRaids.push({ stage:'executing', line:ln }); }
      if (ln.includes('MERCENARY_RAID_COMPLETE')){ summary.mercRaids.push({ stage:'complete', line:ln }); }
      if (ln.includes('built first building') && ln.includes('Stone age')){ const m=ln.match(/^(?:\[.*?\]\s*)?BUILDINGS_UNLOCKED: (.*?) built/); if (m && !summary.firstTo.Stone) summary.firstTo.Stone = { player:m[1] }; }
      if (ln.includes('built first building') && ln.includes('Modern age')){ const m=ln.match(/^(?:\[.*?\]\s*)?BUILDINGS_UNLOCKED: (.*?) built/); if (m && !summary.firstTo.Modern) summary.firstTo.Modern = { player:m[1] }; }
      if (ln.includes('MONUMENT_UNLOCKED:')){ const m=ln.match(/MONUMENT_UNLOCKED: (.*?) built (\d+) buildings/); if (m) summary.monumentUnlocks.push({ player:m[1], count:Number(m[2]) }); }
    }
    // Fallback for turns if none recorded
    if (!summary.turns) summary.turns = lines.filter(l=>l.includes('END_TURN:')||l.includes('BANK_ALL_AND_END:')).length;
    summary.rawTail = lines.slice(-200).join('\n');
    return summary;
  }catch(e){ return null; }
}

function compileGameStatistics(room, winnerId) {
  room.statistics.endTime = Date.now();
  const duration = room.statistics.endTime - room.statistics.startTime;
  const durationMinutes = Math.floor(duration / 60000);
  const durationSeconds = Math.floor((duration % 60000) / 1000);

  const playerStats = {};
  for (const [pid, p] of Object.entries(room.state)) {
    if (!p.stats) continue;

    const totalGathered = Object.values(p.stats.resourcesGathered).reduce((a, b) => a + b, 0);
    const totalSpent = Object.values(p.stats.resourcesSpent).reduce((a, b) => a + b, 0);
    const finalWealth = calculateTotalWealth(p.resources);

    playerStats[pid] = {
      name: pid,
      civ: p.civ,
      color: p.color,
      age: p.age,
      finalWealth,
      totalGathered,
      totalSpent,
      buildingsBuilt: p.stats.buildingsBuilt || 0,
      buildingsUpgraded: p.stats.buildingsUpgraded || 0,
      soldiersRecruited: p.stats.soldiersRecruited || 0,
      raidsLaunched: p.stats.raidsLaunched || 0,
      raidsSucceeded: p.stats.raidsSucceeded || 0,
      raidsFailed: p.stats.raidsFailed || 0,
      tradesCompleted: p.stats.tradesCompleted || 0,
      ageProgression: p.stats.ageProgression || [],
      wealthHistory: p.stats.wealthHistory || [],
      finalResources: { ...p.resources },
      finalSoldiers: p.soldiers || 0
    };
  }

  // Attach session summary from log file (if available)
  let sessionSummary = null;
  try{ if (room.sessionLogPath && fs.existsSync(room.sessionLogPath)) { const text = fs.readFileSync(room.sessionLogPath,'utf8'); sessionSummary = summarizeSessionText(text); } }catch(e){}

  const totalTurns = room.statistics.totalTurns || (sessionSummary?.turns || 0);

  return {
    winner: winnerId,
    duration: {
      ms: duration,
      formatted: `${durationMinutes}m ${durationSeconds}s`
    },
    totalTurns,
    startTime: room.statistics.startTime,
    endTime: room.statistics.endTime,
    playerStats,
    sessionSummary
  };
}
function buildingEffect(name){
  for (const defs of Object.values(BUILDINGS)){
    if (defs[name]) return defs[name].effect || {};
  }
  return null;
}
function computeYield(p, type) {
  // base
  let y = BASE.yields[type];
  // Slavs bonus: +1 base gathering for all resources (compensates for -1 coins)
  if (p.civ === 'Slavs') y += 1;
  // per-building additive bonuses with level bonus (+1 per level upgrade)
  for (const [name, info] of Object.entries(p.structures)){
    const eff = buildingEffect(name); if (!eff) continue;
    const lvl = info.level||1;
    const bonus = levelBonus(lvl);
    if (type==="wood"  && eff.woodYield)  y += eff.woodYield  + bonus;
    if (type==="rock"  && eff.rockYield)  y += eff.rockYield  + bonus;
    if (type==="metal" && eff.metalYield) y += eff.metalYield + bonus;
    if (type==="food"  && eff.foodYield)  y += eff.foodYield  + bonus;
  }
  // civ multiplier
  const civ = CIVS[p.civ];
  if (civ && civ.yieldMult && civ.yieldMult[type]) y = y * civ.yieldMult[type];
  return Math.max(0, Math.floor(y));
}
const WALL_TIERS = { none:0, wood:1, stone:2, steel:3 };
function soldierCap(p){
  let cap = BASE.baseSoldierCap;
  for (const [name, info] of Object.entries(p.structures)){
    const eff = buildingEffect(name); if (!eff) continue;
    if (eff.soldierCap){
      const bonus = levelBonus(info.level||1);
      cap += eff.soldierCap + bonus;
    }
  }
  return Math.max(BASE.startingSoldiers, cap);
}
function highestWallTier(p){
  let tier = 0;
  for (const [name] of Object.entries(p.structures)){
    const eff = buildingEffect(name);
    if (eff?.wallTier){
      tier = Math.max(tier, WALL_TIERS[eff.wallTier] || 0);
    }
  }
  return tier;
}
function requiredWallTierForAge(age){
  const idx = AGES.indexOf(age);
  if (idx<=0) return WALL_TIERS.wood;
  if (idx===1) return WALL_TIERS.stone;
  return WALL_TIERS.steel;
}
function computeDefense(p){
  let defence = BASE.defense.base;
  const soldiers = Math.max(0, p.soldiers||0);
  const armyContribution = Math.min(BASE.defense.maxFromArmy, soldiers * BASE.defense.perSoldier);
  defence += armyContribution;
  for (const [name, info] of Object.entries(p.structures)){
    const eff = buildingEffect(name); if (!eff) continue;
    if (eff.defense){
      const bonus = levelBonus(info.level||1);
      defence += (eff.defense + bonus * 0.01); // +1% defense per level
    }
  }
  return Math.min(1, defence);
}
function computeRaidPower(p, committed){
  const soldiers = Math.max(0, committed||0);

  // Re-tuned tiered success rates based on soldier count (harder overall)
  // 3 soldiers = 8%, 6 = 30%, 10 = 55%, 15+ = 70%
  let baseRate = 0.08; // 3 soldiers
  if (soldiers >= 15) {
    baseRate = 0.70;
  } else if (soldiers >= 10) {
    baseRate = 0.55;
  } else if (soldiers >= 6) {
    baseRate = 0.30;
  }

  // Add bonuses from raid-boosting buildings
  let power = baseRate;
  for (const [name, info] of Object.entries(p.structures)){
    const eff = buildingEffect(name); if (!eff) continue;
    if (eff.raidPower){
      const bonus = levelBonus(info.level||1);
      power += (eff.raidPower + bonus * 0.01); // +1% raid power per level
    }
  }
  return Math.min(0.90, power); // Cap at 90%
}
function sanitizeRaidState(raid){
  if (!raid) return null;
  return {
    active: !!raid.active,
    committed: raid.committed||0,
    startedSeason: raid.startedSeason,
    resolvesAfterSeason: raid.resolvesAfterSeason
  };
}
const canAfford = (res, cost) => Object.keys(cost).every(k => (res[k]||0) >= cost[k]);
const payCost = (res, cost) => { for (const k of Object.keys(cost)) res[k]-=cost[k]; };
const addResources = (res, add) => { for (const k of Object.keys(add)) res[k]=(res[k]||0)+add[k]; };
const multiplyCost = (cost, multiplier) => {
  const out={};
  for (const [key,val] of Object.entries(cost||{})){
    out[key]=Math.max(0, Math.ceil(val * multiplier));
  }
  return out;
};
const hasMove = (p) => ((p.ap|0) > 0) || ((p.bankedAp|0) > 0);
const consumeMove = (p) => {
  if ((p.ap|0) > 0){ p.ap -= 1; return true; }
  if ((p.bankedAp|0) > 0){ p.bankedAp -= 1; return true; }
  return false;
};
const formatResourceBundle = (bundle) => {
  if (!bundle) return "";
  const parts = [];
  for (const [key,val] of Object.entries(bundle)){
    if (val>0) parts.push(`${val} ${key}`);
  }
  return parts.join(", ");
};

function computeProgress(p){
  // 0-90%: readiness towards Monument; 100% only when Monument is built
  if (p.structures["Monument"]) return 100;

  // Readiness components
  const needAgeIdx = AGES.indexOf("Modern");
  const curIdx = AGES.indexOf(p.age);
  const ageReady = curIdx >= needAgeIdx ? 1 : (curIdx / needAgeIdx);

  // Per-age distinct buildings readiness: ≥2 per age
  let perAgeReadyAccum = 0;
  for (const age of AGES){
    const names = Object.keys(BUILDINGS[age]||{});
    const have = names.filter(n=> !!p.structures[n]).length;
    perAgeReadyAccum += Math.min(1, have/2);
  }
  const perAgeReady = perAgeReadyAccum / AGES.length;

  // Resource readiness towards Monument cost
  const mon = BUILDINGS["Modern"] && BUILDINGS["Modern"]["Monument"];
  let resReady = 0;
  if (mon && mon.cost){
    let ratios = [];
    for (const k of Object.keys(mon.cost)){
      const need = mon.cost[k]||0; const have = (p.resources[k]||0);
      ratios.push(need>0 ? Math.min(1, have/need) : 1);
    }
    resReady = ratios.length? (ratios.reduce((a,b)=>a+b,0)/ratios.length) : 0;
  }

  // Combine (weights sum to 1.0)
  const combined = 0.35*ageReady + 0.35*perAgeReady + 0.30*resReady;
  return Math.min(90, Math.round(combined*90));
}
function coinIncome(p) {
  // coins come from coin buildings + small age drip
  const ageIdx = AGES.indexOf(p.age)+1;
  let coins = Math.floor(ageIdx * BASE.income.perAge);
  for (const [name, info] of Object.entries(p.structures)){
    const eff = buildingEffect(name);
    if (eff?.coins){
      const bonus = levelBonus(info.level||1);
      coins += Math.floor(eff.coins + bonus);
    }
  }
  // civ coin delta
  const civ = CIVS[p.civ];
  if (civ && typeof civ.coinPerTurnDelta==='number') coins += civ.coinPerTurnDelta;
  return Math.max(0, coins);
}
function maybeAdvanceAge(p, room){
  const idx = AGES.indexOf(p.age);
  if (idx>=AGES.length-1) return false;

  const currentAge = p.age;
  const names = Object.keys(BUILDINGS[currentAge]||{});
  const have = names.filter(n => !!p.structures[n]).length;

<<<<<<< HEAD
  // Age-specific building requirements:
  // Wood -> Stone: need 2 buildings
  // Stone -> Modern: need 3 buildings
  let required = 2; // Default
  if (currentAge === 'Stone') {
    required = 3;
  }

  if (have >= required) {
=======
  // Default (for humans): legacy simple thresholds
  let shouldAdvance = false;

  if (!p.isAi) {
    // Human player rules (legacy): Wood->Stone need 2, Stone->Modern need 3
    let required = 2;
    if (currentAge === 'Stone') required = 3;
    shouldAdvance = have >= required;
  } else {
    // AI rule (per spec + mandatory war/training quotas):
    // - Wood -> Stone only after ALL Wood buildings are built AND ≥1 war in Wood AND ≥2 soldiers trained in Wood
    // - Stone -> Modern after ≥3 Stone buildings AND ≥1 war in Stone AND ≥4 soldiers trained in Stone
    const wars = (p.aiPlan && p.aiPlan.wars) || { Wood:0, Stone:0, Modern:0 };
    const trainedSoldiers = (p.aiPlan && p.aiPlan.trainedSoldiers) || { Wood:0, Stone:0, Modern:0 };
    if (currentAge === 'Wood') {
      const totalWood = totalBuildingsInAge('Wood');
      shouldAdvance = (have >= totalWood) && (wars.Wood >= 1) && (trainedSoldiers.Wood >= 2);
    } else if (currentAge === 'Stone') {
      shouldAdvance = (have >= 3) && (wars.Stone >= 1) && (trainedSoldiers.Stone >= 4);
    } else {
      shouldAdvance = false; // No advance beyond Modern
    }
  }

  if (shouldAdvance) {
>>>>>>> 0080bf9 (Initial commit)
    const nextAge = AGES[idx+1];
    p.age = nextAge;

    // Unlock 2 random buildings for the new age
    unlockRandomBuildingsForAge(p, nextAge, 2);

    // Track age progression
    try{
      if (p.stats){
        p.stats.ageProgression = Array.isArray(p.stats.ageProgression) ? p.stats.ageProgression : [];
        p.stats.ageProgression.push({ age: nextAge, turn: room?.statistics?.totalTurns || 0, timestamp: Date.now() });
      }
    }catch(e){}

    return true;
  }
  return false;
}

// =================== Rooms ===================
const ROOMS = new Map();
<<<<<<< HEAD
const AI_NAMES = ["Bob", "Alice", "Charlie", "Dave"];
=======
const AI_NAMES = ["Bob", "Alice", "Charlie", "Dave"]; // legacy fallback

// Civilization-based ruler names for AI
const EMPEROR_NAMES = {
  Romans: ["Julius Caesar","Augustus","Trajan","Hadrian","Marcus Aurelius","Constantine","Nero","Claudius","Vespasian","Tiberius"],
  Vikings: ["Ragnar","Bjorn Ironside","Ivar","Harald","Leif Erikson","Eric Bloodaxe","Sigurd","Hrollaug"],
  Mongols: ["Genghis","Kublai","Ogedei","Tolui","Batu","Mongke","Jochi"],
  Slavs: ["Vladimir","Yaroslav","Oleg","Rurik","Ivan","Mstislav","Sviatoslav","Boleslav"]
};
function randomCiv(){ const keys = Object.keys(CIVS||{}); return keys[Math.floor(Math.random()*keys.length)] || 'Romans'; }
function uniqueName(room, base){
  let name = base;
  let i = 2;
  while (room.state[name]){ name = `${base} ${i}`; i++; if (i>99) break; }
  return name;
}
function generateAiName(room, civ){
  const pool = EMPEROR_NAMES[civ] || EMPEROR_NAMES.Romans;
  const base = pool[Math.floor(Math.random()*pool.length)] || 'Ruler';
  return uniqueName(room, base);
}
>>>>>>> 0080bf9 (Initial commit)

class AIManager {
  constructor(room, performAction) {
    this.room = room;
    this.states = ["gathering", "building", "advancing", "trading", "military"];
    this.currentState = "gathering";
<<<<<<< HEAD
    this.chatMessages = [
      "I'm not saying I'm the best, but I'm in the top one.",
      "I'm not arguing, I'm just explaining why I'm right.",
      "I'm not lazy, I'm on energy-saving mode.",
      "I'm not weird, I'm a limited edition.",
      "I'm not a complete idiot, some parts are missing.",
    ];
=======
>>>>>>> 0080bf9 (Initial commit)
    this.performAction = performAction;
    this.logFilePath = room.logFilePath;
  }

  log(message) {
    writeAiLogLine(this.room, message);
  }

  snapshotPlayer(p){
    return {
      ap: p.ap|0,
      bankedAp: p.bankedAp|0,
      age: p.age,
      soldiers: p.soldiers|0,
      raidActive: !!(p.raid&&p.raid.active),
      resources: { wood:p.resources.wood|0, rock:p.resources.rock|0, metal:p.resources.metal|0, food:p.resources.food|0, coins:p.resources.coins|0 },
      structures: Object.keys(p.structures||{}).sort(),
      progress: p.progress|0
    };
  }
  logDelta(playerId, before, after, label){
    const resKeys=["wood","rock","metal","food","coins"]; const diffs=[];
    resKeys.forEach(k=>{ const d=(after.resources[k]|0)-(before.resources[k]|0); if(d!==0) diffs.push(`${d>0?'+':''}${d} ${k}`); });
    const apDelta=(after.ap|0)-(before.ap|0);
    const soldierDelta=(after.soldiers|0)-(before.soldiers|0);
    const newStructs = (after.structures||[]).filter(n=>!(before.structures||[]).includes(n));
    const ageChange = before.age!==after.age ? ` age:${before.age}->${after.age}` : '';
    const parts=[];
    if (diffs.length) parts.push(`res: ${diffs.join(', ')}`);
    if (apDelta!==0) parts.push(`ap: ${before.ap}->${after.ap}`);
    if (soldierDelta!==0) parts.push(`soldiers: ${before.soldiers}->${after.soldiers}`);
    if (newStructs.length) parts.push(`built: ${newStructs.join(', ')}`);
    if (before.progress!==after.progress) parts.push(`progress: ${before.progress}->${after.progress}`);
    const msg = parts.length ? `AI ${playerId} ${label} (${parts.join(' | ')}${ageChange})` : `AI ${playerId} ${label} (no change)`;
    this.log(msg);
  }

  // Strategic helpers
<<<<<<< HEAD
  missingBuildingsInAge(player){
    const names = Object.keys(BUILDINGS[player.age]||{});
    return names.filter(n=>!player.structures[n] && n!=="Monument");
  }
  pickTargetBuilding(player){
    // If in Modern and Monument not built but prerequisites nearly met, target Monument
    if (player.age === "Modern" && !player.structures["Monument"]) {
      // Require at least 2 buildings in each age to attempt Monument per rules
=======
  missingBuildingsInAge(player, age){
    const names = Object.keys(BUILDINGS[age]||{});
    return names.filter(n=>!player.structures[n] && n!=="Monument");
  }
  pickTargetBuilding(player){
    // If in Modern and Monument not built but prerequisites nearly met, target Monument (requires 4 Modern buildings to be visible)
    if (player.age === "Modern" && !player.structures["Monument"]) {
>>>>>>> 0080bf9 (Initial commit)
      let okPerAge=true;
      for (const age of AGES){
        const names = Object.keys(BUILDINGS[age]||{});
        const have = names.filter(n=>!!player.structures[n]).length;
        if (have<2){ okPerAge=false; break; }
      }
<<<<<<< HEAD
      if (okPerAge){
=======
      const modernBuilt = countBuildingsInAge(player, 'Modern');
      if (okPerAge && modernBuilt >= 4){
>>>>>>> 0080bf9 (Initial commit)
        const def = (BUILDINGS["Modern"]||{})["Monument"];
        if (def) return { name:"Monument", def, score:Infinity };
      }
    }
<<<<<<< HEAD
    // Otherwise prefer to complete at least 2 distinct buildings in current age
    const names = this.missingBuildingsInAge(player);
    if (!names.length) return null;
    // Score by total resource deficit to afford
    let best=null, bestScore=Infinity;
    for (const name of names){
      const def = BUILDINGS[player.age][name];
=======
    // Restrict targeting to current age only (server build rules)
    const age = player.age;
    let best=null, bestScore=Infinity;
    const names = this.missingBuildingsInAge(player, age);
    for (const name of names){
      const def = BUILDINGS[age][name];
>>>>>>> 0080bf9 (Initial commit)
      if (!def) continue;
      const cost = def.cost||{};
      let score=0;
      for (const [k,v] of Object.entries(cost)){
        const have = player.resources[k]||0;
        score += Math.max(0, v - have);
      }
      if (score < bestScore){ bestScore=score; best={ name, def, score }; }
    }
    return best;
  }
  mostNeededResourceFor(cost, resources){
    let pick=null, need=0;
    for (const [k,v] of Object.entries(cost||{})){
      const have = resources[k]||0;
      const deficit = Math.max(0, v - have);
      if (deficit > need){ need = deficit; pick = k; }
    }
    // Default to best general resource if already affordable
    return pick || "food";
  }

  // Try to convert surplus resources to coins towards a target cost
  tryRaiseCoins(player, targetCost){
    if ((player.ap|0) <= 0) return false;
    const needCoins = Math.max(0, (targetCost.coins||0) - (player.resources.coins||0));
    if (needCoins <= 0) return false;
    // Pick the largest surplus among gatherables
    const gatherables = ["wood","rock","metal","food"];
    let bestType=null, bestAmt=0;
    for (const t of gatherables){
      const have = player.resources[t]|0;
      if (have > bestAmt){ bestAmt = have; bestType = t; }
    }
    if (!bestType || bestAmt <= 0) return false;
    // Sell just enough to approach needCoins (1 coin per 4 units)
    const sellAmt = Math.max(4, Math.min(bestAmt, needCoins*4));
    this.log(`AI ${player.color||''} selling ${sellAmt} ${bestType} to raise coins.`);
    this.performAction(this.room, player.color?player.color:player.id || Object.keys(this.room.state).find(k=>this.room.state[k]===player), "trade", { mode:"sell", type:bestType, amount:sellAmt });
    return true;
  }

<<<<<<< HEAD
  // Occasionally send a visitor if rich enough (once per year, ~50% chance)
  maybeSendVisitor(playerId){
    const p = this.room.state[playerId];
    if (!p) return;
    if ((p.resources.coins||0) < 5) return;

    // Check if a visitor has already been sent this season (globally for the room)
    const currentSeason = seasonName(this.room);
    if (this.room.lastVisitorSeason === currentSeason) return; // Already sent this season

    // ~50% chance per year = approximately 1.2% chance per turn (assuming ~40 turns per year)
    if (Math.random() < 0.012){
      const targets = Object.keys(this.room.state).filter(id=>id!==playerId && !this.room.state[id].isAi);
=======
  // Dispatch a trader 1-3 times per game (never robber/spy), at most once per season
  maybeSendVisitor(playerId){
    const p = this.room.state[playerId];
    if (!p) return;
    if ((p.resources.coins||0) < 10) return; // costs 10 coins for player-initiated visits

    // Per-game cap per AI
    if (!this.room.aiVisitorCounts) this.room.aiVisitorCounts = {};
    const used = this.room.aiVisitorCounts[playerId] || 0;
    if (used >= 3) return;

    // Only one visitor per season globally
    const currentSeason = seasonName(this.room);
    if (this.room.lastVisitorSeason === currentSeason) return;

    // Chance logic: ensure at least once by mid-game; otherwise low chance
    const seasons = Math.max(0, this.room.seasonsElapsed|0);
    let chance = 0.0;
    if (used === 0 && seasons >= 4) chance = 0.25; // push to send by mid-game
    else chance = 0.02; // otherwise small chance per turn

    if (Math.random() < chance){
      const targets = Object.keys(this.room.state).filter(id=>id!==playerId);
>>>>>>> 0080bf9 (Initial commit)
      if (!targets.length) return;
      const to = targets[Math.floor(Math.random()*targets.length)];
      const id = Math.random().toString(36).slice(2,10);

<<<<<<< HEAD
      // Randomly choose trader or robber (50/50)
      const kind = Math.random() < 0.5 ? 'trader' : 'robber';

      // Generate lore message
      const loreMessage = generateVisitorLore(playerId, p.civ || 'Unknown');

      // Store visitor (new system)
      if (!this.room.pendingVisits) this.room.pendingVisits = {};
      this.room.pendingVisits[id] = {
        id,
        from: playerId,
        to,
        kind: kind,
        lore: loreMessage,
        ts: Date.now()
      };
=======
      const kind = (Math.random() < 0.5) ? 'trader' : 'robber';
      const loreMessage = generateVisitorLore(playerId, p.civ || 'Unknown');

      if (!this.room.pendingVisits) this.room.pendingVisits = {};
      this.room.pendingVisits[id] = { id, from: playerId, to, kind, lore: loreMessage, ts: Date.now() };
>>>>>>> 0080bf9 (Initial commit)

      // Mark that a visitor was sent this season (room-wide)
      this.room.lastVisitorSeason = currentSeason;

<<<<<<< HEAD
      // Spend coins
      p.resources.coins -= 5;

      // Notify recipient
=======
      // Spend coins (server sendVisit uses 10 coins)
      p.resources.coins -= 10;

      // Track usage
      this.room.aiVisitorCounts[playerId] = used + 1;

      // Notify recipient immediately
>>>>>>> 0080bf9 (Initial commit)
      for (const sid of socketsForPlayer(this.room, to)) {
        io.to(sid).emit("visitorOffer", this.room.pendingVisits[id]);
      }

<<<<<<< HEAD
      this.log(`AI ${playerId} dispatched a ${kind} to ${to}.`);
=======
      // If recipient is AI, auto-consider the visitor after delay (same behavior as human-initiated visits)
      const recipient = this.room.state[to];
      if (recipient?.isAi) {
        this.considerVisitorOffer(to, this.room.pendingVisits[id]);
      }

      this.log(`AI ${playerId} dispatched a trader to ${to}. (${this.room.aiVisitorCounts[playerId]}/3)`);
>>>>>>> 0080bf9 (Initial commit)
      broadcastRoomUpdate(this.room);
    }
  }

  // Evaluate and possibly accept pending trade offers addressed to AI
  considerPendingTrades(playerId){
    const room = this.room; if (!room) return;
    const entries = Object.entries(room.pendingTrades||{});
    if (!entries.length) return;
    const p = room.state[playerId]; if (!p) return;

<<<<<<< HEAD
    // Determine current target to assess needs
    const target = this.pickTargetBuilding(p);
    const needMap = Object.assign({ wood:0, rock:0, metal:0, food:0, coins:0 }, (target?.def?.cost||{}));

=======
>>>>>>> 0080bf9 (Initial commit)
    for (const [offerId, offer] of entries){
      if (!offer || offer.to !== playerId) continue;
      const fromP = room.state[offer.from]; const toP = room.state[offer.to];
      if (!fromP || !toP) continue;

      // Both must have a Move to complete trade
      if (!hasMove(fromP) || !hasMove(toP)) continue;

<<<<<<< HEAD
      const unit = BASE.tradeUnitPrice||{ wood:4, rock:4, metal:4, food:4 };
      const giveValue = (offer.give.amount|0) * (unit[offer.give.type]||4);
      const wantValue = (offer.want.amount|0) * (unit[offer.want.type]||4);

      // Surplus if resource above target need by a margin
      const haveGive = (toP.resources[offer.give.type]||0);
      const needGive = Math.max(0, (needMap[offer.give.type]||0));
      const surplusAfter = haveGive - offer.give.amount - needGive;
      const isSurplus = surplusAfter >= 0; // don't dip below needs

      // Needed if want type deficit remains
      const haveWant = (toP.resources[offer.want.type]||0);
      const wantNeed = Math.max(0, (needMap[offer.want.type]||0) - haveWant);
      const helpsNeed = (offer.want.type==='coins') ? ((needMap.coins||0) > haveWant) : (wantNeed > 0);

      // Fairness: accept if want value <= give value * 1.15
      const fair = wantValue <= Math.ceil(giveValue * 1.15);

      if (fair && isSurplus && (helpsNeed || target==null)){
        // Execute accept (mirrors server respondTrade accept path)
        // Validate resources
        const has = (pl,t,a)=> (pl.resources[t]||0) >= a;
        if (!has(fromP, offer.give.type, offer.give.amount)) continue;
        if (!has(toP, offer.want.type, offer.want.amount)) continue;

=======
      // Evaluate strict 3:1 value ratio (what AI receives vs what AI pays)
      const unit = { wood:1, rock:1, metal:1, food:1, coins:1 };
      const receiveValue = (offer.give.amount|0) * (unit[offer.give.type]||1);
      const payValue = (offer.want.amount|0) * (unit[offer.want.type]||1);
      const ratioOK = payValue>0 ? (receiveValue / payValue) >= 3 : false;

      // Validate resources
      const has = (pl,t,a)=> (pl.resources[t]||0) >= a;
      const senderHas = has(fromP, offer.give.type, offer.give.amount);
      const receiverCanPay = has(toP, offer.want.type, offer.want.amount);

      if (ratioOK && senderHas && receiverCanPay){
>>>>>>> 0080bf9 (Initial commit)
        consumeMove(fromP);
        consumeMove(toP);
        fromP.resources[offer.give.type]-=offer.give.amount;
        toP.resources[offer.give.type]=(toP.resources[offer.give.type]||0)+offer.give.amount;
        toP.resources[offer.want.type]-=offer.want.amount;
        fromP.resources[offer.want.type]=(fromP.resources[offer.want.type]||0)+offer.want.amount;
        delete room.pendingTrades[offerId];
<<<<<<< HEAD
        addGameLog(room, `${offer.from} and ${offer.to} traded: ${offer.give.amount} ${offer.give.type} for ${offer.want.amount} ${offer.want.type}`, "trade");
        fromP.progress = computeProgress(fromP);
        toP.progress = computeProgress(toP);
        this.log(`AI ${playerId} accepted trade from ${offer.from}: gave ${offer.give.amount} ${offer.give.type}, got ${offer.want.amount} ${offer.want.type}.`);
        broadcastRoomUpdate(room);
        // Only accept one per consideration step to avoid burning all Moves at once
        break;
=======
        addGameLog(room, `${offer.to} accepted a 3:1 trade from ${offer.from}: got ${offer.give.amount} ${offer.give.type} for ${offer.want.amount} ${offer.want.type}`, "trade");
        fromP.progress = computeProgress(fromP);
        toP.progress = computeProgress(toP);
        this.log(`AI ${playerId} accepted trade (>=3:1) from ${offer.from}.`);
        broadcastRoomUpdate(room);
        break; // accept only one per consideration
      } else {
        // Reject: remove the offer to keep inbox clean
        delete room.pendingTrades[offerId];
        addGameLog(room, `${offer.to} rejected trade from ${offer.from} (below 3:1 or insufficient resources).`, "trade");
        broadcastRoomUpdate(room);
>>>>>>> 0080bf9 (Initial commit)
      }
    }
  }

<<<<<<< HEAD
=======
  // Occasionally propose a simple even trade to another player (equal quantities)
  maybeOfferEvenTrade(playerId){
    const room = this.room; if (!room) return;
    const p = room.state[playerId]; if (!p) return;
    if ((p.ap|0) < 1) return;

    // Cap number of AI-initiated offers per game to avoid spam
    if (!room.aiTradeOffers) room.aiTradeOffers = {};
    const used = room.aiTradeOffers[playerId] || 0;
    if (used >= 3) return;

    if (Math.random() < 0.06){ // small chance per turn when acting
      const others = Object.keys(room.state).filter(id=>id!==playerId);
      if (!others.length) return;
      const to = others[Math.floor(Math.random()*others.length)];
      const types = ['wood','rock','metal','food'];
      const giveType = types[Math.floor(Math.random()*types.length)];
      let wantType = types[Math.floor(Math.random()*types.length)];
      if (wantType === giveType) wantType = types[(types.indexOf(wantType)+1)%types.length];
      const amount = 10 + Math.floor(Math.random()*11); // 10-20

      // Must have enough to give
      if ((p.resources[giveType]||0) < amount) return;

      // Spend AP via proposeTrade handler (it will validate and spend)
      const id = Math.random().toString(36).slice(2,10);
      room.pendingTrades[id] = { id, from:playerId, to, give:{ type:giveType, amount }, want:{ type:wantType, amount }, ts:Date.now() };
      // Consume one AP manually (bypass socket)
      p.ap = Math.max(0, (p.ap|0)-1);
      // Notify target
      for (const sid of socketsForPlayer(room, to)) io.to(sid).emit("tradeOffer", room.pendingTrades[id]);
      room.aiTradeOffers[playerId] = used + 1;
      addGameLog(room, `${playerId} proposed a trade to ${to}: ${amount} ${giveType} for ${amount} ${wantType}`, 'trade');
      broadcastRoomUpdate(room);
    }
  }

>>>>>>> 0080bf9 (Initial commit)
  // Handle incoming visitor offers for AI players
  considerVisitorOffer(playerId, visitor) {
    const room = this.room;
    const p = room.state[playerId];
    if (!p || !p.isAi) return;

<<<<<<< HEAD
    // AI decision logic:
    // - Traders are usually beneficial (+5 coins if accepted)
    // - Robbers are risky (steal coins or resources if accepted)
    // - AI will accept traders 80% of the time
    // - AI will reject robbers 70% of the time (good intuition)

    let decision = 'reject';

    if (visitor.kind === 'trader') {
      // Accept traders most of the time (80%)
      decision = Math.random() < 0.8 ? 'accept' : 'reject';
      this.log(`AI ${playerId} decided to ${decision} trader from ${visitor.from}.`);
    } else {
      // Reject robbers most of the time (70% rejection rate = 30% acceptance)
      decision = Math.random() < 0.3 ? 'accept' : 'reject';
      this.log(`AI ${playerId} decided to ${decision} suspicious visitor from ${visitor.from}.`);
    }

    // Execute the decision immediately
    const receiver = room.state[playerId];
    const sender = room.state[visitor.from];
    const notify = (pid, msg) => {
      for (const [sid, pid2] of Object.entries(room.playersBySocket)) {
        if (pid2 === pid) io.to(sid).emit("toast", { text: msg });
      }
    };

    if (decision === 'accept') {
      if (visitor.kind === 'trader') {
        receiver.resources.coins = (receiver.resources.coins || 0) + 5;
        notify(playerId, `✅ Trader received: +5 coins.`);
        notify(visitor.from, `✅ ${playerId} welcomed your trader. You gain +5 coins (trader returned).`);
        sender.resources.coins = (sender.resources.coins || 0) + 5;
        addGameLog(room, `${playerId} accepted trader from ${visitor.from}. Both gained coins.`, "trade");
        addPersonalLog(room, playerId, `Accepted trader from ${visitor.from}: +5 coins`);
        addPersonalLog(room, visitor.from, `${playerId} accepted your trader: +5 coins`);
      } else {
        // robber outcome when admitted
        const keys = ['wood', 'rock', 'metal', 'food'];
        if ((receiver.resources.coins || 0) >= 5) {
          receiver.resources.coins -= 5;
          sender.resources.coins = (sender.resources.coins || 0) + 10;
          notify(playerId, `⚠️ A disguised robber stole 5 coins!`);
          notify(visitor.from, `✅ ${playerId} admitted your robber. You gained 10 coins (5 stolen + 5 bank).`);
          addGameLog(room, `${playerId} admitted ${visitor.from}'s robber. Lost 5 coins, ${visitor.from} gained 10 coins.`, "military");
          addPersonalLog(room, playerId, `Admitted robber from ${visitor.from}: -5 coins stolen!`);
          addPersonalLog(room, visitor.from, `${playerId} admitted your robber: +10 coins (5 stolen + 5 bonus)`);
        } else {
          const options = keys.filter(k => (receiver.resources[k] || 0) > 0);
          let stoleType = null, stoleAmt = 0;
          if (options.length) {
            stoleType = options[Math.floor(Math.random() * options.length)];
            stoleAmt = receiver.resources[stoleType] || 0;
            receiver.resources[stoleType] = 0;
            sender.resources[stoleType] = (sender.resources[stoleType] || 0) + stoleAmt;
            notify(playerId, `⚠️ A disguised robber stole all your ${stoleType} (${stoleAmt})!`);
            notify(visitor.from, `✅ Your robber stole ${stoleAmt} ${stoleType} and gained +5 coins from the bank.`);
            sender.resources.coins = (sender.resources.coins || 0) + 5;
            addGameLog(room, `${playerId} admitted ${visitor.from}'s robber. Lost ${stoleAmt} ${stoleType}, ${visitor.from} gained it + 5 coins.`, "military");
            addPersonalLog(room, playerId, `Admitted robber from ${visitor.from}: -${stoleAmt} ${stoleType} stolen!`);
            addPersonalLog(room, visitor.from, `${playerId} admitted your robber: +${stoleAmt} ${stoleType} + 5 coins`);
          } else {
            notify(playerId, `⚠️ A disguised robber found nothing to steal.`);
            notify(visitor.from, `✅ Robber found nothing to steal but you gained +5 coins from the bank.`);
            sender.resources.coins = (sender.resources.coins || 0) + 5;
            addGameLog(room, `${playerId} admitted ${visitor.from}'s robber but had nothing to steal. ${visitor.from} gained 5 coins.`, "military");
            addPersonalLog(room, playerId, `Admitted robber from ${visitor.from} but had nothing to steal`);
            addPersonalLog(room, visitor.from, `${playerId} admitted your robber: +5 coins (nothing to steal)`);
          }
        }
      }
    } else {
      // reject
      notify(playerId, `🚫 You turned the visitor away.`);
      if (visitor.kind === 'trader') {
        sender.resources.coins = (sender.resources.coins || 0) + 10;
        notify(visitor.from, `🚫 ${playerId} rejected your trader. You gained 10 coins (returned with profit).`);
        addGameLog(room, `${playerId} rejected trader from ${visitor.from}. ${visitor.from} gained 10 coins.`, "trade");
        addPersonalLog(room, playerId, `Rejected trader from ${visitor.from}`);
        addPersonalLog(room, visitor.from, `${playerId} rejected your trader: +10 coins (returned with profit)`);
      } else {
        notify(visitor.from, `🚫 Your robber was uncovered and thrown out the gate in shame.`);
        addGameLog(room, `${playerId} rejected ${visitor.from}'s robber. Robber was uncovered!`, "military");
        addPersonalLog(room, playerId, `Rejected suspicious visitor from ${visitor.from} (was a robber!)`);
        addPersonalLog(room, visitor.from, `${playerId} uncovered your robber - no gains`);
      }
    }

    // Remove visit from pendingVisits
    delete room.pendingVisits[visitor.id];

    // NOTE: Do NOT clear room.lastVisitorSeason here - it stays set for the entire season
    // It will be cleared when the season changes in nextSeason()

    // Update state
    broadcastRoomUpdate(room);
=======
    // Delay 5 seconds before deciding
    setTimeout(() => {
      // Ensure still pending and player exists
      if (!room || !room.state[playerId]) return;
      if (!room.pendingVisits || !room.pendingVisits[visitor.id]) return;

      // 50/50 decision for any visitor type
      const decision = Math.random() < 0.5 ? 'accept' : 'reject';
      this.log(`AI ${playerId} will ${decision} a ${visitor.kind} from ${visitor.from} after thinking.`);

      const receiver = room.state[playerId];
      const sender = room.state[visitor.from];
      if (!receiver || !sender) { delete room.pendingVisits[visitor.id]; return; }

      const notifyWithImage = (pid, msg, type = 'trader') => {
        let imagePath = '/media/trader.png';
        if (type === 'robber') imagePath = '/media/robber.png';
        else if (type === 'spy') imagePath = '/media/spy.png';
        for (const [sid, pid2] of Object.entries(room.playersBySocket)) {
          if (pid2 === pid) io.to(sid).emit("visitorOutcome", { message: msg, type, image: imagePath });
        }
      };

      if (decision === 'accept') {
        if (visitor.kind === 'trader') {
          receiver.resources.coins = (receiver.resources.coins || 0) + 20;
          sender.resources.coins = (sender.resources.coins || 0) + 20;
          notifyWithImage(playerId, `Good trade practices! You welcomed ${visitor.from}'s trader and gained 20 Golden Coins.`, 'trader');
          notifyWithImage(visitor.from, `${playerId} welcomed your trader! You both prosper. You gained 20 Golden Coins.`, 'trader');
          addGameLog(room, `${playerId} accepted trader from ${visitor.from}. Both gained 20 coins.`, 'trade');
        } else if (visitor.kind === 'spy') {
          receiver.resources.coins = (receiver.resources.coins || 0) + 20;
          const defense = Math.round(Math.max(0, Math.min(1, computeDefense(receiver))) * 100);
          const resourceKeys = ['wood', 'rock', 'metal', 'food'];
          const shuffled = resourceKeys.sort(() => Math.random() - 0.5);
          const res1 = shuffled[0];
          const res2 = shuffled[1];
          const res1Amt = receiver.resources[res1] || 0;
          const res2Amt = receiver.resources[res2] || 0;
          notifyWithImage(playerId, `Good trade practices! You welcomed ${visitor.from}'s trader and gained 20 Golden Coins.`, 'trader');
          notifyWithImage(visitor.from, `🕵️ Your spy successfully gathered intelligence on ${playerId}:\n\nDefense: ${defense}%\nResources: ${res1Amt} ${res1}, ${res2Amt} ${res2}`, 'spy');
          addGameLog(room, `${playerId} accepted trader from ${visitor.from}.`, 'trade');
        } else {
          if ((receiver.resources.coins || 0) >= 10) {
            receiver.resources.coins -= 10;
            sender.resources.coins = (sender.resources.coins || 0) + 20;  // Get back 10 coins spent + 10 stolen = 20 total
            const robberStory = ROBBER_LORE[Math.floor(Math.random() * ROBBER_LORE.length)];
            notifyWithImage(playerId, `You were deceived! What appeared to be a trader was actually a robber in disguise!\n\n${robberStory}`, 'robber');
            notifyWithImage(visitor.from, `Your robber successfully deceived ${playerId}! ${robberStory}\n\nYou gained 10 Golden Coins from the theft.`, 'robber');
            addGameLog(room, `${playerId} was deceived by ${visitor.from}'s robber disguised as trader.`, 'military');
          } else {
            const keys = ['wood','rock','metal','food'];
            const options = keys.filter(k => (receiver.resources[k] || 0) > 0);
            if (options.length){
              const stoleType = options[Math.floor(Math.random() * options.length)];
              const stoleAmt = receiver.resources[stoleType] || 0;
              receiver.resources[stoleType] = 0;
              sender.resources[stoleType] = (sender.resources[stoleType] || 0) + stoleAmt;
              sender.resources.coins = (sender.resources.coins || 0) + 5;
              notifyWithImage(playerId, `You were deceived! A robber stole all your ${stoleType} (${stoleAmt}).`, 'robber');
              notifyWithImage(visitor.from, `Your robber stole ${stoleAmt} ${stoleType} and gained +5 coins.`, 'robber');
              addGameLog(room, `${playerId} admitted ${visitor.from}'s robber. Lost ${stoleAmt} ${stoleType}; ${visitor.from} gained it + 5 coins.`, 'military');
            } else {
              sender.resources.coins = (sender.resources.coins || 0) + 5;
              notifyWithImage(playerId, `A disguised robber found nothing to steal.`, 'robber');
              notifyWithImage(visitor.from, `Robber found nothing to steal but you gained +5 coins.`, 'robber');
              addGameLog(room, `${playerId} admitted ${visitor.from}'s robber but had nothing to steal. ${visitor.from} gained 5 coins.`, 'military');
            }
          }
        }
      } else {
        if ((visitor.disguisedAs || visitor.kind) === 'trader') {
          sender.resources.coins = (sender.resources.coins || 0) + 20;
          notifyWithImage(playerId, `You lost good business, ${visitor.from}! Your opponent will benefit. They will take 20 Golden Coins back to ${visitor.from}.`, 'trader');
          notifyWithImage(visitor.from, `${playerId} rejected your trader. Your trader returns with 20 Golden Coins profit.`, 'trader');
          addGameLog(room, `${playerId} rejected trader from ${visitor.from}. ${visitor.from} gained 20 coins.`, 'trade');
        } else if (visitor.kind === 'spy') {
          notifyWithImage(playerId, `Suspicious visitor turned away.`, 'spy');
          notifyWithImage(visitor.from, `${playerId} rejected your spy. No intelligence gained.`, 'spy');
          addGameLog(room, `${playerId} rejected ${visitor.from}'s spy.`, 'military');
        } else {
          notifyWithImage(playerId, `You turned away a suspicious visitor.`, 'robber');
          notifyWithImage(visitor.from, `${playerId} rejected your robber.`, 'robber');
          addGameLog(room, `${playerId} rejected ${visitor.from}'s robber.`, 'military');
        }
      }

      delete room.pendingVisits[visitor.id];
      broadcastRoomUpdate(room);

      // If it's still this AI's turn after resolving the visitor, resume the AI turn
      try {
        if (this.room && this.room.active && this.room.turnOf === playerId) {
          setTimeout(() => {
            if (this.room && this.room.active && this.room.turnOf === playerId) {
              this.playTurn(this.room, playerId);
            }
          }, 100);
        }
      } catch(e) {}
    }, 5000);
>>>>>>> 0080bf9 (Initial commit)
  }

  playTurn(room, playerId) {
    const player = this.room.state[playerId];
    if (!player || !player.isAi) return;

<<<<<<< HEAD
    this.log(`AI ${playerId} is starting its turn in state: ${this.currentState}`);
    // Out-of-band diplomacy: maybe send a visitor at start of turn
    this.maybeSendVisitor(playerId);
    // Consider pending trades sent to AI
=======
    // Initialize per-age quotas and tracking
    if (!player.aiPlan) player.aiPlan = { trainedSoldiers:{ Wood:0, Stone:0, Modern:0 }, wars:{ Wood:0, Stone:0, Modern:0 } };
    const TRAIN_TARGET_SOLDIERS = { Wood:2, Stone:4, Modern:8 };
    const WAR_MAX = { Wood:1, Stone:2, Modern:3 };
    const FOOD_TARGET = { Wood:25, Stone:50, Modern:100 };

    this.log(`AI ${playerId} is starting its turn in state: ${this.currentState}`);
    // Diplomacy: maybe send a visitor and propose a simple resource swap
    this.maybeSendVisitor(playerId);
    this.maybeOfferEvenTrade(playerId);
    // Consider pending trades sent to AI (uses 3:1 rule)
>>>>>>> 0080bf9 (Initial commit)
    this.considerPendingTrades(playerId);
    if (Math.random() < 0.1) this.sendChatMessage(playerId);

    // Take multiple actions until Moves (AP) are spent or the turn changes
    let safety = 0;
    while (this.room.active && this.room.turnOf === playerId && (player.ap|0) > 0 && safety < 12) {
      safety += 1;
      const beforeSnap = this.snapshotPlayer(player);

<<<<<<< HEAD
      // Priority: build towards 2 buildings in current age, then advance; spend AP only on gathering to reach next build
      const buildable = this.getBuildableBuildings(player);
      if (buildable.length > 0) {
        const building = buildable[0];
        this.log(`AI ${playerId} is building ${building.name}.`);
        this.performAction(this.room, playerId, "build", { name: building.name });
      } else if (this.canAdvance(player)) {
        this.log(`AI ${playerId} is advancing to the next age.`);
        this.performAction(this.room, playerId, "advance", {});
      } else {
        // Gather AP towards the most needed resource for the next target building
        const target = this.pickTargetBuilding(player);
        if (target){
          const needed = this.mostNeededResourceFor(target.def.cost, player.resources);
          if (needed === 'coins'){
            const raised = this.tryRaiseCoins(player, target.def.cost);
            if (!raised){
              // fallback to best general gather if cannot raise coins right now
              const resources = ["wood","rock","metal","food"];
              const type = resources[Math.floor(Math.random()*resources.length)];
              this.log(`AI ${playerId} is gathering ${type} (fallback).`);
              this.performAction(this.room, playerId, "gather", { type });
            }
          } else {
            this.log(`AI ${playerId} is gathering ${needed} for ${target.name}.`);
            this.performAction(this.room, playerId, "gather", { type: needed });
          }
        } else {
          // Fallback: balanced gather
          this.log(`AI ${playerId} is gathering resources.`);
          this.gatherResources(room, player, playerId);
=======
      // Try to advance age if eligible (no AP cost)
      this.performAction(this.room, playerId, "advance", {});

      // Ensure food safety: never let food drop below target for current age
      const minFood = FOOD_TARGET[player.age] || 25;
      if ((player.resources.food|0) < minFood) {
        this.log(`AI ${playerId} is gathering food to maintain minimum (${minFood}).`);
        this.performAction(this.room, playerId, "gather", { type: 'food' });
      } else {
        // Secondary: soldiers (train quotas) and limited wars per age
        const canAct = (player.ap|0) > 0;
        if (canAct && !(player.raid && player.raid.active)) {
          const age = player.age;

          // Attempt training until soldier-count target per age is met
          const trainedSoFarSoldiers = player.aiPlan.trainedSoldiers[age]||0;
          const neededSoldiers = TRAIN_TARGET_SOLDIERS[age]||0;
          if (trainedSoFarSoldiers < neededSoldiers) {
            const capNow = soldierCap(player);
            const current = Math.max(0, player.soldiers|0);
            const tConf = BASE.soldierTraining[age] || BASE.soldierTraining.Wood;
            const batchSize = tConf.batchSize || 2;
            const missing = Math.max(0, capNow - current);
            const canAff = canAfford(player.resources, tConf.cost||{});
            const willStayAboveMin = ((player.resources.food|0) - (tConf.cost?.food||0)) >= minFood;
            if ((current < capNow) && (missing >= batchSize)) {
              if (!canAff) {
                // Raise coins if needed; otherwise gather food to enable training later
                this.tryRaiseCoins(player, tConf.cost||{});
              }
              if (canAfford(player.resources, tConf.cost||{}) && willStayAboveMin) {
                this.log(`AI ${playerId} is training soldiers (target soldiers).`);
                this.performAction(this.room, playerId, "train", { batches: 1 });
                player.aiPlan.trainedSoldiers[age] = (player.aiPlan.trainedSoldiers[age]||0) + batchSize;
              }
            } else if (missing < batchSize) {
              // Not enough capacity for a batch — build a soldierCap structure in current age if affordable
              const ageDefs = BUILDINGS[age] || {};
              let pickName = null, pickCostSum = Infinity;
              for (const [bName, bDef] of Object.entries(ageDefs)){
                if (player.structures[bName]) continue;
                if (!bDef?.effect?.soldierCap) continue;
                const cost = bDef.cost || {};
                if (!canAfford(player.resources, cost)) continue;
                const sum = Object.values(cost).reduce((a,b)=>a+(b||0),0);
                if (sum < pickCostSum){ pickCostSum = sum; pickName = bName; }
              }
              if (pickName){
                this.log(`AI ${playerId} is building ${pickName} to increase army cap.`);
                this.performAction(this.room, playerId, "build", { name: pickName });
              }
            }
          } else {
            // Training target met; consider war up to per-age maximum, regardless of success chance
            const warsSoFar = player.aiPlan.wars[age]||0;
            const warMax = WAR_MAX[age]||0;
            if (warsSoFar < warMax) {
              const available = Math.max(0, player.soldiers|0);
              const minCommit = Math.max(3, BASE.raid.minCommit|0);
              if (available >= minCommit) {
                // Commit a reasonable portion of the army (up to 70%), at least minCommit
                const chosen = Math.max(minCommit, Math.floor(available * 0.5));
                this.log(`AI ${playerId} is launching a raid with ${chosen} soldiers (quota, ignoring success rate).`);
                this.performAction(this.room, playerId, "raid", { commit: chosen });
                player.aiPlan.wars[age] = warsSoFar + 1;
              }
            }
          }
        }

        // Economy priorities: build towards age goals; else gather towards next target
        const buildable = this.getBuildableBuildings(player);
        if (buildable.length > 0) {
          const building = buildable[0];
          this.log(`AI ${playerId} is building ${building.name}.`);
          this.performAction(this.room, playerId, "build", { name: building.name });
        } else {
          const target = this.pickTargetBuilding(player);
          if (target){
            const needed = this.mostNeededResourceFor(target.def.cost, player.resources);
            if (needed === 'coins'){
              const raised = this.tryRaiseCoins(player, target.def.cost);
              if (!raised){
                const resources = ["wood","rock","metal","food"];
                const type = resources[Math.floor(Math.random()*resources.length)];
                this.log(`AI ${playerId} is gathering ${type} (fallback).`);
                this.performAction(this.room, playerId, "gather", { type });
              }
            } else {
              this.log(`AI ${playerId} is gathering ${needed} for ${target.name}.`);
              this.performAction(this.room, playerId, "gather", { type: needed });
            }
          } else {
            this.log(`AI ${playerId} is gathering resources.`);
            this.gatherResources(room, player, playerId);
          }
>>>>>>> 0080bf9 (Initial commit)
        }
      }

      // Refresh player ref (state mutates synchronously)
      const afterSnap = this.snapshotPlayer(player);
      this.logDelta(playerId, beforeSnap, afterSnap, 'action result');
<<<<<<< HEAD
      // If no AP was spent and no free action changed state, attempt a gather to ensure progress
      if (this.room.turnOf !== playerId) break;
=======
      
      // Check if turn changed (action may have auto-ended turn)
      if (this.room.turnOf !== playerId) break;
      
      // If no AP was spent and no free action changed state, attempt a gather to ensure progress
>>>>>>> 0080bf9 (Initial commit)
      if ((afterSnap.ap|0) === (beforeSnap.ap|0)) {
        // Force a gather to drain one Move
        this.gatherResources(room, player, playerId);
        const afterForce = this.snapshotPlayer(player);
        this.logDelta(playerId, afterSnap, afterForce, 'forced gather');
<<<<<<< HEAD
      }
    }
    // If loop ended while still AI's turn, and AP is 0, the core handler will auto-end.
    // Log turn end condition for clarity.
=======
        
        // Check again if turn changed after forced gather
        if (this.room.turnOf !== playerId) break;
        
        // If forced gather also didn't consume AP, something is wrong - break to prevent infinite loop
        if ((afterForce.ap|0) === (afterSnap.ap|0)) {
          this.log(`AI ${playerId} stuck - forced gather didn't work, breaking loop`);
          break;
        }
      }
    }
>>>>>>> 0080bf9 (Initial commit)
    if (this.room.turnOf === playerId) {
      const p = this.room.state[playerId];
      if ((p.ap|0) === 0) {
        this.log(`AI ${playerId} spent all Moves and should end turn automatically.`);
      } else if (safety >= 12) {
        this.log(`AI ${playerId} hit safety limit; stopping actions.`);
      }
    }
  }

  gatherResources(room, player, playerId) {
    const resources = ["wood", "rock", "metal", "food"];
    const resourceToGather = resources[Math.floor(Math.random() * resources.length)];
    this.performAction(this.room, playerId, "gather", { type: resourceToGather });
  }

  getBuildableBuildings(player) {
    const buildableBuildings = [];
<<<<<<< HEAD
    for (const age of AGES) {
      if (AGES.indexOf(age) <= AGES.indexOf(player.age)) {
        for (const buildingName in BUILDINGS[age]) {
          if (!player.structures[buildingName]) {
            const building = BUILDINGS[age][buildingName];
            if (canAfford(player.resources, building.cost)) {
              buildableBuildings.push({ name: buildingName, ...building });
            }
          }
=======
    const age = player.age;
    for (const buildingName in (BUILDINGS[age] || {})) {
      if (!player.structures[buildingName]) {
        const building = BUILDINGS[age][buildingName];
        if (canAfford(player.resources, building.cost)) {
          buildableBuildings.push({ name: buildingName, ...building });
>>>>>>> 0080bf9 (Initial commit)
        }
      }
    }
    return buildableBuildings;
  }

<<<<<<< HEAD
  canAdvance(player) {
    const idx = AGES.indexOf(player.age);
    if (idx >= AGES.length - 1) return false;
    const names = Object.keys(BUILDINGS[player.age] || {});
    const have = names.filter((n) => !!player.structures[n]).length;
    if (have >= 2) {
      return true;
    }
    return false;
  }

=======
>>>>>>> 0080bf9 (Initial commit)
  trade(player, playerId) {
    const resources = ["wood", "rock", "metal", "food"];
    const resourceToSell = resources[Math.floor(Math.random() * resources.length)];
    const resourceToBuy = resources[Math.floor(Math.random() * resources.length)];
    const amountToSell = Math.floor(Math.random() * 100);
    const amountToBuy = Math.floor(Math.random() * 100);

    let acted = false;
    if (player.resources[resourceToSell] > amountToSell && (player.ap|0) > 0) {
      this.performAction(this.room, playerId, "trade", { mode: "sell", type: resourceToSell, amount: amountToSell });
      acted = true;
    }
    if (player.resources.coins > amountToBuy * 4 && (player.ap|0) > 0) {
      this.performAction(this.room, playerId, "trade", { mode: "buy", type: resourceToBuy, amount: amountToBuy });
      acted = true;
    }
    return acted;
  }

  militaryAction(player, playerId) {
    if ((player.ap|0) <= 0) return false;
    if (player.soldiers > 50 && (this.room.monthIndex||0) >= 12 && !(player.raid && player.raid.active)) {
      this.performAction(this.room, playerId, "raid", { commit: 40 });
      return true;
    }
    // Try to train if affordable and under cap
    const playerAge = player.age || 'Wood';
    const trainingConfig = BASE.soldierTraining[playerAge] || BASE.soldierTraining.Wood;
    if ((player.resources.food||0) >= (trainingConfig.cost.food||0) && (player.resources.coins||0) >= (trainingConfig.cost.coins||0)) {
      this.performAction(this.room, playerId, "train", { batches: 1 });
      return true;
    }
    return false;
  }

  sendChatMessage(playerId) {
<<<<<<< HEAD
    const message = this.chatMessages[Math.floor(Math.random() * this.chatMessages.length)];
=======
    const p = this.room.state[playerId];
    const civ = p?.civ || 'Romans';
    const CIV_AI_CHAT = {
      Romans: [
        "The Forum thrives on good trade. Make me an offer worthy of Rome.",
        "Our engineers are busy. Stone and order will raise an empire.",
        "Coins flow into the Treasury; perhaps a fair exchange benefits us both."
      ],
      Vikings: [
        "Axes rest, for now. Trade well and we’ll drink to it.",
        "Our longhouse grows. Got rock for my timber?",
        "Storm’s calm today—good time to bargain."
      ],
      Mongols: [
        "Swift deals, swift gains. Let’s swap metal for rock.",
        "The steppe teaches speed. Answer quickly, friend.",
        "Our forges burn hot—send stone and we both prosper."
      ],
      Slavs: [
        "The forest provides; we honor fair trade.",
        "Stone for wood? The village will remember your kindness.",
        "We build steady—offer what you can spare."
      ]
    };
    const pool = CIV_AI_CHAT[civ] || CIV_AI_CHAT.Romans;
    const message = pool[Math.floor(Math.random() * pool.length)];
>>>>>>> 0080bf9 (Initial commit)
    this.room.chat.push({ player: playerId, text: message, ts: Date.now() });
    const latest = this.room.chat.slice(-6).reverse();
    io.to(this.room.code).emit("chatUpdate", latest);
  }
}


// Helper to generate seasonal variations: 1 positive bonus (25-75%) and 1 negative penalty (25-75%)
function generateSeasonalVariations() {
  const variations = {};
  const allResources = ["wood", "rock", "metal", "food"];

  for (const seasonName of SEASON_ORDER) {
    variations[seasonName] = {};
    const theme = SEASON_THEMES[seasonName];

    // Pick 1 random resource for positive bonus (weighted by season theme)
    const positivePool = Math.random() < 0.7 ? theme.positive : allResources;
    const positiveResource = positivePool[Math.floor(Math.random() * positivePool.length)];

    // Pick 1 random resource for negative penalty (weighted by season theme, different from positive)
    const negativePool = Math.random() < 0.7 ? theme.negative : allResources;
    let negativeResource = negativePool[Math.floor(Math.random() * negativePool.length)];
    // Ensure negative is different from positive
    let attempts = 0;
    while (negativeResource === positiveResource && attempts < 10) {
      negativeResource = negativePool[Math.floor(Math.random() * negativePool.length)];
      attempts++;
    }
    if (negativeResource === positiveResource) {
      // Fallback: pick any other resource
      const others = allResources.filter(r => r !== positiveResource);
      negativeResource = others[Math.floor(Math.random() * others.length)];
    }

    // Generate random bonus percentages (25-75%)
    const positiveBonus = SEASON_BONUS_MIN + Math.random() * (SEASON_BONUS_MAX - SEASON_BONUS_MIN);
    const negativePenalty = SEASON_BONUS_MIN + Math.random() * (SEASON_BONUS_MAX - SEASON_BONUS_MIN);

    // Set all resources to 1.0 (neutral)
    for (const resource of allResources) {
      variations[seasonName][resource] = 1.0;
    }

    // Apply the bonuses
    variations[seasonName][positiveResource] = 1.0 + positiveBonus;
    variations[seasonName][negativeResource] = 1.0 - negativePenalty;

    // Generate lore messages for this season's bonuses
    const positiveLorePool = SEASONAL_LORE[positiveResource]?.positive || [];
    const negativeLorePool = SEASONAL_LORE[negativeResource]?.negative || [];

    const positiveLore = positiveLorePool[Math.floor(Math.random() * positiveLorePool.length)] || `${positiveResource} production improved`;
    const negativeLore = negativeLorePool[Math.floor(Math.random() * negativeLorePool.length)] || `${negativeResource} production declined`;

    // Determine intensity based on bonus/penalty percentage
    const positiveIntensity = positiveBonus < 0.35 ? 'moderately' : positiveBonus < 0.45 ? 'greatly' : 'extraordinarily';
    const negativeIntensity = negativePenalty < 0.35 ? 'moderately' : negativePenalty < 0.45 ? 'greatly' : 'extraordinarily';

    // Store lore information
    variations[seasonName].lore = {
      positive: { resource: positiveResource, message: positiveLore, intensity: positiveIntensity },
      negative: { resource: negativeResource, message: negativeLore, intensity: negativeIntensity }
    };
  }

  return variations;
}


function createRoom(code, performAction){
  // Start at random month (0-11)
  const startingMonth = Math.floor(Math.random() * 12);

  const room={
    code,
    playersBySocket:{}, order:[], state:{}, turnOf:null, chat:[], active:false,
    pendingTrades:{}, pendingVisits:{},
    // Seasons state - now based on monthIndex
    seasonEventTriggered: false,
    seasonEventChance: 0.1 + Math.random()*0.1, // 10–20%
    // Track first turn to prevent coin income on game start
    firstTurnEver: true,
    // Dynamic seasonal multipliers (generated once per game)
    seasonalMultipliers: generateSeasonalVariations(),
    seasonsElapsed: 0,
    seasonAttackChance: 0,
    attacksLog: [],
    monthIndex: startingMonth, // Random starting month
    gameLog: [], // Shared game events log (visible to all players)
    aiManager: null,
    // Game statistics tracking
    statistics: {
      startTime: Date.now(),
      endTime: null,
      totalTurns: 0,
      playerStats: {} // Will be populated per player
    }
  };
  // Initialize per-game AI log file
  try{
    ensureLogsDir();
    const filePath = path.join(LOGS_DIR, `ai_${code}.txt`);
    const header = `AI Action Log for Room ${code} — started ${new Date().toISOString()}\n`;
    fs.writeFileSync(filePath, header, { encoding:'utf8' });
    room.logFilePath = filePath;
  }catch(e){ room.logFilePath = null; }

  // Initialize session log for turn tracking
  try{
    ensureLogsDir();
    const sessionPath = path.join(LOGS_DIR, `session_${code}.txt`);
    const sessionHeader = `=== SESSION LOG for Room ${code} ===\nStarted: ${new Date().toISOString()}\nStarting Month: ${startingMonth}\n\n`;
    fs.writeFileSync(sessionPath, sessionHeader, { encoding:'utf8' });
    room.sessionLogPath = sessionPath;
  }catch(e){
    console.error('Failed to create session log:', e);
    room.sessionLogPath = null;
  }

  room.aiManager = new AIManager(room, performAction); // And this line
  ROOMS.set(code,room);
  return room;
}
function socketsForPlayer(room, playerId){ return Object.entries(room.playersBySocket).filter(([sid,pid])=>pid===playerId).map(([sid])=>sid); }
<<<<<<< HEAD
function ensurePlayer(room, playerId, color){
  const isNewPlayer = !room.state[playerId];
  if (isNewPlayer) room.state[playerId]=initialPlayer(color);
=======
function ensurePlayer(room, playerId, color, isAi = false, civ = null){
  const isNewPlayer = !room.state[playerId];
  if (isNewPlayer) room.state[playerId]=initialPlayer(color, isAi, civ);
>>>>>>> 0080bf9 (Initial commit)
  if(!room.order.includes(playerId)) {
    room.order.push(playerId);
    writeSessionLog(room, `PLAYER_JOINED: ${playerId} | Current order: [${room.order.join(', ')}]`);
  }
}
function removePlayerFromRoom(room, playerId){
  if (!room || !playerId) return;
  if (!room.state[playerId] && !room.order.includes(playerId)) return;
  writeSessionLog(room, `PLAYER_REMOVED: ${playerId}`);
  delete room.state[playerId];
  room.order = room.order.filter(id=>id!==playerId);
  // Remove any socket mappings for this player
  for (const [sid,pid] of Object.entries(room.playersBySocket)){
    if (pid===playerId) delete room.playersBySocket[sid];
  }
  // If it was their turn, advance
  if (room.turnOf === playerId){
    if (room.order.length>0){
      room.turnOf = room.order[0];
      // Reset AP for new current player
      const p = room.state[room.turnOf];
      if (p){ p.ap = BASE.apPerTurn; p.bankedAp = 0; }
      startOfTurn(room, room.turnOf);
    } else {
      room.active = false; room.turnOf = null;
    }
  }
  // If active game now has <2 players, deactivate
  if (room.active && room.order.length < 2){ room.active = false; room.turnOf = null; }
}

// Send personalized room updates to each player
function broadcastRoomUpdate(room){
  const roomBase = roomPayload(room);
  const visitPending = Object.values(room.pendingVisits||{}).some(a=>Array.isArray(a)&&a.length>0);
  const chat = room.chat.slice(-6).reverse();

  for (const [sid,pid] of Object.entries(room.playersBySocket)){
    const players = summarize(room, pid); // Personalized player data
    io.to(sid).emit("roomUpdate",{
      room: roomBase, players, buildings:BUILDINGS, ages:AGES,
      prices:BASE.tradeUnitPrice, visitPending, chat
    });
  }
}

// =================== Logging System ===================
function addPersonalLog(room, playerId, message, type="info"){
  const p = room.state[playerId]; if (!p) return;
  if (!p.personalLog) p.personalLog = [];
  p.personalLog.push({ player:playerId, text:message, ts:Date.now(), type, personal:true });
  if (p.personalLog.length > 50) p.personalLog.shift(); // cap at 50 entries
}
function addGameLog(room, message, type="info"){
  if (!room.gameLog) room.gameLog = [];
  room.gameLog.push({ text:message, ts:Date.now(), type, game:true });
  if (room.gameLog.length > 50) room.gameLog.shift(); // cap at 50 entries
}
function seasonName(room){
  // Calculate season based on actual month
  // Real calendar: Spring (Mar, Apr, May), Summer (Jun, Jul, Aug), Autumn (Sep, Oct, Nov), Winter (Dec, Jan, Feb)
  const monthIndex = (room.monthIndex || 0) % 12;

  // Month mapping:
  // 0=Jan(Winter), 1=Feb(Winter), 2=Mar(Spring), 3=Apr(Spring), 4=May(Spring),
  // 5=Jun(Summer), 6=Jul(Summer), 7=Aug(Summer), 8=Sep(Autumn), 9=Oct(Autumn),
  // 10=Nov(Autumn), 11=Dec(Winter)

  if (monthIndex >= 2 && monthIndex <= 4) return "Spring";   // Mar, Apr, May
  if (monthIndex >= 5 && monthIndex <= 7) return "Summer";   // Jun, Jul, Aug
  if (monthIndex >= 8 && monthIndex <= 10) return "Autumn";  // Sep, Oct, Nov
  return "Winter"; // Dec, Jan, Feb
}
function seasonMultiplier(room, type){
  try{
    // Use the dynamically generated multipliers for this specific room
    const season = seasonName(room);
    if (room.seasonalMultipliers && room.seasonalMultipliers[season]) {
      return room.seasonalMultipliers[season][type] || 1;
    }
    // Fallback to base multipliers if variations not available
    return (SEASONS[season].mult||{})[type]||1;
  }catch(e){
    return 1;
  }
}
// Real month names for historical dates
const REAL_MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function calendarInfo(room){
  // Initialize starting year if not set (random between Roman Empire and Mongol Empire times)
  if (!room.startingYear) {
    // Roman Empire: ~27 BC to 476 AD
    // Mongol Empire: ~1206 AD to 1368 AD
    // Mix of both eras: 50 AD to 1300 AD
    room.startingYear = 50 + Math.floor(Math.random() * 1250); // Random year between 50 AD and 1300 AD
  }

  // Initialize starting day if not set
  if (!room.startingDay) {
    room.startingDay = 1 + Math.floor(Math.random() * 28); // Random day 1-28 (safe for all months)
  }

  const totalMonths = Math.max(0, room.monthIndex|0);
  const yearsPassed = Math.floor(totalMonths/12);
  const monthIndex = totalMonths % 12;
  const monthName = REAL_MONTH_NAMES[monthIndex];
  const historicalYear = room.startingYear + yearsPassed;
  const day = room.startingDay;

  // Format: "96 AD, Feb 13" or "1206 AD, March 5"
  const monthAbbrev = monthName.substring(0, 3);
  const yearLabel = `${historicalYear} AD`;

  return {
    totalMonths,
    year: yearsPassed + 1, // Game year (Year 1, Year 2, etc.)
    monthInYear: monthIndex + 1,
    monthName,
    historicalYear,
    day,
    dateString: `${yearLabel}, ${monthAbbrev} ${day}`
  };
}
const notifyPlayer = (room, playerId, text) => {
  for (const [sid,pid] of Object.entries(room.playersBySocket)) if (pid===playerId) io.to(sid).emit("toast",{ text });
};

// Get random raid lore based on civ, age, and outcome
function getRaidLore(civ, age, type){
  // Normalize civ and age
  const normalizedCiv = civ || 'Vikings';
  const normalizedAge = age || 'Wood';

  // Check if lore exists for this combination
  if (!RAID_LORE[type] || !RAID_LORE[type][normalizedCiv] || !RAID_LORE[type][normalizedCiv][normalizedAge]){
    return null; // No lore available
  }

  const stories = RAID_LORE[type][normalizedCiv][normalizedAge];
  if (!stories || stories.length === 0) return null;

  // Pick a random story
  const story = stories[Math.floor(Math.random() * stories.length)];

  // Add appropriate icon based on type
  let icon = '';
  if (type === 'defense') {
    icon = '🛡️ ';
  } else if (type === 'breached') {
    icon = '⚔️ ';
  } else if (type === 'raidSuccess') {
    icon = '🎉 ';
  } else if (type === 'raidFailure') {
    icon = '💀 ';
  }

  return icon + story;
}

<<<<<<< HEAD
=======
function getWarOutcomeLore(civ, successChance) {
  // Normalize civ
  const normalizedCiv = civ || 'Romans';
  const civLore = WAR_OUTCOME_LORE[normalizedCiv];
  
  if (!civLore) return null;
  
  // Determine success bracket
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
  
  const stories = civLore[bracket] || [];
  if (stories.length === 0) return null;
  
  // Pick a random story from the bracket
  return stories[Math.floor(Math.random() * stories.length)];
}

>>>>>>> 0080bf9 (Initial commit)
function collapseStructures(p, count){
  const removed=[];
  const candidates = Object.keys(p.structures).filter(name=>{
    if (name==="Monument") return false;
    const eff = buildingEffect(name);
    return !(eff && eff.wallTier);
  });
  for (let i=0; i<count && candidates.length; i+=1){
    const idx = Math.floor(Math.random()*candidates.length);
    const name = candidates.splice(idx,1)[0];
    if (name){
      removed.push(name);
      delete p.structures[name];
    }
  }
  return removed;
}
function collapseStructuresFromCurrentAge(p, count, playerAge){
  const removed=[];
  // Find buildings from current age only
  const currentAgeBuildings = BUILDINGS[playerAge] || {};
  const candidates = Object.keys(p.structures).filter(name=>{
    if (name==="Monument") return false;
    // Only include buildings from the current age
    if (!currentAgeBuildings[name]) return false;
    const eff = buildingEffect(name);
    return !(eff && eff.wallTier);
  });
  for (let i=0; i<count && candidates.length; i+=1){
    const idx = Math.floor(Math.random()*candidates.length);
    const name = candidates.splice(idx,1)[0];
    if (name){
      removed.push(name);
      delete p.structures[name];
    }
  }
  return removed;
}
function stealResources(p, pct){
  const stolen={};
  const clampPct = Math.min(0.75, Math.max(0, pct));
  for (const key of ["wood","rock","metal","food","coins"]){
    const have = Math.max(0, p.resources[key]||0);
    if (!have) continue;
    const amount = Math.min(have, Math.floor(have * clampPct * (0.5 + Math.random()*0.5)));
    if (amount>0){
      p.resources[key] = have - amount;
      stolen[key]=amount;
    }
  }
  return stolen;
}
function repairWalls(p, tier, intensity){
  if (tier<=0) return null;
  const tierKey = tier>=3 ? "steel" : tier===2 ? "stone" : "wood";
  const baseCost = BASE.defense.wallRepairCosts[tierKey]||{};
  const scale = Math.min(1.5, Math.max(0.5, 0.5 + intensity));
  const spent={};
  for (const [res,val] of Object.entries(baseCost)){
    const have = Math.max(0, p.resources[res]||0);
    if (!have) continue;
    const need = Math.ceil(val * scale);
    const pay = Math.min(need, have);
    if (pay>0){
      p.resources[res] = have - pay;
      spent[res]=pay;
    }
  }
  return Object.keys(spent).length ? spent : null;
}
function resolveTribalAttack(room, playerId, context){
  if (!context?.allowRaids) return null;
  const p = room.state[playerId]; if (!p) return null;
  // No longer check attackChance here - it's checked in resolveSeasonEnd before calling this function

  const defence = computeDefense(p);
  const defencePct = Math.round(defence*100);
  const playerAge = p.age;

  // Age-based defense thresholds
  let safeThreshold, resourceLossThreshold;
  if (playerAge === "Wood") {
    safeThreshold = 0.20;  // 20% defense = safe
    resourceLossThreshold = 0.10;  // Below 10% = buildings destroyed
  } else if (playerAge === "Stone") {
    safeThreshold = 0.40;  // 40% defense = safe
    resourceLossThreshold = 0.20;  // Below 20% = buildings destroyed
  } else { // Modern
    safeThreshold = 0.75;  // 75% defense = safe
    resourceLossThreshold = 0.40;  // Below 40% = buildings destroyed
  }

  // FULLY SAFE - Defense above threshold
  if (defence >= safeThreshold){
    const lore = getRaidLore(p.civ, playerAge, 'defense');
    const message = lore || `🛡️ Raiders attacked but your defenses held strong (${defencePct}% defense). No damage taken!`;
    notifyPlayer(room, playerId, message);
    return { playerId, age: playerAge, outcome:"defended", defence, defencePct, attackStrength: defence, lore };
  }

  // RESOURCE LOSS - Defense below safe threshold but above building destruction threshold
  if (defence >= resourceLossThreshold){
    const stolen = {};
    // Steal random resources
    const resourceTypes = ["wood","rock","metal","food"];
    const numResourcesToSteal = 1 + Math.floor(Math.random() * 2); // 1-2 resource types
    for (let i = 0; i < numResourcesToSteal; i++) {
      const resType = resourceTypes[Math.floor(Math.random() * resourceTypes.length)];
      const have = Math.max(0, p.resources[resType]||0);
      if (have > 0) {
        const amount = Math.floor(have * (0.15 + Math.random()*0.25)); // 15-40% of that resource
        if (amount > 0) {
          p.resources[resType] = have - amount;
          stolen[resType] = (stolen[resType]||0) + amount;
        }
      }
    }
    // Steal half the coins
    const coins = Math.max(0, p.resources.coins||0);
    if (coins > 0) {
      const coinsStolen = Math.floor(coins * 0.5);
      p.resources.coins = coins - coinsStolen;
      stolen.coins = coinsStolen;
    }

    const lootText = Object.keys(stolen).length ? ` Stolen: ${formatResourceBundle(stolen)}.` : "";
    const lore = getRaidLore(p.civ, playerAge, 'breached');
    const message = lore ? `${lore}${lootText}` : `⚠️ Raiders breached your defenses (${defencePct}% defense).${lootText}`;
    notifyPlayer(room, playerId, message);
    return { playerId, age: playerAge, outcome:"breached_resources", defence, defencePct, stolen, attackStrength: defence, lore };
  }

  // BUILDING DESTRUCTION - Defense below critical threshold
  // Steal resources AND destroy 1-2 buildings from current age only
  const stolen = {};
  const resourceTypes = ["wood","rock","metal","food"];
  const numResourcesToSteal = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < numResourcesToSteal; i++) {
    const resType = resourceTypes[Math.floor(Math.random() * resourceTypes.length)];
    const have = Math.max(0, p.resources[resType]||0);
    if (have > 0) {
      const amount = Math.floor(have * (0.20 + Math.random()*0.30)); // 20-50% of that resource
      if (amount > 0) {
        p.resources[resType] = have - amount;
        stolen[resType] = (stolen[resType]||0) + amount;
      }
    }
  }
  // Steal half the coins
  const coins = Math.max(0, p.resources.coins||0);
  if (coins > 0) {
    const coinsStolen = Math.floor(coins * 0.5);
    p.resources.coins = coins - coinsStolen;
    stolen.coins = coinsStolen;
  }

  // Destroy 1-2 buildings from CURRENT AGE only
  const collapseCount = Math.random() < 0.5 ? 1 : 2;
  const collapsed = collapseStructuresFromCurrentAge(p, collapseCount, playerAge);

  p.progress = computeProgress(p);
  const collapseText = collapsed.length ? ` Buildings destroyed: ${collapsed.join(", ")}.` : "";
  const lootText = Object.keys(stolen).length ? ` Stolen: ${formatResourceBundle(stolen)}.` : "";
  const lore = getRaidLore(p.civ, playerAge, 'breached');
  const message = lore ? `${lore}${collapseText}${lootText}` : `🔥 Raiders devastated your city (${defencePct}% defense)!${collapseText}${lootText}`;
  notifyPlayer(room, playerId, message);
  return { playerId, age: playerAge, outcome:"devastated", defence, defencePct, collapsed, stolen, attackStrength: defence, lore };
}
function resolvePendingRaids(room){
  // Player raids always resolve regardless of tribal raid settings
  const reports=[];
  const currentSeason = seasonName(room);
  for (const [pid,p] of Object.entries(room.state)){
    const raid = p.raid;
    if (!raid?.active) continue;
    if (raid.resolvesAfterSeason !== currentSeason) continue;
    const committed = Math.max(0, raid.committed|0);
    const successChance = Math.min(0.90, Math.max(0.05, computeRaidPower(p, committed)));
    const roll = Math.random();
    const loot={};
    let outcome="failure";
    let casualties = 0;
if (roll <= successChance){
      outcome="success";
      if (p.stats) p.stats.raidsSucceeded = (p.stats.raidsSucceeded||0) + 1;
      // Loot scales with army size - more soldiers = more loot
      for (const [res,base] of Object.entries(BASE.raid.lootMultiplier)){
        const armyScaling = committed / Math.max(BASE.raid.minCommit,1);
        const amount = Math.max(0, Math.round(base * (0.6 + Math.random()*0.6) * armyScaling));
        if (amount>0){
          loot[res]=(loot[res]||0)+amount;
        }
      }
      addResources(p.resources, loot);
      // Successful wars have some casualties (0-12% of committed)
      casualties = Math.round(committed * (BASE.raid.casualtyFloor * Math.random()));
} else {
      if (p.stats) p.stats.raidsFailed = (p.stats.raidsFailed||0) + 1;
      // Failed wars have higher casualties (20-40% of committed)
      casualties = Math.max(Math.round(committed * (0.20 + 0.20*Math.random())), 1);
    }
    casualties = Math.min(committed, casualties);
    const survivors = committed - casualties;
    p.soldiers = Math.min(soldierCap(p), (p.soldiers||0) + survivors);
    p.raid = null;

    // Get lore for player raids
    const loreType = outcome === "success" ? 'raidSuccess' : 'raidFailure';
    const lore = getRaidLore(p.civ, p.age, loreType);

    const lootText = Object.keys(loot).length ? ` Loot: ${formatResourceBundle(loot)}.` : "";
    const lossText = casualties>0 ? ` Losses: ${casualties} soldiers.` : "";

    let msg;
    if (lore) {
      // Lore already has icon from getRaidLore
      msg = `${lore}${lootText}${lossText}`;
    } else {
      msg = outcome === "success"
        ? `🎉 War succeeded!${lootText}${lossText}`
        : `⚔️ War failed. Survivors returned empty-handed.${lossText}`;
    }

    notifyPlayer(room, pid, msg);

<<<<<<< HEAD
=======
    // Determine image and add defeat story if failed
    let displayImage = outcome === "success" ? "/media/Dispatched.png" : "/media/defeat.png";
    let defeatStory = "";
    if (outcome === "failure") {
      defeatStory = DEFEAT_LORE[Math.floor(Math.random() * DEFEAT_LORE.length)];
    }

>>>>>>> 0080bf9 (Initial commit)
    // Broadcast a full-screen return notification to all players (result only)
    io.to(room.code).emit("raidReturn", {
      playerId: pid,
      outcome,
      committed,
      casualties,
      loot,
      age: p.age,
      civ: p.civ,
      lore,
<<<<<<< HEAD
      image: "/media/Dispatched.png"
=======
      defeatStory,
      image: displayImage
>>>>>>> 0080bf9 (Initial commit)
    });

    reports.push({ playerId: pid, outcome, committed, casualties, loot, lore });
  }
  return reports;
}
function resolveSeasonEnd(room){
  room.seasonsElapsed = (room.seasonsElapsed||0) + 1;
  const calendar = room.calendar || {};
  const currentYear = calendar.year || 1;
  const currentSeason = seasonName(room);

  // Initialize raid tracking if not exists
  if (!room.raidTracking) {
    room.raidTracking = {
      lastRaidSeason: null,
      playerTriggeredRaidsUsed: {} // Track which players used their season trigger
    };
  }

  const highestAgeIdx = Math.max(0, ...Object.values(room.state).map(p=>AGES.indexOf(p.age)));
  const attackReports = [];

<<<<<<< HEAD
  // Raid system: 20% chance of ONE raid per season
  // If a raid already happened this season (natural or mercenary), no more raids
  const raidAlreadyHappenedThisSeason = room.raidTracking.lastRaidSeason === currentSeason;

  if (raidAlreadyHappenedThisSeason) {
    writeSessionLog(room, `RAID_SKIP: Year ${currentYear}, Season ${currentSeason}, Reason: Raid already occurred this season`);
  } else {
    // 25% chance of raid
    const raidChance = 0.25;
=======
  // Raid system: Skip first season only, then 20% chance per season
  // If a raid already happened this season (natural or mercenary), no more raids
  const raidAlreadyHappenedThisSeason = room.raidTracking.lastRaidSeason === currentSeason;
  
  // Skip first season only (season 1), start checking from season 2
  const seasonsElapsed = room.seasonsElapsed || 0;
  const raidsDisabledFirstSeason = seasonsElapsed < 2; // Block only season 1 (when seasonsElapsed = 1)

  if (raidAlreadyHappenedThisSeason) {
    writeSessionLog(room, `RAID_SKIP: Year ${currentYear}, Season ${currentSeason}, Reason: Raid already occurred this season`);
  } else if (raidsDisabledFirstSeason) {
    writeSessionLog(room, `RAID_SKIP: Year ${currentYear}, Season ${currentSeason}, Reason: No raids during first season (season ${seasonsElapsed})`);
  } else {
    // 20% chance of raid starting from season 2
    const raidChance = 0.20;
>>>>>>> 0080bf9 (Initial commit)
    const raidRoll = Math.random();
    const willRaid = raidRoll < raidChance;

    writeSessionLog(room, `RAID_CHECK: Year ${currentYear}, Season ${currentSeason}, Chance: ${(raidChance * 100).toFixed(0)}%, Roll: ${(raidRoll * 100).toFixed(1)}%, Result: ${willRaid ? 'RAID TRIGGERED' : 'No raid this season'}`);

    if (willRaid) {
      // Pick ONE random player to be attacked
      const playerIds = Object.keys(room.state);
      if (playerIds.length > 0) {
        const targetId = playerIds[Math.floor(Math.random() * playerIds.length)];
        const targetPlayer = room.state[targetId];

        // Notify ALL players that raiders are approaching
        const raidApproachMsg = `⚠️ TRIBAL RAIDERS SPOTTED! A warband approaches ${targetId}'s settlement!`;
        for (const [sid] of Object.entries(room.playersBySocket)) {
          io.to(sid).emit("toast", { text: raidApproachMsg });
        }

        const context = { allowRaids: true, highestAgeIdx };
        const report = resolveTribalAttack(room, targetId, context);
        if (report) {
          attackReports.push(report);
          room.raidTracking.lastRaidSeason = currentSeason;
          writeSessionLog(room, `RAID_EXECUTED: Target ${targetId}, Season: ${currentSeason}`);

          // Notify ALL players of the outcome
          let outcomeMsg = '';
          if (report.outcome === 'defended') {
            outcomeMsg = `🛡️ ${targetId} successfully defended against the raid!`;
          } else if (report.outcome === 'breached_resources') {
            const loot = report.stolen ? Object.entries(report.stolen).map(([k,v]) => `${v} ${k}`).join(', ') : 'minimal loot';
            outcomeMsg = `⚔️ ${targetId}'s defenses were breached! Raiders stole: ${loot}`;
          } else if (report.outcome === 'devastated') {
            const buildings = report.collapsed && report.collapsed.length ? report.collapsed.join(', ') : 'none';
            outcomeMsg = `🔥 ${targetId} was devastated! Buildings destroyed: ${buildings}`;
          }

          // Send outcome to all players
          for (const [sid] of Object.entries(room.playersBySocket)) {
            io.to(sid).emit("toast", { text: outcomeMsg });
          }
        }
      }
    }
  }

  // Execute pending mercenary raids (guaranteed to succeed at end of season)
  if (room.pendingMercenaryRaids && room.pendingMercenaryRaids.length > 0) {
    const MERCENARY_CUT = 0.30; // Mercenaries take 30% of the loot

    room.pendingMercenaryRaids.forEach(mercRaid => {
      const hirer = room.state[mercRaid.hirer];
      const target = room.state[mercRaid.target];

      if (!hirer || !target) return;

      writeSessionLog(room, `MERCENARY_RAID_EXECUTING: Hirer: ${mercRaid.hirer}, Target: ${mercRaid.target}`);

      // Execute the raid (mercenary raids always succeed - 100% breach)
      const context = { allowRaids: true, highestAgeIdx, isMercenaryRaid: true };
      const report = resolveTribalAttack(room, mercRaid.target, context);

      if (report) {
        // Notify players on failure (repelled)
        if (report.outcome === 'defended') {
          try {
            notifyPlayer(room, mercRaid.hirer, '💀 Your mercenaries failed. A lone survivor staggered back — the raid was repelled.');
            notifyPlayer(room, mercRaid.target, '🛡️ Raid repelled! Mercenaries failed to breach your defenses.');
          } catch(e) {}
        }
        // Calculate mercenary cut and hirer's share
        const hirerGains = {};
        const mercenaryCut = {};

        if (report.stolen) {
          Object.entries(report.stolen).forEach(([resource, amount]) => {
            const cutAmount = Math.floor(amount * MERCENARY_CUT);
            const hirerAmount = amount - cutAmount;

            mercenaryCut[resource] = cutAmount;
            hirerGains[resource] = hirerAmount;

            // Transfer hirer's share to them
            if (hirerAmount > 0) {
              hirer.resources[resource] = (hirer.resources[resource] || 0) + hirerAmount;
            }
          });
        }

        // Tag report as mercenary raid and add hirer info
        report.isMercenaryRaid = true;
        report.hirerId = mercRaid.hirer;
        report.hirerGains = hirerGains;
        report.mercenaryCut = mercenaryCut;

        // Add to attack reports
        attackReports.push(report);

        // Mark that a raid happened this season (prevents natural raids)
        room.raidTracking.lastRaidSeason = currentSeason;

        // Log completion
        const gainsList = Object.entries(hirerGains)
          .filter(([, val]) => val > 0)
          .map(([key, val]) => `${val} ${key}`)
          .join(', ') || 'nothing';

        const cutList = Object.entries(mercenaryCut)
          .filter(([, val]) => val > 0)
          .map(([key, val]) => `${val} ${key}`)
          .join(', ') || 'nothing';

        writeSessionLog(room, `MERCENARY_RAID_COMPLETE: Hirer ${mercRaid.hirer} gained ${gainsList}, Mercenaries took ${cutList}`);
      }
    });

    // Clear pending mercenary raids
    room.pendingMercenaryRaids = [];
  }

  const raidReports = resolvePendingRaids(room);
  if (attackReports.length || raidReports.length){
    room.attacksLog.push({ season: seasonName(room), attackReports, raidReports, ts:Date.now() });
  }

  return { attackReports, raidReports };
}
function roomPayload(room){
  return {
    code: room.code,
    turnOf: room.turnOf,
    active: room.active,
    host: room.host,
    season: seasonName(room),
    seasonalMultipliers: room.seasonalMultipliers,
    attackChance: room.seasonAttackChance,
    seasonsElapsed: room.seasonsElapsed,
    calendar: calendarInfo(room),
    gameLog: (room.gameLog||[]).slice(-20) // Send last 20 game log entries
  };
}
function nextSeason(room){
  const seasonSummary = resolveSeasonEnd(room);
  // Season is now calculated from monthIndex, not manually incremented
  room.seasonEventTriggered=false;
  room.seasonEventChance=0.1+Math.random()*0.1;
  // Clear visitor flag for new season
  room.lastVisitorSeason = null;
  // Broadcast with season summary
  const roomBase = roomPayload(room);
  const visitPending = Object.values(room.pendingVisits||{}).some(a=>Array.isArray(a)&&a.length>0);
  const chat = room.chat.slice(-6).reverse();
  for (const [sid,pid] of Object.entries(room.playersBySocket)){
    const players = summarize(room, pid);
    io.to(sid).emit("roomUpdate",{ room: roomBase, players, buildings:BUILDINGS, ages:AGES, prices:BASE.tradeUnitPrice, visitPending, chat, seasonSummary });
  }
}
function advanceMonth(room){
  const oldMonth = room.monthIndex || 0;
  const oldDay = room.startingDay || 1;
  room.monthIndex = Math.max(0, (room.monthIndex||0) + 1);
  // Pick a new random day for the new month (1-28, safe for all months)
  room.startingDay = 1 + Math.floor(Math.random() * 28);
  const cal = calendarInfo(room);
  writeSessionLog(room, `MONTH_ADVANCED: ${oldMonth} → ${room.monthIndex} | Day: ${oldDay} → ${room.startingDay} | Date: ${cal.dateString} | Season: ${seasonName(room)}`);
}
function startIfReady(room){
  if (room.active) return;
  if (room.order.length < 2) return; // need at least 2 players
  const allReady = room.order.every(pid => !!room.state[pid]?.ready);
  if (!allReady) return;
  room.active = true;
  room.turnOf = room.order[0];
  const p = room.state[room.turnOf]; p.ap = BASE.apPerTurn; p.bankedAp = 0;
  const cal = calendarInfo(room);
  writeSessionLog(room, `\n========== GAME STARTED ==========`);
  writeSessionLog(room, `Player Order: [${room.order.join(', ')}]`);
  writeSessionLog(room, `Starting Date: ${cal.dateString}`);
  writeSessionLog(room, `Starting Month Index: ${room.monthIndex}`);
  writeSessionLog(room, `Starting Season: ${seasonName(room)}`);
  writeSessionLog(room, `First Turn: ${room.turnOf}`);
  writeSessionLog(room, `==================================\n`);
  startOfTurn(room, room.turnOf);
}
function startOfTurn(room, playerId){
  const p = room.state[playerId];

  // Check for season change based on month
  const previousSeason = room.lastSeasonName || seasonName(room);
  const currentSeason = seasonName(room);

  if (previousSeason !== currentSeason) {
    // Season has changed!
    nextSeason(room);
    for (const [sid] of Object.entries(room.playersBySocket)) {
      io.to(sid).emit("toast", { text:`Season changed to ${currentSeason}.` });
    }
  }

  // Track current season for next comparison
  room.lastSeasonName = currentSeason;

  // coin income (skip on very first turn of the game)
if (!room.firstTurnEver) {
    const inc = coinIncome(p);
    p.resources.coins += inc;
  } else {
    room.firstTurnEver = false;
  }
  try{ trackWealth(room, p, playerId); }catch(e){}

  // soldier upkeep: consume food and a small amount of coins (scaled by army size)
  const soldiers = Math.max(0, p.soldiers|0);
  const foodNeed = Math.max(0, Math.floor(soldiers/2)); // doubled: 1 food per 2 soldiers
  if (foodNeed>0){
    const have = Math.max(0, p.resources.food|0);
    const eat = Math.min(have, foodNeed);
    p.resources.food = have - eat;
    if (eat<foodNeed){
      // not enough food to feed all; notify the active player
      for (const [sid,pid] of Object.entries(room.playersBySocket)) if (pid===playerId) io.to(sid).emit("toast", { text: "Not enough food to sustain your army." });
    }
  }
  // coin upkeep: 1 coin per 10 soldiers
  const coinNeed = Math.max(0, Math.floor(soldiers/10));
  if (coinNeed>0){
    const haveC = Math.max(0, p.resources.coins|0);
    const pay = Math.min(haveC, coinNeed);
    p.resources.coins = haveC - pay;
    if (pay<coinNeed){
      for (const [sid,pid] of Object.entries(room.playersBySocket)) if (pid===playerId) io.to(sid).emit("toast", { text: "Your army demands pay, but you lack enough coins." });
    }
  }

  // seasonal event (once per season max)
  if (!room.seasonEventTriggered && Math.random() < room.seasonEventChance){
    const s = SEASONS[seasonName(room)];
    try{ s?.event?.apply && s.event.apply(p); }catch(e){}
    room.seasonEventTriggered = true;
    const msg = `${s?.event?.text||'Seasonal event.'}`;
    for (const [sid,pid] of Object.entries(room.playersBySocket)) if (pid===playerId) io.to(sid).emit("toast", { text: msg });
  }

  // Broadcast updated room state to all players (calendar, season, etc.)
  broadcastRoomUpdate(room);
  for (const [sid,pid] of Object.entries(room.playersBySocket)) {
    io.to(sid).emit("turnFlag",{ yourTurn: room.active && room.turnOf===pid });
  }

<<<<<<< HEAD
  if (p.isAi) {
    room.aiManager.playTurn(room, playerId);
=======
if (p.isAi) {
    const delay = 1000 + Math.floor(Math.random()*1000); // 1-2 seconds
    setTimeout(() => {
      // Ensure it's still this AI's turn and game is active
      if (room.active && room.turnOf === playerId) {
        room.aiManager.playTurn(room, playerId);
      }
    }, delay);
>>>>>>> 0080bf9 (Initial commit)
  }
}
function nextTurn(room){
  const idx=room.order.indexOf(room.turnOf);
  const next=room.order[(idx+1)%room.order.length];
  const isFirstPlayer = (next === room.order[0]);

  writeSessionLog(room, `NEXT_TURN: ${room.turnOf}(idx:${idx}) → ${next} | Order: [${room.order.join(', ')}] | First player: ${room.order[0]} | Cycling: ${isFirstPlayer}`);

  // Only advance month when the last player finishes their turn (cycling back to first player)
  if (isFirstPlayer) {
    writeSessionLog(room, `TRIGGERING MONTH ADVANCE (cycling back to first player)`);
    advanceMonth(room);
  }

  room.turnOf=next;
  const p=room.state[next];
  const carried = Math.max(0, p.bankedAp|0);
  p.ap = BASE.apPerTurn + carried;
  p.bankedAp = 0;
  startOfTurn(room, next);
}
<<<<<<< HEAD
=======
// =================== Starving Army Mechanic ===================

function applyStarvingMechanic(room, playerId) {
  const p = room.state[playerId];
  if (!p) return;

  // Only apply if player has 0 food
  if ((p.resources.food || 0) > 0) return;

  // 50% chance
  if (Math.random() > 0.5) return;

  const currentSoldiers = Math.max(0, p.soldiers || 0);
  if (currentSoldiers === 0) return; // No soldiers to lose

  // Calculate casualty range based on age
  let minCasualties, maxCasualties;
  switch(p.age) {
    case 'Wood': minCasualties = 1; maxCasualties = 3; break;
    case 'Stone': minCasualties = 3; maxCasualties = 9; break;
    case 'Modern': minCasualties = 9; maxCasualties = 18; break;
    default: minCasualties = 1; maxCasualties = 3;
  }

  const casualtyRange = maxCasualties - minCasualties + 1;
  const casualties = minCasualties + Math.floor(Math.random() * casualtyRange);
  const actualCasualties = Math.min(casualties, currentSoldiers); // Don't lose more than available

  p.soldiers = currentSoldiers - actualCasualties;

  // Notify the player
  for (const [sid, pid] of Object.entries(room.playersBySocket)) {
    if (pid === playerId) {
      io.to(sid).emit("visitorOutcome", {
        message: `Your army is starving! Feed them or lose them. You lost ${actualCasualties} soldiers due to starvation.`,
        type: 'starving',
        image: '/media/starving.png'
      });
    }
  }

  // Log the event
  addGameLog(room, `${playerId}'s army lost ${actualCasualties} soldiers due to starvation!`, "military");
  writeSessionLog(room, `STARVATION: ${playerId} lost ${actualCasualties} soldiers (had ${currentSoldiers}, now ${p.soldiers})`);
}

>>>>>>> 0080bf9 (Initial commit)
function endTurn(room, playerId, reasonToast){
  // Guard against double-ending the same turn
  if (room.turnOf !== playerId) {
    writeSessionLog(room, `END_TURN_REJECTED: ${playerId} tried to end turn, but it's ${room.turnOf}'s turn`);
    return;
  }

  const p=room.state[playerId];
  const saved = Math.max(0, p.ap|0);
  writeSessionLog(room, `END_TURN: ${playerId} | AP remaining: ${saved} | Banked AP before: ${p.bankedAp|0}`);

if (saved>0){
    const newBanked = Math.min(BASE.apBankLimit, p.bankedAp + saved);
    const actualSaved = newBanked - p.bankedAp;
    p.bankedAp = newBanked;
    p.ap = 0;
    const msg = actualSaved < saved
      ? `Your turn ended. Saved ${actualSaved} Moves (${saved - actualSaved} lost, max ${BASE.apBankLimit}).`
      : `Your turn ended. Saved ${actualSaved} Moves for next turn.`;
    for (const [sid,pid] of Object.entries(room.playersBySocket)) if (pid===playerId) io.to(sid).emit("toast",{ text: msg });
    writeSessionLog(room, `  → Banked ${actualSaved} AP (total banked: ${p.bankedAp})`);
  } else {
    p.ap = 0;
    const msg = `Your turn ended. No Moves saved for next turn.`;
    for (const [sid,pid] of Object.entries(room.playersBySocket)) if (pid===playerId) io.to(sid).emit("toast",{ text: msg });
    writeSessionLog(room, `  → No AP to bank`);
  }
  // Persist AI turn summary to per-game log
  try{
    const isAi = !!p.isAi;
    if (isAi){
      const res = p.resources||{};
      const info = `END_TURN ${playerId} | age:${p.age} | ap:0 banked:${p.bankedAp|0} | soldiers:${p.soldiers|0} | res: wood:${res.wood|0}, rock:${res.rock|0}, metal:${res.metal|0}, food:${res.food|0}, coins:${res.coins|0} | progress:${p.progress|0}`;
      writeAiLogLine(room, info);
    }
  }catch(e){}
  try{ trackWealth(room, p, playerId); }catch(e){}
<<<<<<< HEAD
=======
  // Apply starving mechanic BEFORE advancing turn
  applyStarvingMechanic(room, playerId);
>>>>>>> 0080bf9 (Initial commit)
  room.statistics.totalTurns = (room.statistics.totalTurns||0) + 1;
  nextTurn(room);
}

// Bank ALL remaining moves (no cap here) and end the turn in one press.
function bankAllAndEnd(room, playerId){
  // Guard against double-ending the same turn
  if (room.turnOf !== playerId) {
    writeSessionLog(room, `BANK_ALL_REJECTED: ${playerId} tried to bank & end, but it's ${room.turnOf}'s turn`);
    return;
  }

  const p=room.state[playerId];
  const saved = Math.max(0, p.ap|0);
  writeSessionLog(room, `BANK_ALL_AND_END: ${playerId} | AP to save: ${saved} | Banked AP before: ${p.bankedAp|0}`);

if (saved>0){
    const newBanked = Math.min(BASE.apBankLimit, p.bankedAp + saved);
    const actualSaved = newBanked - p.bankedAp;
    p.bankedAp = newBanked;
    p.ap = 0;
    const msg = actualSaved < saved
      ? `Saved ${actualSaved} Moves (${saved - actualSaved} lost, max ${BASE.apBankLimit}) and ended your turn.`
      : `Saved ${saved} Moves and ended your turn.`;
    for (const [sid,pid] of Object.entries(room.playersBySocket)) if (pid===playerId)
      io.to(sid).emit("toast",{ text: msg });
    writeSessionLog(room, `  → Banked ${actualSaved} AP (total banked: ${p.bankedAp})`);
  }
  try{ trackWealth(room, p, playerId); }catch(e){}
<<<<<<< HEAD
=======
  // Apply starving mechanic BEFORE advancing turn
  applyStarvingMechanic(room, playerId);
>>>>>>> 0080bf9 (Initial commit)
  room.statistics.totalTurns = (room.statistics.totalTurns||0) + 1;
  nextTurn(room);
}
function summarize(room, viewingPlayerId){
  const out={};
  for (const [pid,p] of Object.entries(room.state)){
    const isOwnPlayer = (pid === viewingPlayerId);
    out[pid]={
      color:p.color,
      civ:p.civ,
      ready: !!p.ready,
      age:p.age,
      // Hide private military info from other players
      soldiers: isOwnPlayer ? p.soldiers : undefined,
      soldierCap: isOwnPlayer ? soldierCap(p) : undefined,
      defense: isOwnPlayer ? Math.round(computeDefense(p)*100) : undefined,
      raid: isOwnPlayer ? sanitizeRaidState(p.raid) : undefined,
      // Public info visible to all
      resources:p.resources, ap:p.ap, bankedAp:p.bankedAp,
      structures:p.structures, coinIncome:coinIncome(p),
      progress:p.progress, stats:{
        woodYield:Math.max(0, Math.floor(computeYield(p,"wood")*seasonMultiplier(room,"wood"))),
        rockYield:Math.max(0, Math.floor(computeYield(p,"rock")*seasonMultiplier(room,"rock"))),
        metalYield:Math.max(0, Math.floor(computeYield(p,"metal")*seasonMultiplier(room,"metal"))),
        foodYield:Math.max(0, Math.floor(computeYield(p,"food")*seasonMultiplier(room,"food")))
      },
      // Include visible buildings only for own player
      visibleBuildings: isOwnPlayer ? (p.visibleBuildings || { Wood: [], Stone: [], Modern: [] }) : undefined,
      // Include personal log only for own player
      personalLog: isOwnPlayer ? (p.personalLog||[]).slice(-20) : undefined
    };
  }
  return out;
}

// =================== Sockets ===================
const performAction = (code, room, playerId, action, payload) => {
    if(!room) return;
    if(!room.active) return;
    if(room.turnOf!==playerId) return;
    const p=room.state[playerId];
    let turnChanged = false; // guard to avoid double end-turns within one action

<<<<<<< HEAD
=======
    // Block acting if there is a pending visitor for this player (cannot ignore visitor)
    try{
      const pending = room.pendingVisits || {};
      const hasBlockingVisit = Object.values(pending).some(v => v && v.to === playerId);
      if (hasBlockingVisit && action !== 'resolveVisit'){
        for (const [sid,pid] of Object.entries(room.playersBySocket)) if (pid===playerId) io.to(sid).emit("toast",{ text:"Decide the visitor at your gate first." });
        return;
      }
    }catch(e){}

>>>>>>> 0080bf9 (Initial commit)
    const spendAp = (n) => { if(p.ap<n) { return false; } p.ap-=n; return true; };

    switch(action){
      case "gather": {
        const { type } = payload||{}; if(!["wood","rock","metal","food"].includes(type)) return;
        if(!spendAp(1)) return;
        let amt=computeYield(p,type);
        // Apply season multiplier (range: 0.5x to 1.5x, or -50% to +50%)
        try{ const mult = seasonMultiplier(room, type); amt = Math.max(0, Math.floor(amt * mult)); }catch(e){}
        addResources(p.resources,{ [type]:amt });
        addPersonalLog(room, playerId, `Gathered ${amt} ${type}`, "resource");
        break;
      }
case "train": {
        const cap = soldierCap(p);
        const current = Math.max(0, p.soldiers||0);
        if (current >= cap){
          break;
        }
        // Get age-based training config
        const playerAge = p.age || 'Wood';
        const trainingConfig = BASE.soldierTraining[playerAge] || BASE.soldierTraining.Wood;
        const batchSize = trainingConfig.batchSize;
        const cost = trainingConfig.cost;

        // Check if we can afford and have room for at least one batch
        if (!canAfford(p.resources, cost)){
          break;
        }
        const missing = Math.max(0, cap - current);
        if (missing < batchSize){
          break; // Not enough room for a full batch
        }
        if(!spendAp(1)) return;
        payCost(p.resources, cost);
        const gained = batchSize;
        p.soldiers = Math.min(cap, current + gained);
        if (p.stats) p.stats.soldiersRecruited = (p.stats.soldiersRecruited||0) + gained;
        addPersonalLog(room, playerId, `Trained ${gained} soldiers`, "military");
        break;
      }
      case "build": {
        const { name } = payload||{}; let def=null;
        if (p.structures[name]) { break; }
        // Only allow building from current age (except Monument rules handled below)
        const currentAge = p.age;
        if (name !== 'Monument'){
          if (!(BUILDINGS[currentAge] && BUILDINGS[currentAge][name])) return;
          def = BUILDINGS[currentAge][name];
        } else {
          def = (BUILDINGS['Modern']||{})['Monument'];
        }
        if(!def) return;
        // Monument prerequisites: Age >= Modern, at least 2 distinct buildings in each age
        if (name==="Monument"){
          const needAgeIdx = AGES.indexOf("Modern");
          const curIdx = AGES.indexOf(p.age);
          // count distinct buildings per age
          let okPerAge = true;
          for (const age of AGES){
            const names = Object.keys(BUILDINGS[age]||{});
            const have = names.filter(n=> !!p.structures[n]).length;
            if (have<2){ okPerAge=false; break; }
          }
          if (curIdx < needAgeIdx || !okPerAge){
            return;
          }
        }
    
        if(!canAfford(p.resources, def.cost)) return;
<<<<<<< HEAD
=======
        if(!spendAp(1)) return; // Building costs 1 Move
>>>>>>> 0080bf9 (Initial commit)
        payCost(p.resources, def.cost);
        p.structures[name]={ level:1 };
        if (def.effect?.soldiers) p.soldiers = Math.min(soldierCap(p), (p.soldiers||0) + def.effect.soldiers);
        addPersonalLog(room, playerId, `Built ${name}`, "building");
        if (def.effect?.win){
          p.progress=100;
          addGameLog(room, `${playerId} constructed the Monument and won the game!`, "victory");
          const gameStats = compileGameStatistics(room, playerId);
          io.to(room.code).emit("gameOver", gameStats);
        }
        p.progress = computeProgress(p);
        break;
      }
      case "raid": {
        if (p.raid?.active){
          break;
        }

        // Enforce 6-month cooldown between wars
        const nowMonth = Math.max(0, room.monthIndex|0);
        if (typeof p.lastWarMonth === 'number' && (nowMonth - p.lastWarMonth) < 6) {
          const wait = 6 - (nowMonth - p.lastWarMonth);
          socket.emit("toast", { text: `You can only go to war every 6 months. Wait ${wait} more month(s).` });
          break;
        }

        // Minimum 3 soldiers required to go to war
        const minRequired = 3;
        const commit = Math.max(minRequired, Math.floor(payload?.commit||payload?.amount||minRequired));
        if ((p.soldiers||0) < commit){
          socket.emit("toast", { text: `Need at least ${minRequired} soldiers to go to war` });
          break;
        }
        if(!spendAp(1)) return;
        p.soldiers -= commit;

        // War resolves next season
        const currentSeasonIdx = SEASON_ORDER.indexOf(seasonName(room));
        const nextSeasonIdx = (currentSeasonIdx + 1) % SEASON_ORDER.length;
        const nextSeason = SEASON_ORDER[nextSeasonIdx];
        p.raid = {
          active:true,
          committed:commit,
          startedSeason: seasonName(room),
          resolvesAfterSeason: nextSeason
        };
        p.lastWarMonth = nowMonth;
        addPersonalLog(room, playerId, `Went to war with ${commit} soldiers`, "military");
        if (p.stats) p.stats.raidsLaunched = (p.stats.raidsLaunched||0) + 1;

<<<<<<< HEAD
=======
        // Generate war outcome lore message for the initiating player
        const successChance = Math.min(0.90, Math.max(0.05, computeRaidPower(p, commit)));
        const warLore = getWarOutcomeLore(p.civ, successChance);
        if (warLore) {
          notifyPlayer(room, playerId, `⚔️ War Forecast:\n\n${warLore}`);
        }

>>>>>>> 0080bf9 (Initial commit)
        // Do NOT broadcast any dispatch/raid initiated messages anymore.
        break;
      }
      case "upgrade": {
        const { name } = payload||{};
        if (!p.structures[name]) return;
        const info = p.structures[name];
        // Only allow upgrading buildings from current age
        const currentAge = p.age;
        let inCurrent=false; for (const [age, defs] of Object.entries(BUILDINGS)) if (defs && defs[name] && age===currentAge) inCurrent=true;
        if (!inCurrent) return;
        if (info.level >= BASE.upgradeMax) return;
        if (!spendAp(1)) return;

<<<<<<< HEAD
        // Upgrade probability: Level 1->2 = 100%, Level 2->3 = 50%, Level 3 = 25%
        const level = info.level;
        const successChance = level === 1 ? 1.0 : (level === 2 ? 0.50 : 0.25);
        const upgraded = Math.random() < successChance;

if (upgraded){
          info.level = Math.min(BASE.upgradeMax, info.level + 1);
          socket.emit("toast", { text: `✅ ${name} upgraded to Level ${info.level}! (+1 yield)` });
          addPersonalLog(room, playerId, `Upgraded ${name} to level ${info.level}`, "building");
          if (p.stats) p.stats.buildingsUpgraded = (p.stats.buildingsUpgraded||0) + 1;
          p.progress = computeProgress(p);
        } else {
          const pct = Math.round(successChance*100);
          socket.emit("toast", { text: `❌ ${name} upgrade failed (${pct}% chance)` });
          addPersonalLog(room, playerId, `Upgrade failed for ${name} (${pct}% chance)`, "building");
        }
=======
        // Always succeed: upgrade to next level (same AP cost)
        info.level = Math.min(BASE.upgradeMax, info.level + 1);
        socket.emit("toast", { text: `✅ ${name} upgraded to Level ${info.level}! (+1 yield)` });
        addPersonalLog(room, playerId, `Upgraded ${name} to level ${info.level}`, "building");
        if (p.stats) p.stats.buildingsUpgraded = (p.stats.buildingsUpgraded||0) + 1;
        p.progress = computeProgress(p);
>>>>>>> 0080bf9 (Initial commit)
        break;
      }
      case "trade": {
        const { mode, type, amount } = payload||{}; if(!["wood","rock","metal","food"].includes(type)) return;
        const amt=Math.max(1,Math.floor(amount||0));
        if(mode==="sell"){
          if((p.resources[type]||0)<amt) return;
          // Sell ratio: 3 resources = 1 coin
          const coinsEarned = Math.floor(amt/3);
          if (coinsEarned<=0){ return; }
          if(!spendAp(1)) return;
          p.resources[type]-=amt;
          p.resources.coins=(p.resources.coins||0)+coinsEarned;
          addPersonalLog(room, playerId, `Sold ${amt} ${type} for ${coinsEarned} Golden Coins`, "trade");
        } else if (mode==="buy"){
          // Buy ratio: 2 coins = 1 resource
          const cost=amt*2; if((p.resources.coins||0)<cost) return;
          if(!spendAp(1)) return;
          p.resources.coins-=cost;
          p.resources[type]=(p.resources[type]||0)+amt;
          addPersonalLog(room, playerId, `Bought ${amt} ${type} for ${cost} Golden Coins`, "trade");
        } else {
          return;
        }
        break;
      }
      case "skip": {
        bankAllAndEnd(room, playerId);
        turnChanged = true;
        break;
      }
      case "endTurn": {
        endTurn(room, playerId);
        turnChanged = true;
        break;
      }
case "advance": {
        if (maybeAdvanceAge(p, room)) {
            addGameLog(room, `${playerId} advanced to ${p.age} Age`, "advance");
        }
        break;
      }
      default:;
    }

    // Update progress for the acting player regardless, but only auto-end the turn
    // if we did not already change turns inside the action handler above.
    p.progress = computeProgress(p);
    if (!turnChanged && p.ap===0){
        endTurn(room, playerId);
        turnChanged = true;
    }

    broadcastRoomUpdate(room);
    for (const [sid,pid] of Object.entries(room.playersBySocket)) io.to(sid).emit("turnFlag",{ yourTurn: room.active && room.turnOf===pid });
  };

// =================== Command System ===================
function handleCommand(room, playerId, text, socket) {
  const args = text.trim().split(/\s+/);
  const command = args[0].toLowerCase();

  writeSessionLog(room, `COMMAND: ${playerId} executed: ${text}`);

  switch (command) {
    case '/help':
      const helpText = `
Available Commands:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
/help - Show this help message

/add <amount> <resource> <player>
  Add resources to a player's inventory
  Resources: wood, rock, metal, food, coins, all
  Player: player name or "me" for yourself
  Example: /add 55 wood Andriy
  Example: /add 100 coins me
  Example: /add 100 all me (gives 100 of each resource)

/remove <amount> <resource> <player>
  Remove resources from a player's inventory
  Example: /remove 10 rock me
  Example: /remove 25 food Player48
  Example: /remove 50 all me (removes 50 of each resource)

/raid <player>
  Trigger a raid attack on a player
  Example: /raid Phone
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      `.trim();
      socket.emit("toast", { text: helpText });
      break;

    case '/add':
      handleAddCommand(room, playerId, args, socket);
      break;

    case '/remove':
      handleRemoveCommand(room, playerId, args, socket);
      break;

    case '/raid':
      handleRaidCommand(room, playerId, args, socket);
      break;

    case '/kick': {
      // /kick <player>
<<<<<<< HEAD
      if (room.host !== playerId) { socket.emit('toast', { text: 'Only host can kick.' }); break; }
=======
>>>>>>> 0080bf9 (Initial commit)
      if (args.length < 2) { socket.emit('toast', { text: 'Usage: /kick <player>' }); break; }
      const targetName = args.slice(1).join(' ');
      const targetId = Object.keys(room.state).find(id => id.toLowerCase() === targetName.toLowerCase());
      if (!targetId) { socket.emit('toast', { text: `Player not found: ${targetName}` }); break; }
      for (const sid of socketsForPlayer(room, targetId)) io.to(sid).emit('kicked');
      removePlayerFromRoom(room, targetId);
      addGameLog(room, `${targetId} was removed by host via command.`, 'command');
      broadcastRoomUpdate(room);
      break;
    }

<<<<<<< HEAD
=======
    case '/close': {
      // Close the current room (anyone can invoke)
      const code = Array.from(ROOMS.entries()).find(([,r]) => r && r.playersBySocket && Object.values(r.playersBySocket).includes(playerId))?.[0];
      if (!code) { socket.emit('toast', { text: 'No active room found to close.' }); break; }
      const r = ROOMS.get(code);
      if (r){
        for (const [sid] of Object.entries(r.playersBySocket)) io.to(sid).emit('toast', { text: 'Room closed by command.' });
        for (const [sid] of Object.entries(r.playersBySocket)) io.to(sid).emit('kicked');
        ROOMS.delete(code);
      }
      break;
    }

>>>>>>> 0080bf9 (Initial commit)
    case '/restart': {
      if (room.host !== playerId) { socket.emit('toast', { text: 'Only host can restart.' }); break; }
      // Reuse restart logic
      const code = room.code;
      io.to(code).emit('toast', { text: '🔁 Game restarting…' });
      // Simulate restart via same handler
      try {
        const prevRoom = ROOMS.get(code);
        if (prevRoom) {
          const prev = { ...prevRoom.state };
          const order = [...prevRoom.order];
          prevRoom.state = {};
          order.forEach(pid => {
            const old = prev[pid] || {};
            const color = old.color || 'blue';
            const civ = old.civ || 'Romans';
            prevRoom.state[pid] = initialPlayer(color);
            if (civ && CIVS[civ]) prevRoom.state[pid].civ = civ;
            prevRoom.state[pid].ready = false;
          });
          prevRoom.active = false;
          prevRoom.turnOf = null;
          prevRoom.firstTurnEver = true;
          prevRoom.pendingTrades = {};
          prevRoom.pendingVisits = {};
          prevRoom.raidTracking = { lastRaidSeason: null, playerTriggeredRaidsUsed: {} };
          prevRoom.seasonalMultipliers = generateSeasonalVariations();
          prevRoom.seasonsElapsed = 0;
          prevRoom.attacksLog = [];
          prevRoom.monthIndex = Math.floor(Math.random()*12);
          prevRoom.startingDay = 1 + Math.floor(Math.random()*28);
          prevRoom.lastSeasonName = undefined;
          prevRoom.statistics = { startTime: Date.now(), endTime: null, totalTurns: 0, playerStats: {} };
          writeSessionLog(prevRoom, `\n===== SESSION RESTARTED by ${playerId} (command) =====\n`);
          broadcastRoomUpdate(prevRoom);
        }
      } catch(e) {}
      break;
    }

    case '/exit': {
      // Self-leave the session
      removePlayerFromRoom(room, playerId);
      socket.emit('toast', { text: 'You left the session.' });
      broadcastRoomUpdate(room);
      break;
    }

    default:
      socket.emit("toast", { text: `Unknown command: ${command}. Type /help for available commands.` });
  }
}

function handleAddCommand(room, playerId, args, socket) {
  // /add <amount> <resource> <player>
  if (args.length < 4) {
    socket.emit("toast", { text: "Usage: /add <amount> <resource> <player>\nExample: /add 55 wood Andriy\nExample: /add 100 all me" });
    return;
  }

  const amount = parseInt(args[1]);
  const resource = args[2].toLowerCase();
  const targetName = args.slice(3).join(' '); // Join remaining args as player name

  if (isNaN(amount) || amount <= 0) {
    socket.emit("toast", { text: "Invalid amount. Must be a positive number." });
    return;
  }

  const validResources = ['wood', 'rock', 'metal', 'food', 'coins', 'all'];
  if (!validResources.includes(resource)) {
    socket.emit("toast", { text: `Invalid resource. Valid: ${validResources.join(', ')}` });
    return;
  }

  // Find target player
  let targetId;
  if (targetName.toLowerCase() === 'me') {
    targetId = playerId;
  } else {
    targetId = Object.keys(room.state).find(id => id.toLowerCase() === targetName.toLowerCase());
  }

  if (!targetId || !room.state[targetId]) {
    socket.emit("toast", { text: `Player not found: ${targetName}` });
    return;
  }

  // Add resources
  const target = room.state[targetId];
  if (!target.resources) target.resources = {};

  if (resource === 'all') {
    // Add amount to all resources
    const allResources = ['wood', 'rock', 'metal', 'food', 'coins'];
    allResources.forEach(res => {
      target.resources[res] = (target.resources[res] || 0) + amount;
    });

    writeSessionLog(room, `COMMAND_ADD: ${playerId} added ${amount} of ALL resources to ${targetId}`);
    socket.emit("toast", { text: `✅ Added ${amount} of ALL resources to ${targetId}` });
    addGameLog(room, `${playerId} granted ${amount} of all resources to ${targetId}`, "command");
  } else {
    // Add single resource
    target.resources[resource] = (target.resources[resource] || 0) + amount;

    writeSessionLog(room, `COMMAND_ADD: ${playerId} added ${amount} ${resource} to ${targetId}`);
    socket.emit("toast", { text: `✅ Added ${amount} ${resource} to ${targetId}` });
    addGameLog(room, `${playerId} granted ${amount} ${resource} to ${targetId}`, "command");
  }

  broadcastRoomUpdate(room);
}

function handleRemoveCommand(room, playerId, args, socket) {
  // /remove <amount> <resource> <player>
  if (args.length < 4) {
    socket.emit("toast", { text: "Usage: /remove <amount> <resource> <player>\nExample: /remove 10 rock me\nExample: /remove 50 all me" });
    return;
  }

  const amount = parseInt(args[1]);
  const resource = args[2].toLowerCase();
  const targetName = args.slice(3).join(' ');

  if (isNaN(amount) || amount <= 0) {
    socket.emit("toast", { text: "Invalid amount. Must be a positive number." });
    return;
  }

  const validResources = ['wood', 'rock', 'metal', 'food', 'coins', 'all'];
  if (!validResources.includes(resource)) {
    socket.emit("toast", { text: `Invalid resource. Valid: ${validResources.join(', ')}` });
    return;
  }

  // Find target player
  let targetId;
  if (targetName.toLowerCase() === 'me') {
    targetId = playerId;
  } else {
    targetId = Object.keys(room.state).find(id => id.toLowerCase() === targetName.toLowerCase());
  }

  if (!targetId || !room.state[targetId]) {
    socket.emit("toast", { text: `Player not found: ${targetName}` });
    return;
  }

  // Remove resources
  const target = room.state[targetId];
  if (!target.resources) target.resources = {};

  if (resource === 'all') {
    // Remove amount from all resources
    const allResources = ['wood', 'rock', 'metal', 'food', 'coins'];
    let totalRemoved = 0;

    allResources.forEach(res => {
      const current = target.resources[res] || 0;
      target.resources[res] = Math.max(0, current - amount);
      totalRemoved += (current - target.resources[res]);
    });

    writeSessionLog(room, `COMMAND_REMOVE: ${playerId} removed ${amount} of ALL resources from ${targetId} (actual: ${totalRemoved})`);
    socket.emit("toast", { text: `✅ Removed ${amount} from ALL resources of ${targetId}` });
    addGameLog(room, `${playerId} removed ${amount} of all resources from ${targetId}`, "command");
  } else {
    // Remove single resource
    const current = target.resources[resource] || 0;
    target.resources[resource] = Math.max(0, current - amount);
    const actualRemoved = current - target.resources[resource];

    writeSessionLog(room, `COMMAND_REMOVE: ${playerId} removed ${actualRemoved} ${resource} from ${targetId}`);
    socket.emit("toast", { text: `✅ Removed ${actualRemoved} ${resource} from ${targetId}` });
    addGameLog(room, `${playerId} removed ${actualRemoved} ${resource} from ${targetId}`, "command");
  }

  broadcastRoomUpdate(room);
}

function handleRaidCommand(room, playerId, args, socket) {
  // /raid <player>
  if (args.length < 2) {
    socket.emit("toast", { text: "Usage: /raid <player>\nExample: /raid Phone" });
    return;
  }

  const targetName = args.slice(1).join(' ');

  // Find target player
  let targetId;
  if (targetName.toLowerCase() === 'me') {
    targetId = playerId;
  } else {
    targetId = Object.keys(room.state).find(id => id.toLowerCase() === targetName.toLowerCase());
  }

  if (!targetId || !room.state[targetId]) {
    socket.emit("toast", { text: `Player not found: ${targetName}` });
    return;
  }

  // Trigger a raid on the target player
  const target = room.state[targetId];
  const attackStrength = 20 + Math.floor(Math.random() * 30); // 20-50 strength
  const defence = Math.max(1, target.soldiers || 0);
  const defencePct = Math.min(0.95, defence / (defence + attackStrength));
  const roll = Math.random();

  let report;
  if (roll >= defencePct) {
    // Attack succeeds
    const stolen = {
      wood: Math.floor((target.resources.wood || 0) * 0.3),
      rock: Math.floor((target.resources.rock || 0) * 0.3),
      metal: Math.floor((target.resources.metal || 0) * 0.3),
      food: Math.floor((target.resources.food || 0) * 0.3),
      coins: Math.floor((target.resources.coins || 0) * 0.3)
    };

    // Remove stolen resources
    target.resources.wood = Math.max(0, (target.resources.wood || 0) - stolen.wood);
    target.resources.rock = Math.max(0, (target.resources.rock || 0) - stolen.rock);
    target.resources.metal = Math.max(0, (target.resources.metal || 0) - stolen.metal);
    target.resources.food = Math.max(0, (target.resources.food || 0) - stolen.food);
    target.resources.coins = Math.max(0, (target.resources.coins || 0) - stolen.coins);

    // Lose some soldiers (20-40%)
    const casualties = Math.floor(defence * (0.2 + Math.random() * 0.2));
    target.soldiers = Math.max(0, defence - casualties);

    const stolenText = Object.entries(stolen)
      .filter(([k, v]) => v > 0)
      .map(([k, v]) => `${v} ${k}`)
      .join(', ');

    report = `⚔️ RAID! ${targetId} was attacked by raiders! Lost ${casualties} soldiers and ${stolenText || 'nothing'}.`;

    writeSessionLog(room, `COMMAND_RAID: ${playerId} triggered raid on ${targetId} - SUCCESS (stolen: ${stolenText}, casualties: ${casualties})`);
  } else {
    // Defence holds
    const casualties = Math.floor(defence * (0.05 + Math.random() * 0.1));
    target.soldiers = Math.max(0, defence - casualties);

    report = `🛡️ ${targetId} successfully defended against raiders! Lost ${casualties} soldiers.`;

    writeSessionLog(room, `COMMAND_RAID: ${playerId} triggered raid on ${targetId} - DEFENDED (casualties: ${casualties})`);
  }

  socket.emit("toast", { text: `✅ Raid triggered on ${targetId}` });
  addGameLog(room, report, "raid");
  notifyPlayer(room, targetId, report);
  broadcastRoomUpdate(room);
}

io.on("connection",(socket)=>{
  const hasPendingVisit = (room, playerId) => {
    const list = room?.pendingVisits?.[playerId]||[];
    return Array.isArray(list) && list.length>0;
  };
<<<<<<< HEAD
  socket.on("createRoom", ({ code, playerId, color, civ, addAiPlayer }) => {
=======
  socket.on("createRoom", ({ code, playerId, color, civ, presetAIs }) => {
>>>>>>> 0080bf9 (Initial commit)
    code=(code||"").toUpperCase().slice(0,6)||Math.random().toString(36).slice(2,8).toUpperCase();
    const room=createRoom(code, performAction.bind(null, code));
    room.playersBySocket[socket.id]=playerId;
    ensurePlayer(room,playerId,color||"blue");
    // Mark host/creator
    room.host = playerId;
    if (civ && CIVS[civ]) room.state[playerId].civ = civ;
    socket.join(code);

<<<<<<< HEAD
    if (addAiPlayer) {
      const aiName = AI_NAMES.find((name) => !room.state[name]);
      if (aiName) {
        ensurePlayer(room, aiName, "gray", true);
        room.state[aiName].isAi = true;
        room.state[aiName].ready = true;
      }
    }
=======
    // If preset AIs are provided, add them now (civ/color from client)
    try{
      const normalizeCiv = (name) => {
        if (!name) return null;
        const keys = Object.keys(CIVS||{});
        const found = keys.find(k => k.toLowerCase() === String(name).trim().toLowerCase());
        return found || null;
      };
      const normalizeColor = (name) => {
        const allowed = ['blue','red','green','yellow','purple','orange','teal','pink','cyan','gray'];
        const n = String(name||'').trim().toLowerCase();
        return allowed.includes(n) ? n : 'gray';
      };
      if (Array.isArray(presetAIs)){
        presetAIs.forEach(ai => {
          const civPick = normalizeCiv(ai?.civ) || randomCiv();
          const colorPick = normalizeColor(ai?.color);
          const aiName = generateAiName(room, civPick);
          ensurePlayer(room, aiName, colorPick, true, civPick);
          room.state[aiName].color = colorPick;
          room.state[aiName].isAi = true;
          room.state[aiName].ready = true;
          room.state[aiName].civ = civPick;
          addGameLog(room, `AI added: ${aiName} — Civ: ${room.state[aiName].civ}, Color: ${room.state[aiName].color}`, 'command');
        });
      }
    }catch(e){}
>>>>>>> 0080bf9 (Initial commit)

    broadcastRoomUpdate(room);
  });

  socket.on("joinRoom", ({ code, playerId, color, civ }) => {
    code=(code||"").toUpperCase();
    const room=ROOMS.get(code); if(!room) return socket.emit("toast",{ text:"Room not found." });
    if (room.order.length>=8) return socket.emit("toast",{ text:"Room is full." });
    room.playersBySocket[socket.id]=playerId;
    ensurePlayer(room,playerId,color||"blue");
    if (civ && CIVS[civ]) room.state[playerId].civ = civ;
    socket.join(code);
    // do not auto-start; wait for everyone to be Ready
    startIfReady(room);
    broadcastRoomUpdate(room);
    for (const [sid,pid] of Object.entries(room.playersBySocket)) io.to(sid).emit("turnFlag",{ yourTurn: room.active && room.turnOf===pid });
  });

  // Players can toggle Ready while in lobby (before game is active)
  socket.on("setReady", ({ code, playerId, ready }) => {
    const room = ROOMS.get(code); if (!room) return;
    if (!room.state[playerId]) return;
    room.state[playerId].ready = !!ready;
    // Broadcast lobby update BEFORE starting game
    broadcastRoomUpdate(room);
    startIfReady(room);
    // Send another update AFTER starting game so clients get room.active=true
    broadcastRoomUpdate(room);
    // If game just started, also inform clients of turn flags
    if (room.active){ for (const [sid,pid] of Object.entries(room.playersBySocket)) io.to(sid).emit("turnFlag",{ yourTurn: room.turnOf===pid }); }
  });

  socket.on("performAction", ({ code, playerId, action, payload }) => {
    const room = ROOMS.get(code);
    performAction(code, room, playerId, action, payload);
  });

  const performAction = (code, room, playerId, action, payload) => {
    if(!room) return;
    if(!room.active) return;
    if(room.turnOf!==playerId) return;
    const p=room.state[playerId];
    let turnChanged = false; // guard to avoid double end-turns within one action

<<<<<<< HEAD
=======
    // Block acting if there is a pending visitor for this player (cannot ignore visitor)
    try{
      const pending = room.pendingVisits || {};
      const hasBlockingVisit = Object.values(pending).some(v => v && v.to === playerId);
      if (hasBlockingVisit && action !== 'resolveVisit'){
        for (const [sid,pid] of Object.entries(room.playersBySocket)) if (pid===playerId) io.to(sid).emit("toast",{ text:"Decide the visitor at your gate first." });
        return;
      }
    }catch(e){}

>>>>>>> 0080bf9 (Initial commit)
    const spendAp = (n) => { if(p.ap<n) { return false; } p.ap-=n; return true; };

    switch(action){
      case "gather": {
        const { type } = payload||{}; if(!["wood","rock","metal","food"].includes(type)) return;
        if(!spendAp(1)) return;
        let amt=computeYield(p,type);
        // Apply season multiplier (range: 0.5x to 1.5x, or -50% to +50%)
        try{ const mult = seasonMultiplier(room, type); amt = Math.max(0, Math.floor(amt * mult)); }catch(e){}
        addResources(p.resources,{ [type]:amt });
        addPersonalLog(room, playerId, `Gathered ${amt} ${type}`, "resource");
        break;
      }
      case "train": {
        // Require Barracks to unlock training
        if (!(p.structures && p.structures.Barracks)){
          break;
        }
        const cap = soldierCap(p);
        const current = Math.max(0, p.soldiers||0);
        if (current >= cap){
          break;
        }
        // Get age-based training config
        const playerAge = p.age || 'Wood';
        const trainingConfig = BASE.soldierTraining[playerAge] || BASE.soldierTraining.Wood;
        const batchSize = trainingConfig.batchSize;
        const cost = trainingConfig.cost;

        // Check if we can afford and have room for at least one batch
        if (!canAfford(p.resources, cost)){
          break;
        }
        const missing = Math.max(0, cap - current);
        if (missing < batchSize){
          break; // Not enough room for a full batch
        }
        if(!spendAp(1)) return;
        payCost(p.resources, cost);
        const gained = batchSize;
p.soldiers = Math.min(cap, current + gained);
        if (p.stats) p.stats.soldiersRecruited = (p.stats.soldiersRecruited||0) + gained;
        addPersonalLog(room, playerId, `Trained ${gained} soldiers`, "military");
        break;
      }
      case "build": {
        const { name } = payload||{}; let def=null;
        if (p.structures[name]) { break; }
        const currentAge = p.age;
        if (name !== 'Monument'){
          if (!(BUILDINGS[currentAge] && BUILDINGS[currentAge][name])) return;
          def = BUILDINGS[currentAge][name];
        } else {
          def = (BUILDINGS['Modern']||{})['Monument'];
        }
        if(!def) return;
        // Monument prerequisites: Age >= Modern, at least 2 distinct buildings in each age
        if (name==="Monument"){
          const needAgeIdx = AGES.indexOf("Modern");
          const curIdx = AGES.indexOf(p.age);
          // count distinct buildings per age
          let okPerAge = true;
          for (const age of AGES){
            const names = Object.keys(BUILDINGS[age]||{});
            const have = names.filter(n=> !!p.structures[n]).length;
            if (have<2){ okPerAge=false; break; }
          }
          if (curIdx < needAgeIdx || !okPerAge){
            return;
          }
        }

        if(!canAfford(p.resources, def.cost)) return;
<<<<<<< HEAD
=======
        if(!spendAp(1)) return; // Building costs 1 Move
>>>>>>> 0080bf9 (Initial commit)
        payCost(p.resources, def.cost);
        p.structures[name]={ level:1 };
        if (def.effect?.soldiers) p.soldiers = Math.min(soldierCap(p), (p.soldiers||0) + def.effect.soldiers);

        // Track statistics
        if (p.stats) {
          p.stats.buildingsBuilt = (p.stats.buildingsBuilt || 0) + 1;
        }

        // Count buildings in current age (excluding Monument)
        const buildingsInCurrentAge = countBuildingsInAge(p, currentAge);

        // After first building is built in an age, unlock all remaining buildings for that age
        if (name !== 'Monument' && buildingsInCurrentAge === 1) {
          unlockAllBuildingsForAge(p, currentAge);
          writeSessionLog(room, `BUILDINGS_UNLOCKED: ${playerId} built first building (${name}) in ${currentAge} age, all ${currentAge} buildings now visible`);
        }

        // In Modern age, unlock Monument after 4 buildings (excluding Monument itself)
        if (currentAge === 'Modern' && name !== 'Monument') {
          const modernBuildingsCount = countBuildingsInAge(p, 'Modern');
          if (modernBuildingsCount >= 4 && !p.visibleBuildings.Modern.includes('Monument')) {
            p.visibleBuildings.Modern.push('Monument');
            writeSessionLog(room, `MONUMENT_UNLOCKED: ${playerId} built ${modernBuildingsCount} buildings in Modern age, Monument now visible`);
          }
        }

        addPersonalLog(room, playerId, `Built ${name}`, "building");
        if (def.effect?.win){
          p.progress=100;
          addGameLog(room, `${playerId} constructed the Monument and won the game!`, "victory");
          const gameStats = compileGameStatistics(room, playerId);
          io.to(room.code).emit("gameOver", gameStats);
        }
        p.progress = computeProgress(p);
        break;
      }
      case "raid": {
        if (p.raid?.active){
          break;
        }

        // Enforce 6-month cooldown between wars
        const nowMonth = Math.max(0, room.monthIndex|0);
        if (typeof p.lastWarMonth === 'number' && (nowMonth - p.lastWarMonth) < 6) {
          const wait = 6 - (nowMonth - p.lastWarMonth);
          socket.emit("toast", { text: `You can only go to war every 6 months. Wait ${wait} more month(s).` });
          break;
        }

        // Minimum 3 soldiers required to go to war
        const minRequired = 3;
        const commit = Math.max(minRequired, Math.floor(payload?.commit||payload?.amount||minRequired));
        if ((p.soldiers||0) < commit){
          socket.emit("toast", { text: `Need at least ${minRequired} soldiers to go to war` });
          break;
        }
        if(!spendAp(1)) return;
        p.soldiers -= commit;

        // War resolves next season
        const currentSeasonIdx = SEASON_ORDER.indexOf(seasonName(room));
        const nextSeasonIdx = (currentSeasonIdx + 1) % SEASON_ORDER.length;
        const nextSeason = SEASON_ORDER[nextSeasonIdx];
        p.raid = {
          active:true,
          committed:commit,
          startedSeason: seasonName(room),
          resolvesAfterSeason: nextSeason
        };
        p.lastWarMonth = nowMonth;
        addPersonalLog(room, playerId, `Went to war with ${commit} soldiers`, "military");
        if (p.stats) p.stats.raidsLaunched = (p.stats.raidsLaunched||0) + 1;
        // No dispatch event or chat entry
        break;
      }
      case "upgrade": {
        const { name } = payload||{};
        if (!p.structures[name]) return;
        const info = p.structures[name];
        const currentAge = p.age;
        let inCurrent=false; for (const [age, defs] of Object.entries(BUILDINGS)) if (defs && defs[name] && age===currentAge) inCurrent=true;
        if (!inCurrent) return;
        if (info.level >= BASE.upgradeMax) return;
        if (!spendAp(1)) return;

<<<<<<< HEAD
        // Upgrade probability: Level 1->2 = 100%, Level 2->3 = 50%, Level 3 = 25%
        const level = info.level;
        const successChance = level === 1 ? 1.0 : (level === 2 ? 0.50 : 0.25);
        const upgraded = Math.random() < successChance;

if (upgraded){
          info.level = Math.min(BASE.upgradeMax, info.level + 1);
          addPersonalLog(room, playerId, `Upgraded ${name} to level ${info.level}`, "building");
          if (p.stats) p.stats.buildingsUpgraded = (p.stats.buildingsUpgraded||0) + 1;
          p.progress = computeProgress(p);
        } else {
          const pct = Math.round(successChance*100);
          addPersonalLog(room, playerId, `Upgrade failed for ${name} (${pct}% chance)`, "building");
        }
=======
        // Always succeed upgrade to next level
        info.level = Math.min(BASE.upgradeMax, info.level + 1);
        addPersonalLog(room, playerId, `Upgraded ${name} to level ${info.level}`, "building");
        if (p.stats) p.stats.buildingsUpgraded = (p.stats.buildingsUpgraded||0) + 1;
        p.progress = computeProgress(p);
>>>>>>> 0080bf9 (Initial commit)
        break;
      }
      case "trade": {
        const { mode, type, amount } = payload||{}; if(!["wood","rock","metal","food"].includes(type)) return;
        const amt=Math.max(1,Math.floor(amount||0));
        if(mode==="sell"){
          if((p.resources[type]||0)<amt) return;
          // Sell ratio: 3 resources = 1 coin
          const coinsEarned = Math.floor(amt/3);
          if (coinsEarned<=0){ return; }
          if(!spendAp(1)) return;
          p.resources[type]-=amt;
          p.resources.coins=(p.resources.coins||0)+coinsEarned;
          addPersonalLog(room, playerId, `Sold ${amt} ${type} for ${coinsEarned} coins`, "trade");
        } else if (mode==="buy"){
          // Buy ratio: 2 coins = 1 resource
          const cost=amt*2; if((p.resources.coins||0)<cost) return;
          if(!spendAp(1)) return;
          p.resources.coins-=cost;
          p.resources[type]=(p.resources[type]||0)+amt;
          addPersonalLog(room, playerId, `Bought ${amt} ${type} for ${cost} coins`, "trade");
        } else {
          return;
        }
        break;
      }
      case "skip": {
        bankAllAndEnd(room, playerId);
        turnChanged = true;
        break;
      }
      case "endTurn": {
        endTurn(room, playerId);
        turnChanged = true;
        break;
      }
case "advance": {
        if (maybeAdvanceAge(p, room)) {
            addGameLog(room, `${playerId} advanced to ${p.age} Age`, "advance");
        }
        break;
      }
      default:;
    }

    // Update progress for the acting player regardless, but only auto-end the turn
    // if we did not already change turns inside the action handler above.
    p.progress = computeProgress(p);
    if (!turnChanged && p.ap===0){
        endTurn(room, playerId);
        turnChanged = true;
    }

    broadcastRoomUpdate(room);
    for (const [sid,pid] of Object.entries(room.playersBySocket)) io.to(sid).emit("turnFlag",{ yourTurn: room.active && room.turnOf===pid });
  };

  socket.on("chat", ({ code, playerId, message }) => {
    const room = ROOMS.get(code); if (!room) return;
    const text = String(message || "").slice(0, 200);

    // Check if message is a command (starts with /)
    if (text.startsWith('/')) {
      handleCommand(room, playerId, text, socket);
      return;
    }

    const msg = { player: playerId, text, ts: Date.now() };
    room.chat.push(msg);
    if (room.chat.length > 50) room.chat.shift(); // cap history
    const latest = room.chat.slice(-6).reverse();
    io.to(code).emit("chatUpdate", latest);
    // Send chat message modal to other players
    for (const [sid, pid] of Object.entries(room.playersBySocket)) {
      if (!pid || pid === playerId) continue;
      io.to(sid).emit("chatMessageReceived", msg);
    }
  });

  // ===== Special Action: Send Trader/Robber/Spy (cost 1 Move + 10 coins, once per season) =====
  socket.on("sendVisit", ({ code, from, to, kind }) => {
    const room=ROOMS.get(code); if(!room) return;
    if (!room.state[from] || !room.state[to]) return socket.emit("toast",{ text:"Invalid players." });
    if (room.turnOf !== from) return socket.emit("toast",{ text:"Only on your turn." });
    const sender = room.state[from];
    if ((sender.ap||0) < 1) return socket.emit("toast",{ text:"Need 1 Move to send a visitor." });
    if ((sender.resources.coins||0) < 10) return socket.emit("toast",{ text:"Need 10 coins to send a visitor." });

    // Check if a visitor has already been sent this season (globally for the room)
    const currentSeason = seasonName(room);
    if (room.lastVisitorSeason === currentSeason) {
      return socket.emit("toast", { text: "🐪 A visitor is already travelling this season. Wait for next season." });
    }

    // Mark that a visitor was sent this season (room-wide)
    room.lastVisitorSeason = currentSeason;

    // Spend 1 Move and 10 coins
    sender.ap -= 1;
    sender.resources.coins -= 10;

    // Generate unique ID and lore message
    const id = Math.random().toString(36).slice(2,10);
    const loreMessage = generateVisitorLore(from, sender.civ || 'Unknown');

    // Determine the actual kind and what the recipient sees
    const actualKind = (kind === 'robber' || kind === 'spy') ? kind : 'trader';
    const disguisedAs = (kind === 'spy') ? 'trader' : kind; // Spy appears as trader to recipient

    // Store the pending visitor (like pendingTrades)
    if (!room.pendingVisits) room.pendingVisits = {};
    room.pendingVisits[id] = {
      id,
      from,
      to,
      kind: actualKind,
      disguisedAs: disguisedAs,
      lore: loreMessage,
      ts: Date.now()
    };

    // Immediately notify recipient (like tradeOffer)
    for (const sid of socketsForPlayer(room, to)) {
      io.to(sid).emit("visitorOffer", room.pendingVisits[id]);
    }

    // If recipient is AI, let them decide immediately
    const recipient = room.state[to];
    if (recipient?.isAi && room.aiManager) {
      room.aiManager.considerVisitorOffer(to, room.pendingVisits[id]);
    }

    // Notify sender
    let senderMsg = '';
    if (kind === 'spy') {
      senderMsg = `Dispatched a spy disguised as a trader to ${to}.`;
    } else if (kind === 'robber') {
      senderMsg = `Dispatched a robber disguised as a trader to ${to}.`;
    } else {
      senderMsg = `Dispatched a trader to ${to}.`;
    }
    socket.emit("toast", { text: senderMsg });

    // Update state (coins changed)
    broadcastRoomUpdate(room);
  });

  socket.on("triggerRaid", ({ code, playerId, targetPlayerId }) => {
    const room = ROOMS.get(code);
    if (!room) return;

    const player = room.state[playerId];
    if (!player) return socket.emit("toast", { text: "Player not found." });

    // Must be player's turn
    if (room.turnOf !== playerId) {
      return socket.emit("toast", { text: "Only on your turn." });
    }

    // Validate target
    if (!targetPlayerId || !room.state[targetPlayerId]) {
      return socket.emit("toast", { text: "Invalid target player." });
    }

    // Check if player has enough coins
    if ((player.resources.coins || 0) < 20) {
      return socket.emit("toast", { text: "Not enough Golden Coins (need 20)." });
    }

    const currentSeason = seasonName(room);

    // Initialize raid tracking if needed
    if (!room.raidTracking) {
      room.raidTracking = {
        lastRaidSeason: null,
        playerTriggeredRaidsUsed: {}
      };
    }

    // Check if a raid already happened this season (natural or mercenary)
    if (room.raidTracking.lastRaidSeason === currentSeason) {
      return socket.emit("toast", { text: "A raid already occurred this season. Wait for next season." });
    }

    // Check if player already hired mercenaries this season
    if (room.raidTracking.playerTriggeredRaidsUsed[playerId] === currentSeason) {
      return socket.emit("toast", { text: "You already hired mercenaries this season. Wait for next season." });
    }

    // Check if there's already a pending mercenary raid this season
    if (room.pendingMercenaryRaids && room.pendingMercenaryRaids.length > 0) {
      return socket.emit("toast", { text: "Mercenaries are already hired for this season." });
    }

    // Deduct 20 coins
    player.resources.coins -= 20;

    // Mark that this player hired mercenaries this season
    room.raidTracking.playerTriggeredRaidsUsed[playerId] = currentSeason;

    // Store the pending mercenary raid to execute at season end
    if (!room.pendingMercenaryRaids) room.pendingMercenaryRaids = [];
    room.pendingMercenaryRaids.push({
      hirer: playerId,
      target: targetPlayerId,
      season: currentSeason
    });

    // Log to session
    writeSessionLog(room, `MERCENARY_RAID_HIRED: ${playerId} paid 20 coins to hire mercenaries targeting ${targetPlayerId}, will execute at season end`);

    // Update game state
    broadcastRoomUpdate(room);
  });

  socket.on("resolveVisit", ({ code, playerId, id, decision }) => {
    const room=ROOMS.get(code); if(!room) return;
    const visit = room.pendingVisits?.[id];
    if (!visit) return socket.emit("toast",{ text:"No such visitor." });
    if (visit.to !== playerId) return socket.emit("toast",{ text:"Not your visitor." });

    const receiver = room.state[playerId];
    const sender = room.state[visit.from];
    const actualKind = visit.kind; // trader, robber, or spy
    const disguisedAs = visit.disguisedAs || actualKind; // what receiver sees

    const notifyWithImage = (pid, msg, type = 'trader') => {
<<<<<<< HEAD
      for (const [sid, pid2] of Object.entries(room.playersBySocket)) {
        if (pid2 === pid) {
          io.to(sid).emit("visitorOutcome", { message: msg, type, image: '/media/trader.png' });
=======
      let imagePath = '/media/trader.png';
      if (type === 'robber') imagePath = '/media/robber.png';
      else if (type === 'spy') imagePath = '/media/spy.png';
      for (const [sid, pid2] of Object.entries(room.playersBySocket)) {
        if (pid2 === pid) {
          io.to(sid).emit("visitorOutcome", { message: msg, type, image: imagePath });
>>>>>>> 0080bf9 (Initial commit)
        }
      }
    };

    if (decision === 'accept') {
      // Receiver always gets 20 coins (appears as trader benefit)
      receiver.resources.coins = (receiver.resources.coins || 0) + 20;

      if (actualKind === 'trader') {
        // Real trader: both gain
        sender.resources.coins = (sender.resources.coins || 0) + 20; // Net +10 (spent 10, gained 20)
        notifyWithImage(playerId, `Good trade practices! You welcomed ${visit.from}'s trader and gained 20 Golden Coins.`, 'trader');
        notifyWithImage(visit.from, `${playerId} welcomed your trader! You both prosper. You gained 20 Golden Coins.`, 'trader');
        addGameLog(room, `${playerId} accepted trader from ${visit.from}. Both gained 20 coins.`, "trade");
      } else if (actualKind === 'spy') {
        // Spy: receiver gets 20 coins (thinks it's trader), sender gets intel
        const defense = Math.round(Math.max(0, Math.min(1, computeDefense(receiver))) * 100);
        const resourceKeys = ['wood', 'rock', 'metal', 'food'];
        const shuffled = resourceKeys.sort(() => Math.random() - 0.5);
        const res1 = shuffled[0];
        const res2 = shuffled[1];
        const res1Amt = receiver.resources[res1] || 0;
        const res2Amt = receiver.resources[res2] || 0;

        notifyWithImage(playerId, `Good trade practices! You welcomed ${visit.from}'s trader and gained 20 Golden Coins.`, 'trader');
        notifyWithImage(visit.from, `🕵️ Your spy successfully gathered intelligence on ${playerId}:\n\nDefense: ${defense}%\nResources: ${res1Amt} ${res1}, ${res2Amt} ${res2}`, 'spy');
        addGameLog(room, `${playerId} accepted trader from ${visit.from}.`, "trade");
      } else if (actualKind === 'robber') {
        // Robber: receiver gets 20 coins (thinks it's trader), sender steals 10 coins
        receiver.resources.coins -= 10; // Net +10 (got 20, lost 10)
<<<<<<< HEAD
        sender.resources.coins = (sender.resources.coins || 0) + 30; // Net +20 (spent 10, gained 30)

        const lore = `${visit.from}'s envoy seemed trustworthy at first, sharing tales of distant markets and promising mutual prosperity. You welcomed them with open arms, only to discover too late that their honeyed words masked treacherous intent. While you were distracted by their charm, they made off with 10 Golden Coins from your coffers!`;

        notifyWithImage(playerId, `You were deceived! What appeared to be a trader was actually a robber in disguise!\n\n${lore}\n\nNet result: +10 coins (gained 20, lost 10)`, 'robber');
        notifyWithImage(visit.from, `Your robber successfully deceived ${playerId}! They welcomed your disguised robber as a trader, and you stole 10 coins. You gained 30 coins total (20 trade bonus + 10 stolen).`, 'robber');
=======
        sender.resources.coins = (sender.resources.coins || 0) + 20;  // Get back 10 coins spent + 10 stolen = 20 total

        const robberStory = ROBBER_LORE[Math.floor(Math.random() * ROBBER_LORE.length)];

        notifyWithImage(playerId, `You were deceived! What appeared to be a trader was actually a robber in disguise!\n\n${robberStory}`, 'robber');
        notifyWithImage(visit.from, `Your robber successfully deceived ${playerId}! ${robberStory}\n\nYou gained 10 Golden Coins from the theft.`, 'robber');
>>>>>>> 0080bf9 (Initial commit)
        addGameLog(room, `${playerId} was deceived by ${visit.from}'s robber disguised as trader.`, "military");
      }
    } else {
      // Reject
      if (disguisedAs === 'trader') {
        // Receiver thinks they rejected a trader
        notifyWithImage(playerId, `You lost good business, ${visit.from}! Your opponent will benefit. They will take 20 Golden Coins back to ${visit.from}.`, 'trader');

        if (actualKind === 'trader') {
          // Was actually a trader - sender gets refund
          sender.resources.coins = (sender.resources.coins || 0) + 20; // Net +10 (spent 10, gained 20)
          notifyWithImage(visit.from, `${playerId} rejected your trader. Your trader returns with 20 Golden Coins profit.`, 'trader');
        } else if (actualKind === 'spy') {
          // Was spy - no intel, but same message to receiver
          notifyWithImage(visit.from, `${playerId} rejected your spy. No intelligence gathered, but they think it was just a trader.`, 'spy');
        } else if (actualKind === 'robber') {
          // Was robber - no theft, but same message to receiver
          notifyWithImage(visit.from, `${playerId} rejected your robber. No coins stolen, but they think it was just a trader.`, 'robber');
        }
      }
    }

    // Remove visit from pendingVisits
    delete room.pendingVisits[id];

    // Update state
    broadcastRoomUpdate(room);
  });
  // ===== Player-to-player trading (costs 1 Move from the acting ruler) =====
  socket.on("proposeTrade", ({ code, from, to, offer }) => {
    const room=ROOMS.get(code); if(!room) return;
    if (!room.state[from] || !room.state[to]) return socket.emit("toast",{ text:"Invalid players for trade." });
    // Must be sender's turn and costs 1 AP
    if (room.turnOf !== from) return socket.emit("toast",{ text:"Offer only on your turn." });
    const p = room.state[from];
    if ((p.ap||0) < 1) return socket.emit("toast",{ text:"Not enough Moves." });
    // Basic validation
    const norm = (x)=>({ type:String(x?.type||""), amount:Math.max(1, Math.floor(x?.amount||0)) });
    const give = norm(offer?.give), want = norm(offer?.want);
    if (!["wood","rock","metal","food","coins"].includes(give.type)) return;
    if (!["wood","rock","metal","food","coins"].includes(want.type)) return;

    // Spend 1 Move for sending the offer
    p.ap -= 1;
    const id = Math.random().toString(36).slice(2,10);
    room.pendingTrades[id] = { id, from, to, give, want, ts:Date.now() };
    // notify recipient
    for (const sid of socketsForPlayer(room, to)) io.to(sid).emit("tradeOffer", room.pendingTrades[id]);
    // notify sender
    socket.emit("toast",{ text:`Offer sent to ${to}` });
    // Auto-end if out of moves
    if (p.ap===0){ endTurn(room, from, "Your turn ended because you ran out of Moves."); }
    // Push state update
    broadcastRoomUpdate(room);
    for (const [sid,pid] of Object.entries(room.playersBySocket)) io.to(sid).emit("turnFlag",{ yourTurn: room.active && room.turnOf===pid });
  });

  socket.on("respondTrade", ({ code, playerId, offerId, action, counter }) => {
    const room=ROOMS.get(code); if(!room) return;
    const offer = room.pendingTrades[offerId]; if (!offer) return socket.emit("toast",{ text:"Offer no longer available." });
    if (offer.to !== playerId && offer.from !== playerId) return; // not involved
    const fromP = room.state[offer.from]; const toP = room.state[offer.to];

    const notify = (pid, msg) => { for (const [sid,pid2] of Object.entries(room.playersBySocket)) if(pid2===pid) io.to(sid).emit("toast",{ text:msg }); };

    if (action === 'decline'){
      delete room.pendingTrades[offerId];
      notify(offer.from, `${offer.to} declined your offer.`);
      notify(offer.to, `You declined the offer from ${offer.from}.`);
      return;
    }
    if (action === 'counter'){
      // Create a new offer in reverse direction using provided counter terms
      const actor = room.state[playerId];
      if ((actor?.ap||0) < 1){
        notify(playerId, 'Not enough Moves to send a counter-offer.');
        return;
      }
      actor.ap -= 1;
      const norm = (x)=>({ type:String(x?.type||""), amount:Math.max(1, Math.floor(x?.amount||0)) });
      const give = norm(counter?.give), want = norm(counter?.want);
      const id = Math.random().toString(36).slice(2,10);
      room.pendingTrades[id] = { id, from:playerId, to:(playerId===offer.from?offer.to:offer.from), give, want, ts:Date.now() };
      for (const sid of socketsForPlayer(room, room.pendingTrades[id].to)) io.to(sid).emit("tradeOffer", room.pendingTrades[id]);
      notify(playerId, `Counter-offer sent to ${room.pendingTrades[id].to}.`);
      if (playerId===room.turnOf && actor.ap===0){ endTurn(room, playerId, 'Your turn ended because you ran out of Moves.'); }
      return;
    }
    if (action === 'accept'){
      // Validate resources at accept-time
      const has = (p,t,a)=> (p.resources[t]||0) >= a;
      if (!has(fromP, offer.give.type, offer.give.amount)) {
        notify(offer.to, `${offer.from} lacks ${offer.give.type}.`);
        // Inform the sender that the offer could not be fulfilled
        notify(offer.from, `${offer.to} declined your offer.`);
        delete room.pendingTrades[offerId];
        return;
      }
      if (!has(toP, offer.want.type, offer.want.amount)) {
        // Accepting player lacks resources: tell them and treat as a decline for the sender
        notify(offer.to, `You lack ${offer.want.type}.`);
        notify(offer.from, `${offer.to} declined your offer.`);
        delete room.pendingTrades[offerId];
        return;
      }
      // Move was already consumed when the offer was sent (in proposeTrade)
      // No need to check or consume moves here - just execute the trade

      // Transfer: from gives 'give' to toP; to gives 'want' to fromP
      fromP.resources[offer.give.type]-=offer.give.amount;
      toP.resources[offer.give.type]=(toP.resources[offer.give.type]||0)+offer.give.amount;
      toP.resources[offer.want.type]-=offer.want.amount;
fromP.resources[offer.want.type]=(fromP.resources[offer.want.type]||0)+offer.want.amount;
      delete room.pendingTrades[offerId];
      // Stats
      if (fromP.stats) fromP.stats.tradesCompleted = (fromP.stats.tradesCompleted||0) + 1;
      if (toP.stats) toP.stats.tradesCompleted = (toP.stats.tradesCompleted||0) + 1;
      // Log the trade
      const tradeDesc = `${offer.give.amount} ${offer.give.type} for ${offer.want.amount} ${offer.want.type}`;
      addGameLog(room, `${offer.from} and ${offer.to} traded: ${tradeDesc}`, "trade");
      // Update progress and notify
      fromP.progress = computeProgress(fromP);
      toP.progress = computeProgress(toP);
      broadcastRoomUpdate(room);
      notify(offer.from, `${offer.to} accepted your trade.`);
      notify(offer.to, `You accepted the trade with ${offer.from}.`);
      return;
    }
  });

<<<<<<< HEAD
  socket.on("addAiPlayer", ({ code }) => {
    const room = ROOMS.get(code);
    if (!room) return socket.emit("toast", { text: "Room not found." });
    if (room.order.length >= 8) return socket.emit("toast", { text: "Room is full." });

    const aiName = AI_NAMES.find((name) => !room.state[name]);
    if (!aiName) return socket.emit("toast", { text: "No more AI players available." });

    ensurePlayer(room, aiName, "gray", true);
    room.state[aiName].isAi = true;
    room.state[aiName].ready = true;
=======
socket.on("addAiPlayer", ({ code, color, civ }) => {
const room = ROOMS.get(code);
    if (!room) return socket.emit("toast", { text: "Room not found." });
    if (room.order.length >= 8) return socket.emit("toast", { text: "Room is full." });
    const normalizeCiv = (name) => {
      if (!name) return null;
      const keys = Object.keys(CIVS||{});
      const found = keys.find(k => k.toLowerCase() === String(name).trim().toLowerCase());
      return found || null;
    };
    const normalizeColor = (name) => {
      const allowed = ['blue','red','green','yellow','purple','orange','teal','pink','cyan','gray'];
      const n = String(name||'').trim().toLowerCase();
      return allowed.includes(n) ? n : 'gray';
    };
    const civPick = normalizeCiv(civ) || randomCiv();
    const colorPick = normalizeColor(color);

    const aiName = generateAiName(room, civPick);

    ensurePlayer(room, aiName, colorPick, true, civPick);
    // Explicitly set chosen attributes to avoid defaults sticking
    room.state[aiName].color = colorPick;
    room.state[aiName].isAi = true;
    room.state[aiName].ready = true;
    room.state[aiName].civ = civPick;
    // Announce
    addGameLog(room, `AI added: ${aiName} — Civ: ${room.state[aiName].civ}, Color: ${room.state[aiName].color}`, 'command');
    broadcastRoomUpdate(room);
>>>>>>> 0080bf9 (Initial commit)

    startIfReady(room);
    broadcastRoomUpdate(room);
    for (const [sid, pid] of Object.entries(room.playersBySocket))
      io.to(sid).emit("turnFlag", { yourTurn: room.active && room.turnOf === pid });
  });

  // Player voluntarily leaves the room
  socket.on("leaveRoom", ({ code, playerId }) => {
    const room = ROOMS.get(code); if (!room) return;
    // Capture sids before removal
    const sids = socketsForPlayer(room, playerId);
    // Remove player mapping and state
    removePlayerFromRoom(room, playerId);
    // Make their sockets leave the room so they stop receiving any events
    try{
      sids.forEach(sid => {
        const sock = io.sockets.sockets.get(sid);
        if (sock) sock.leave(code);
      });
    }catch(e){}

    // If host left, reassign host to next player if any
    if (room.host === playerId) {
      if (room.order.length > 0) {
        room.host = room.order[0];
        // Notify remaining players
        for (const [sid] of Object.entries(room.playersBySocket)) io.to(sid).emit('toast', { text: `Host left. ${room.host} is the new host.` });
      } else {
        // No players left — destroy room
        ROOMS.delete(code);
        return;
      }
    }

    broadcastRoomUpdate(room);
  });

  // Host kicks a player
  socket.on("kickPlayer", ({ code, by, target }) => {
    const room = ROOMS.get(code); if (!room) return;
<<<<<<< HEAD
    if (room.host !== by) return socket.emit("toast", { text: "Only host can kick." });
=======
>>>>>>> 0080bf9 (Initial commit)
    if (!room.state[target]) return socket.emit("toast", { text: "Player not found." });
    // Notify kicked player's sockets
    for (const sid of socketsForPlayer(room, target)) io.to(sid).emit('kicked');
    removePlayerFromRoom(room, target);
    addGameLog(room, `${target} was removed by host.`, 'command');
    broadcastRoomUpdate(room);
  });

  // Host restarts the game
  socket.on("restartGame", ({ code, by }) => {
    const room = ROOMS.get(code); if (!room) return;
    if (room.host !== by) return socket.emit("toast", { text: "Only host can restart." });
    // Preserve order/colors/civs; reset states
    const prev = { ...room.state };
    const order = [...room.order];
    room.state = {};
    order.forEach(pid => {
      const old = prev[pid] || {};
      const color = old.color || 'blue';
      const civ = old.civ || 'Romans';
<<<<<<< HEAD
      room.state[pid] = initialPlayer(color);
      if (civ && CIVS[civ]) room.state[pid].civ = civ;
      room.state[pid].ready = false;
=======
      room.state[pid] = initialPlayer(color, !!old.isAi, civ);
      // preserve AI and auto-ready them
      room.state[pid].isAi = !!old.isAi;
      room.state[pid].ready = !!old.isAi;
>>>>>>> 0080bf9 (Initial commit)
    });
    room.active = false;
    room.turnOf = null;
    room.firstTurnEver = true;
    room.pendingTrades = {};
    room.pendingVisits = {};
    room.raidTracking = { lastRaidSeason: null, playerTriggeredRaidsUsed: {} };
    room.seasonalMultipliers = generateSeasonalVariations();
    room.seasonsElapsed = 0;
    room.attacksLog = [];
    room.monthIndex = Math.floor(Math.random()*12);
    room.startingDay = 1 + Math.floor(Math.random()*28);
    room.lastSeasonName = undefined;
    // Reset statistics
    room.statistics = { startTime: Date.now(), endTime: null, totalTurns: 0, playerStats: {} };
    writeSessionLog(room, `\n===== SESSION RESTARTED by ${by} =====\n`);

    // Notify everyone
    for (const [sid] of Object.entries(room.playersBySocket)) io.to(sid).emit('toast', { text: '🔁 Game restarted. Back to lobby.' });
    broadcastRoomUpdate(room);
  });

  socket.on("disconnect", () => {});
});

function tryListen(p){
  PORT = p;
  const onError = (err)=>{
    if (err && err.code === 'EADDRINUSE'){
      const next = p + 1;
      console.log(`Port ${p} in use, trying ${next}...`);
      // detach and retry
      server.removeListener('error', onError);
      tryListen(next);
    } else {
      throw err;
    }
  };
  server.once('error', onError);
  server.listen(p, ()=>{
    server.removeListener('error', onError);
    console.log(`City Rebuilders v8 on http://localhost:${p}`);
  });
}

tryListen(PORT);










