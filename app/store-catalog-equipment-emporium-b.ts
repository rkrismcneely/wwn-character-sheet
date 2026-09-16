import type { StoreCatalogSeed } from "./store-catalog-types.ts";

const categoryByCode = {
  A: "Adventuring Gear",
  T: "Tools & Kits",
  H: "Health & Personal Care",
  C: "Clothing & Personal",
  F: "Food & Drink",
  O: "Containers & Storage",
  N: "Animals & Tack",
  V: "Vehicles & Transport",
  S: "Services",
  P: "Equipment Packs",
  G: "Games & Entertainment",
  J: "Jewelry & Valuables",
  R: "Trade Goods & Valuables",
  E: "Siege Equipment",
} as const;

const raw = String.raw`F|Wine, common, gallon|1 sp 6 cp
F|Wine, common, glass|2 cp
F|Wine, exceptional, 250-gallon tun|2400 sp
F|Wine, exceptional, 30-gallon barrel|450 sp
F|Wine, exceptional, bottle|min 30 sp
F|Wine, exceptional, glass|min 6 sp
F|Wine, quality, 250-gallon tun|400 sp
F|Wine, quality, 30-gallon barrel|80 sp
F|Wine, quality, bottle|5 sp
F|Wine, quality, gallon|10 sp
F|Wine, quality, glass|1 sp
O|Backpack, Adventurer's|4 sp
O|Backpack, Halfling|4 sp
O|Backpack, Knapsack|3 sp
O|Backpack, Wicker|1 cp
O|Bag, Cloth|1 cp
O|Bag, Cloth, tiny|1 cp
O|Barrel|1 sp
O|Basket, large|3 cp
O|Basket, small|1 cp
O|Beltpouch|1 sp
O|Butt|3 sp
O|Chest, Large|10 sp
O|Chest, Medium|5 sp
O|Chest, Small|2 sp
O|Crate, Large|8 cp
O|Crate, Medium|5 cp
O|Crate, Small|2 cp
O|Extra Large|1 sp
O|Firkin / Quarterbarrel|4 cp
O|Hand Keg|2 cp
O|Hidden Compartment|+40 sp
O|Hogshead|2 sp
O|Kilder/ Cask|8 cp
O|Large (Human, Elf, Dwarf)|8 sp
O|Large Pouch or Purse|2 sp
O|Pack Vest|10 sp
O|Sack, Large|1 sp
O|Sack, Large Leather|2 sp
O|Sack, Small|5 cp
O|Sack, Small Leather|1 sp
O|Saddle Bags, Large|4 sp
O|Saddle Bags, Small|3 sp
O|Satchel / Haversack|1 sp 2 cp
O|Satchel, Oilskin (water resistant)|6 sp
O|Small (Child, Halfling)|4 sp
O|Small Strongbox|25 sp
O|Traveling Chest|+100 sp
O|Tun|5 sp
N|Ape (Guard)|3000 sp
N|Bear|1000 sp
N|Bees (100, w/ queen)|10 sp
N|Bit and bridle|1 sp 5 cp
N|Boar|10 sp
N|Bull|20 sp
N|Cage, Large animal|15 sp
N|Cage, Small animal|5 sp
N|Calf|5 sp
N|Camel|75 sp
N|Cart harness|2 sp
N|Cat, Domestic|1 cp
N|Cat, Great (Lion, Tiger)|3000 sp
N|Cat, Hunting (Cheetah, Jaguar, Mountain Lion)|1500 sp
N|Cat, Small wild|25 sp
N|Crocodilian|500 sp to 1000 sp
N|Deer, Doe|5 sp
N|Deer, Stag|9 sp
N|Dog, Guard|25 sp
N|Dog, Hunting|17 sp
N|Dog, Pet|5 sp to 20 sp
N|Dog, War|50 sp
N|Donkey, mule, or ass|40 sp
N|Eagle (trained)|1500 sp
N|Elephant, Labor|200 sp
N|Elephant, War|500 sp
N|Feed Bag|5 sp
N|Ferret|5 cp
N|Ferret, trained|5 sp
N|Fish (medium)|1 sp
N|Fish (small)|5 cp
N|Fowl, exotic (Peafowl, Emu, etc.)|500 sp
N|Game Fowl (pheasant, partridge, quail, etc.)|5 cp
N|Goat|1 sp
N|Goose|1 cp
N|Griffon|5000 sp
N|Halter|1 cp
N|Hawk/ Falcon (trained)|1000 sp
N|Hippogriff|2000 sp to 3000 sp
N|Hobbles, 1 set|2 sp
N|Horse Blanket / Hood|2 sp
N|Horseshoes & shoeing|1 sp
N|Howdah|85 sp
N|Large Animal Feed, 1 day|1 cp
N|Leash, Large animal|2 sp
N|Leash, Small-Medium animal|1 sp
N|Lizard / small reptile|1 sp to 5 sp
N|Medium Animal Feed, 1 day|1 cp
N|Monkey (Sentry)|1500 sp
N|Muzzle, Dog, leather|2 sp
N|Owl|3 sp
N|Ox|15 sp
N|Parrot / Cockatiel|100 sp
N|Pegasus|min 5000 sp
N|Pigeon, homing|100 sp
N|Pony|40 sp
N|Pony, War|80 sp
N|Rabbit|1 cp
N|Ram|4 sp
N|Riding Dog|80 sp
N|Roc, Large|min 10000 sp
N|Roc, Normal|min 5000 sp
N|Rodent (Common)|1 cp
N|Rodent (Giant)|1 sp
N|Saddle blanket|3 cp
N|Saddle, Aerial|50 sp
N|Saddle, Pack|5 sp
N|Saddle, Riding|10 sp
N|Saddle, War Horse|20 sp
N|Sheep|2 sp
N|Snake, Constrictor|50 sp
N|Snake, Pit Viper (poisonous)|5 cp
N|Snake, Small (nonpoisonous)|1 cp
N|Songbird|1 sp
N|Swan|5 cp
N|Team harness, per pair|5 sp
N|Trappings, Horse|10 sp
N|Turtle|1 sp
N|War Ram|200 sp
N|Wolf|2500 sp
N|Yoke, Horse|5 sp
N|Yoke, Ox|3 sp
V|Anchor, Iron, Boat|40 sp
V|Anchor, Iron, Ship|200 sp
V|Canoe|50 sp
V|Caravel|10000 sp
V|Carrack|20000 sp
V|Carriage, Common|150 sp
V|Cart|50 sp
V|Chariot, Common|400 sp
V|Chariot, Racing|500 sp
V|Chariot, War|600 sp
V|Coach|1500 sp
V|Coaster|5000 sp
V|Cog|20000 sp
V|Dog Cart / Sled|40 sp
V|Galleon|65000 sp
V|Galley, Large|30000 sp
V|Galley, Small|15000 sp
V|Knarr|3000 sp
V|Longship, Drakkar|25000 sp
V|Longship, Karfi/Skei|10000 sp
V|Oar, Common|2 sp
V|Oar, Galley|10 sp
V|Paddle|1 sp
V|Raft/Barge P|100 sp
V|Riverboat|3500 sp
V|Sail/100sq. ft|20 sp
V|Sailboat|2000 sp
V|Sedan chair / Rickshaw|100 sp
V|Sledge|400 sp
V|Sleigh|300 sp
V|Small keelboat|100 sp
V|Travois, Dog|10 sp
V|Travois, Horse|20 sp
V|Wagon|500 sp
V|Wagon or cart wheel|5 sp
S|Bath|1 cp
S|City rooms (per month), Common|20 sp
S|City rooms (per month), Poor|6 cp
S|Clerk (per letter)|2 cp
S|Coach cab (per mile)|1 cp
S|Grain and stabling for horse (daily)|5 cp
S|Guide, in city (per day)|2 cp
S|Hireling, trained, per day|3 cp
S|Hireling, untrained, per day|1 cp
S|Inn lodging (per day/week), Common|5 cp / 3 sp
S|Inn lodging (per day/week), Poor|1 cp / 2 cp
S|Inn lodging (per day/week), Private Room|2 sp / 8 sp
S|Lantern or torchbearer (per night)|1 cp
S|Meals (per day), Common|3 cp
S|Meals (per day), Good|5 cp
S|Meals (per day), Poor|1 cp
S|Messenger, in city (per message)|1 cp
S|Messenger, overland, per mile|1 cp
S|Minstrel (per performance)|3 sp
S|Mourner (per funeral)|2 cp
S|Road or gate toll|1 cp
S|Separate latrine for rooms (per month)|2 sp
S|Ship's passage, per mile|1 cp
S|Teamster w/wagon, per mile|1 cp
P|Adventurer Pack 1 – Adventuring Basics|20 sp
P|Adventurer Pack 2 – Ready for anything|10 sp
P|Bag Option 1|7 sp
P|Bag Option 2|11 sp 8 cp
P|Camp Cook|24 sp
P|Cleric Pack – Protect and spread the faith|60 sp
P|Dungeon Mapper|17 sp
P|Fighter Pack – Camp and battle basics|21 sp
P|Magic-User Pack – Scholar & Spellcaster|37 sp
P|Thief Pack – Tools of the trade|58 sp
G|Chess set|5 sp
G|Deck of Cards (Game, Tarot)|5 sp to 50 sp
G|Dice / Knucklebones|1 cp to 5 sp
G|Dice / Knucklebones, loaded|+10 sp
G|Juggling balls or pins – set of 3|4 sp
G|Large Wind & Brass|35 sp to 80 sp
G|Marked Cards|+15 sp
G|Percussion|1 sp to 50 sp
G|Small Wind|5 sp to 30 sp
G|Standing Instruments|min 20 sp
G|String / Harp|20 sp to 75 sp
G|Toys, common|1 cp
G|Toys, complex|min 20 sp
G|Toys, fancy|1 sp to 25 sp
J|Barrette/ Hair Comb|5 sp
J|Bracelet, Gold|25 sp
J|Bracelet, Silver|10 sp
J|Brooch, Decorative|25 sp
J|Brooch, Plain|10 sp
J|Brush / Comb|1 sp
J|Buckle (for belt) - decorative|10 sp
J|Bust, life-sized|100 sp
J|Bust, tiny|15 sp
J|Carvings, common wood/stone|5 cp to 100 sp
J|Carvings, exotic wood/stone|min 20 sp
J|Circlet, brass|2 sp
J|Circlet, gold|15 sp
J|Circlet, silver|5 sp
J|Earring, fancy/jeweled|30 sp
J|Earring, simple|2 sp
J|Etching|75 sp
J|Fan, paper|2 cp
J|Fan, silk|1 sp
J|Figurine, pewter or wood|2 cp to 3 sp
J|Figurine, silver or stone|2 sp to 30 sp
J|Handkerchief, silk|2 cp
J|Historical artifacts (antiquities)|10 sp to 500 sp
J|Locket|25 sp
J|Metalware|5 cp to 5 sp
J|Monocle|4 sp
J|Native/Folk Art|1 sp to 100 sp
J|Painting|min 10 sp
J|Pendant|45 sp
J|Pin|6 sp
J|Pottery|2 cp to 8 cp
J|Ring (Compartment)|7 sp
J|Ring (simple)|1 sp
J|Ring, Signet|5 sp
J|Spectacles|8 sp
J|Statue, Stone or Marble|50 sp to 1000 sp
J|Statue, Wood or Clay|10 sp to 200 sp
J|Tapestries|10 sp to 200 sp
J|Torc|50 sp
R|Blanket, Flannel|2 sp
R|Blanket, Wool|3 sp
R|Brass, per lb|1 cp
R|Bronze, per lb|1 cp
R|Bulk leather (1 sq ft)|5 cp
R|Candlestick, brass|6 cp
R|Candlestick, carved wood|4 cp
R|Candlestick, iron|2 sp
R|Candlestick, silver|5 sp
R|Candlestick, silver candelabra|12 sp
R|Carpets & Rugs, sq yard|4 cp
R|Cauldron (30 gal)|20 sp
R|Chandelier, Candle|7 sp
R|Chandelier, Crystal|min 50 sp
R|Chandelier, Oil Lamp|10 sp
R|Cloth (per 10 sq yards), Common|7 sp
R|Cloth (per 10 sq yards), Fine|50 sp
R|Cloth (per 10 sq yards), Rich|100 sp
R|Common (stoneware or ceramic)|6 cp
R|Copper, per lb|1 cp
R|Cushion/Padding, Armchair or|1 sp
R|Cushion/Padding, Chair or Stool|3 cp
R|Cushion/Padding, Mattress|12 sp
R|Cushion/Pillow|2 cp
R|Electrum, per lb|4 sp 5 cp
R|Fine Leather (per sq ft)|5 sp
R|Fine setting (porcelain or silver)|20 sp
R|Gold, per lb|9 sp
R|Iron, per lb|1 cp
R|Lamp, brass, oil or candle|1 sp
R|Lamp, ceramic oil|1 cp
R|Lamp, silver, oil or candle|15 sp
R|Large Furniture, Complex|15 sp
R|Large Furniture, Simple|8 sp
R|Lead, per lb|1 cp
R|Loom|6 sp
R|Medium Furniture, Complex|8 sp
R|Medium Furniture, Simple|2 sp
R|Mirror, sq ft|12 sp
R|Mithral, per lb|40 sp
R|Mug/Tankard, Brass|1 cp
R|Mug/Tankard, Pewter|6 cp
R|Plate/Bowl, Ceramic|1 cp
R|Plate/Bowl, Pewter / Stoneware|2 cp
R|Plate/Bowl, Porcelain|5 cp
R|Plate/Bowl, Silver|2 sp
R|Plate/Bowl, Wood|1 cp
R|Platinum, per lb|45 sp
R|Serving Vessel, Common|4 cp
R|Serving Vessel, Fine|5 sp
R|Serving Vessel, Tavern|1 sp
R|Silver, per lb|9 cp
R|Skins/Furs (Common), Pelt|1 sp
R|Skins/Furs (Exotic), Pelt|50 sp
R|Skins/Furs (Rare), Pelt|5 sp
R|Small Furniture, Complex|2 sp
R|Small Furniture, Simple|5 cp
R|Spinning Wheel|6 sp
R|Steel, per lb|3 cp
R|Sundial|25 sp
R|Tableware, Brass|1 cp
R|Tableware, Silver|8 cp
R|Tankard, Stoneware|1 sp 5 cp
R|Tavern/Merchant (pewter or stoneware)|3 sp
R|Tin, per lb|2 cp
R|Water Clock|1000 sp
R|Wine Glass, Common (metal)|1 cp
R|Wine Glass, Crystal|1 sp
R|Wood (lumber), 1 cord (128 cubic feet)|50 sp
R|Wooden cup and trencher|1 cp
R|Zinc, per lb|8 cp
E|Ballista|100 sp
E|Battering Ram|200 sp
E|Bolts|5 cp
E|Onager|300 sp
E|Screw|200 sp
E|Siege Tower|600 sp
E|Sow|100 sp
E|Trebuchet|400 sp`;

export const equipmentEmporiumStoreSeedsB: readonly StoreCatalogSeed[] = raw
  .trim()
  .split("\n")
  .map(line => {
    const [code, name, defaultCost] = line.split("|");
    return {
      name,
      kind: "mundane" as const,
      category: categoryByCode[code as keyof typeof categoryByCode],
      description: "",
      details: "Equipment Emporium r33",
      defaultCost,
      source: "Equipment Emporium r33" as const,
      license: "CC BY-SA 4.0",
      sourceUrl: "https://basicfantasy.org/downloads/EE1-Equipment-Emporium-r33.pdf",
      priceBasis: "Equipment Emporium price converted to the WWN silver economy (gp→sp, sp→cp; copper rounded to a 1 cp minimum).",
    };
  });
