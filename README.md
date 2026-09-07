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
- Farms and Gold Mines get pricier with every one you own (30% and 60% per building). Extra heroes start at
  1200 gold and each purchase raises the next price by 50%. Selling refunds 60% of what you actually paid.
- Enemies path to the King and break through the cheapest walls in their way. The Keep shelters units inside
  from ranged fire. Fallen heroes return after the wave. If the King falls, the game is over.

## Heroes

Eight heroes, each with two abilities (Q and E) and a passive: Sir Aldric the Knight (tank), Lyra the Ranger (bow),
Magnus the Pyromancer (area fire), Seraphine the Battle Cleric (healing), Thorne the Berserker (cleaving axe, faster
when hurt), Nyx the Shadow (blinks, double damage from behind), Ivor the Frost Warden (slows, freezes, raises
temporary ice walls) and Wren the Beastmaster (summons a wolf pack, war horn). You start with one; more can be bought.

## Playing together

One player clicks Host a game and shares the six-letter room code shown at the top of their screen, using the
Copy code or Copy invite link buttons next to it (the invite link opens the game with the code filled in). Others
enter the code and Join with the hero they picked. Everyone shares the same fortress, gold and King, and can
build, give orders, and take control of any unit nobody else is controlling. The host runs the simulation, so
the host should have the steadiest connection. Play from the game files on your computer (`index.html`), not from
a page that blocks direct connections. An embedded copy that blocks them says so on the menu and, where the host
allows it, offers to save `crownhold.html` for you. `peertest.html?role=host&code=ABC` / `?role=client&code=ABC` is a tiny
connectivity check if joining fails.

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
- Mouse sensitivity (10% to 400%) and a Raw input toggle live on the menu and the help screen (?), and `[` / `]` adjust sensitivity in play; both are remembered. Raw input ignores system pointer speed and acceleration like Minecraft; turn it off if the view feels far faster or slower than your cursor
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
