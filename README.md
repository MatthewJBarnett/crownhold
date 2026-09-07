# Crownhold

A 3D fantasy fortress-defense game that runs in the browser. Defend the King inside his Keep against
escalating waves of raiders, archers, catapults, spellcasters and bosses. Build walls and towers, recruit
soldiers, engineers and heroes, and take direct first-person control of any of your units, including the King.
Friends can join your fortress over the internet and defend it with you.

## Play

Play online at https://matthewjbarnett.github.io/crownhold/ (mouse capture, fullscreen and multiplayer all work there).

Or open `index.html` in a modern browser (Chrome, Edge, Firefox, Safari). No build step or server is required.
Three.js and the PeerJS networking library load from cdnjs, so an internet connection is needed on first load.

`crownhold.html` is a single-file bundle of the same game (run `python3 build_single.py` to regenerate it).

## How a round works

- Between waves you build and repair instantly, recruit and research upgrades. Press Next Wave (N) when ready.
  Shift-click a recruit to buy five. Recruits appear at the newest barracks unless you select a Barracks or Tavern and
  press "Muster recruits here" (each defender picks their own).
- During a wave, a newly placed building is only a construction site. Engineers build it; anything still
  unfinished completes when the wave ends. During a wave only Engineers can repair (for free, over time); paid
  repairs and auto-repair happen between waves. Engineers run from enemies.
- Damaged buildings darken. Bars appear when a building drops below 60% or when you hover the Repair button.
  Repair everything with R (most important buildings first), or tick auto-repair to do it after every wave.
- Every unit is fully healed when a wave ends. The Healing Shrine only works during a wave.
- Farms and Gold Mines get pricier with every one you own (30% and 60% per building). Extra heroes start at
  1450 gold and each purchase raises the next price by 50%. Selling refunds 60% of what you actually paid.
- Enemies land on the shore in groups, anywhere around the island (the next wave's landing points are red on the
  minimap), two groups per wave at first and up to six later. From the shore each group walks to the nearest of the
  eight corridor mouths (ringed on the minimap); neighbouring mouths share a corridor through the outer belt. The two belts around the
  castle are rings of mixed terrain, different on every map: moats you cross on a long bridge, forest, crag, chasms
  and lava. Through solid arcs the corridor switchbacks; over water it is a single bridge. Between the belts the path
  walks sideways to the inner gate past ponds, groves, boulders, cracks and marsh, so nothing runs straight. Enemies path to the King and walk a long way round walls before chewing
  through them, so walls steer them into tower fire. The Keep shelters units inside from ranged fire. If the King
  falls, the game is over.
- Beside every lane are two high-ground summits (cliff-ringed squares). Only a tower fits on one: it gets +30% range
  and +15% damage there, and melee enemies cannot reach it (archers, artillery and harpies can).
- Idle soldiers and heroes run to help a wall or tower that is being hit nearby, and give up on enemies they cannot
  path to. The King only fights what comes within a few metres of him.

## The world

The map is a circular island 280 m across, ringed by sea, generated from a seed in one of six styles, chosen on the menu (or by the host):
River Valley (a river, a tributary, fords and marsh), Highlands (two rings of rock ridges with passes, and lakes),
Darkwood (a forest belt with lanes and clearings, a stream), Badlands (radial canyons, crags, ruins), Frozen Marsh
(snow, frozen lakes and slow bog) and Ashlands (a lava river and molten pools). Water, lava, rock and forest
cannot be built on or walked through; marsh is walkable but slow; dirt roads run from each spawn point to the
gate and speed everyone up. Rivers are crossed on wooden bridges that stand on piers over the water. Hidden caches
of gold reward a unit that roams out to them. Every lane is guaranteed a route to the King. Selecting a tower, or
placing one, shows its range draped over the ground.

Wonders (one of each per defender, ever more expensive, ever stronger): Royal Treasury 2400 (interest, +50% bounties),
Sun Altar 2900 (a beam on the toughest enemy), Dragon Roost 3100 (a tame dragon), Arcane Spire 3600 (meteor storms),
Titan Forge 4100 (an iron titan), Crown of Storms 6000 (ten-target chain lightning), Phoenix Pyre 7800 (your fallen
rise again, once per wave), World Tree 9600 (2%/s regeneration and +25% tower damage within 32 m, 150 gold a wave),
Time Anchor 12000 (enemies within 34 m are 45% slower; a 4 s freeze every 30 s), Celestial Gate 17000 (six flying
warriors every 40 s), Doomsday Engine 24000 (450 damage to every enemy on the map every 60 s, a 20/s burn field) and
the Throne of Ages 36000 (+3000 King HP and 60/s regeneration, towers and soldiers +35%, farms and mines pay half again),
the Solar Forge 54000 (towers fire half again as fast and reach 25% further), the Comet Shrine 78000 (a 2400-damage
comet on the thickest crowd every 50 s, a meteor every 6 s), the Heart of Winter 108000 (enemies within 70 m 35% slower,
every enemy 15% more fragile, a 4 s freeze every 45 s) and The Apotheosis 300000 (enemies within 60 m burn 4% of
their life a second, your units and the Keep take 40% less damage, bounties pay threefold, towers fire two thirds
faster, and every 45 s the sky opens: everything hostile loses 40% of its remaining life and stands stunned).

Mechanics: from wave 4 most waves carry a modifier announced in the preview (Night Raid, Thick Fog, Frenzy, Iron Tide,
Swarm, Siege, Plague, Gold Rush) that changes ranges, speed, armour, numbers or bounties, and night and fog change the
light. From wave 3 most waves offer a contract (hold every wall, keep the King untouched, lose no soldiers, clear it in
75 s, eight hero kills, four casters) paid to every defender. From wave 5 some enemies are elites with an affix (Hasty,
Armoured, Vampiric, Explosive, Shielded, Giant), marked with a coloured ring and worth double. Heroes gain experience
from their kills and level up to 10 (+7% health, +6% damage a level). The King's own guard and the world tree's
regeneration reward keeping units alive rather than replacing them.

Graphics: rounded units with capes, helmets and shields; stone with relief; grass tufts, round and pine canopies;
a shader-drawn water surface with rolling waves, ripples, sun glitter, fresnel sky reflection and shore foam (lava
gets a crust instead); drifting snow, embers, pollen or dust depending on the map; sprite fire and torches; explosions that
sit on the ground instead of sinking into it; soft contact shadows; a sun disc; and a bloom/colour-grading pass
(Settings: Glow & colour; turn it off on slow machines; it renders through a 24-bit depth target so the water never
z-fights the terrain). Rock belts are crag blocks that fill their cells exactly and forest belts have undergrowth, so
nothing you can walk into is walkable: every rock and tree inside the map sits on an obstacle cell.

## The King's errands

From wave 2 most waves bring an errand: an objective far from the Keep, marked by a beam of light and on the
minimap, that only the King can resolve. Some he must reach, some he must carry home (heavy ones slow him), some
take his work for a while at the spot. They are optional and vanish when the wave ends; completing one pays off in
gold, free soldiers, engineers or a dragon, a free tower or shrine to place, free upgrade levels, permanent gains for
the King (health, regeneration, damage, a faster Royal Decree), a weaker next wave or horde, a cheaper wonder, a lost
champion, or every fallen hero back. Twenty errands cycle without repeating; the bigger ones come later.

## Enemies

Twenty-nine kinds. Besides raiders, archers, brutes, casters, artillery and beasts there are Warchiefs (an aura that
makes everything near them faster and harder-hitting), Goblin Bombers, Wraiths (fly, take 40% from arrows and blades,
full damage from magic), Stone Guards (arrows glance off), Battering Rams (five times the damage to walls, explode when
killed), Plague Rats, Raider Horsemen, and three tiers of siege: Catapults from wave 4, Trebuchets from wave 12 and the Siege
Colossus from wave 20 (out-ranges every tower, 520-damage shot splashing 5.5 m, explodes when destroyed). Bosses every five waves, in order: the Ogre Warlord, the Orc Warbringer (war
horn and charge), the Lich, the Hydra (sheds heads as it is hurt, regenerates), the Ancient Dragon, the Stormcaller
(lightning on your towers, blinks), the Spider Queen and the Iron Golem. Repeats come back stronger.

## Heroes

Eight heroes, each with two abilities (Q and E) and a passive, and only one of each can exist. A fallen hero
stays dead until you buy them back. Sir Aldric the Knight (tank), Lyra the Ranger (bow),
Magnus the Pyromancer (area fire), Seraphine the Battle Cleric (healing), Thorne the Berserker (cleaving axe, faster
when hurt), Nyx the Shadow (blinks, double damage from behind), Ivor the Frost Warden (slows, freezes, raises
temporary ice walls) and Wren the Beastmaster (summons a wolf pack, war horn). You start with one; more can be bought.

## Playing together

One player clicks Host a game and lands in a lobby with a six-letter room code (Copy code and Copy invite link
buttons are right there; the invite link opens the game with the code filled in). Friends enter the code and Join
with the hero they picked, appear in the lobby, and the host presses Start. Nobody can join once the siege has
begun. Every defender has their own gold, hero, garrison, buildings and upgrades (your Weapon Smithing or Tower
Engineering applies to your soldiers and towers; shared buildings take the best level anyone has), and only they can
order, control, sell or repair their own things. Each defender can build their own blacksmith, market and tavern.
In co-op every defender has a colour: their units wear a ring at the feet, their buildings fly a pennant, the minimap
uses the same colours, and the top bar shows each name with its swatch. Shared things (the King, the starting castle)
wear gold and a crown pennant. Hovering anything names its owner, the selection panel says who may command, repair or
upgrade it (buttons you cannot use are greyed), and Repair all only touches yours and the shared castle.
The King and the starting castle are shared, waves start when every defender presses Next Wave, and any free unit of yours (or the King) can be taken
over in first person. Waves scale with the number of defenders. The host runs the simulation, so the host should
have the steadiest connection. After a defeat the host's Rise again returns everyone to the lobby. Play from the game files on your computer (`index.html`), not from
a page that blocks direct connections. An embedded copy that blocks them says so on the menu and, where the host
allows it, offers to save `crownhold.html` for you. `peertest.html?role=host&code=ABC` / `?role=client&code=ABC` is a tiny
connectivity check if joining fails.

## Roster

Enemies: raiders, archers, brutes, wargs, shieldbearers, crossbowmen, sappers (blow up walls), pyromancers,
catapults and trebuchets, assassins, shamans, harpies (fly over walls), plaguebearers (poison cloud on death),
necromancers, trolls (regenerate), frost witches, warlocks (hex your damage), and bosses every five waves:
Ogre Warlord, Lich, Ancient Dragon, Spider Queen, Iron Golem.

Your units: swordsmen, archers, pikemen, crossbowmen, mounted knights, apprentices, priests (heal), engineers
(build and repair). Towers: arrow, ballista, mage, frost, cannon (splash, minimum range), lightning (chains,
ignores armour), poison, watchtower (36 m reach, picks off casters). Defences: walls, spiked barricades, gates,
spike traps. Buildings: barracks, farm, gold mine, blacksmith, healing shrine, market, tavern.

## Controls

Overview (commander mode)

- WASD / arrow keys pan, Q / E rotate, mouse wheel zooms, right-drag orbits, middle-drag pans
- Left click or drag-select your units, Shift adds to the selection
- Right click: move and attack there, attack an enemy, or follow a friendly unit
- C or Tab: take control of the selected unit
- H hold position, F follow the nearest hero (or the hovered unit)
- Ctrl+1..9 save a control group, 1..9 recall it. Ctrl+A all soldiers, K the King, J heroes
- B opens the build panel. R rotates the ghost, click places, drag lays wall lines, Esc or right click cancels
- Click a building to repair, upgrade (towers) or sell it. R repairs everything
- N or Space starts the next wave, P pauses, = toggles fast forward, M mutes, ? shows the help screen

Possessed unit (first person)

- Click the game once to capture the mouse. Mouse look, WASD move, arrow keys turn, Shift sprint, T toggles third person
- Left mouse attacks (hold to keep swinging or shooting). As an Engineer, hold it at a damaged building or construction site to work on it
- Q and E use the hero's abilities, aimed where you look
- Right mouse or G sends your soldiers to attack where you aim, F makes them follow you, H holds, V sends them to the King
- Tab or Esc returns to the overview
- Settings (gear button, Settings on the menu, or O in play): mouse sensitivity (10% to 400%), raw input, invert vertical look, sound volume, shadows, and an FPS counter. All are remembered. `[` / `]` adjust sensitivity in play. Raw input ignores system pointer speed and acceleration like Minecraft; turn it off if the view feels far faster or slower than your cursor
- If the browser refuses to capture the mouse (some embedded pages do), mouse look still works inside the game frame. Hold the right mouse button (or the left while attacking) to keep looking after the hidden cursor leaves the frame; a right-button tap still orders your soldiers. Fullscreen, where allowed, gives more room

## Layout

- `index.html`, `css/style.css`: page and HUD
- `js/data.js`: every unit, hero, enemy, building, upgrade and wave definition (tune balance here)
- `js/grid.js`: build grid, enemy flow field (walls are breakable at a cost), A* for friendly units, circle collision
- `js/models.js`: procedural meshes for units, buildings, projectiles, owner pennants and shader-drawn health bars
- `js/post.js`: bloom and colour grading (render target, bright pass, blur, composite) without EffectComposer
- `js/missions.js`: the King's errands (objective placement, fetch/work/touch logic, rewards, co-op replication)
- `js/entities.js`: units, buildings (construction, damage tint), projectiles, zones, particle effects
- `js/ai.js`, `js/abilities.js`: NPC behaviour (including engineers) and hero abilities
- `js/waves.js`: wave composition and spawning
- `js/controls.js`: overhead camera, selection, build placement, first-person control, pointer-lock fallbacks
- `js/net.js`: co-op networking (host-authoritative snapshots over WebRTC, PeerJS signalling)
- `js/ui.js`: menus, HUD, minimap, lobby
- `js/game.js`: game state, economy, main loop, headless self-tests

## Testing

`index.html?test=1&waves=5&bot=1` runs a headless simulation and prints a log (used for smoke testing in headless Chrome).
`index.html?test=1&waves=0&collide=1` drives the possessed hero into walls and reports the closest approach.
`index.html?test=1&waves=0&mptest=1` runs a host and a client replica in one page over a loopback transport.
`index.html?test=1&waves=0&missiontest=1` runs every King's errand end to end and reports the rewards.
`index.html?autostart=1&hero=ranger&fps=1&presim=20&wave=1` starts a game immediately for screenshots.
`&mapType=valley&seed=777` pins the world in test mode. `?test=1&probe5=1&waves=0` renders a set of views into the page.

Experiments: Settings has a "Spawn a test champion" button and an "Add gold" box (host only in co-op). The champion
is an immortal hero with absurd splash damage, speed and cooldowns; the gold goes straight into your pocket. Both exist
purely for reaching late waves quickly.
