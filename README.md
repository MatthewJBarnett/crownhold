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
- During a wave, a newly placed building is only a construction site. Engineers build it; anything still
  unfinished completes when the wave ends. During a wave only Engineers can repair (for free, over time); paid
  repairs and auto-repair happen between waves. Engineers run from enemies.
- Damaged buildings darken. Bars appear when a building drops below 60% or when you hover the Repair button.
  Repair everything with R (most important buildings first), or tick auto-repair to do it after every wave.
- Every unit is fully healed when a wave ends. The Healing Shrine only works during a wave.
- Farms and Gold Mines get pricier with every one you own (30% and 60% per building). Extra heroes start at
  1200 gold and each purchase raises the next price by 50%. Selling refunds 60% of what you actually paid.
- Enemies path to the King and break through the cheapest walls in their way. The Keep shelters units inside
  from ranged fire. If the King falls, the game is over.

## The world

The map is 220 m across and generated from a seed in one of six styles, chosen on the menu (or by the host):
River Valley (a river, a tributary, fords and marsh), Highlands (two rings of rock ridges with passes, and lakes),
Darkwood (a forest belt with lanes and clearings, a stream), Badlands (radial canyons, crags, ruins), Frozen Marsh
(snow, frozen lakes and slow bog) and Ashlands (a lava river and molten pools). Water, lava, rock and forest
cannot be built on or walked through; marsh is walkable but slow; dirt roads run from each spawn point to the
gate and speed everyone up. Hidden caches of gold reward a unit that roams out to them. Every spawn point is
guaranteed a route to the King. Selecting a tower, or placing one, shows its range draped over the ground.

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
- `js/models.js`: procedural low-poly meshes for units, buildings, projectiles and shader-drawn health bars
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
`index.html?autostart=1&hero=ranger&fps=1&presim=20&wave=1` starts a game immediately for screenshots.
