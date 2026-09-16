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

const raw = String.raw`A|Air Bladder|15 sp
A|Bed Roll|6 sp
A|Caltrops|1 sp
A|Candles, 12|1 sp
A|Chalk, colored, small bag of pieces|4 sp
A|Chalk, small bag of pieces|2 sp
A|Charcoal sticks|1 sp
A|Coal Keeper|2 sp
A|Cord/ Strap, per 3 ft|1 cp
A|Crampons|4 sp
A|Fine Paper or Vellum, per sheet|4 sp
A|Flask, Silver|20 sp
A|Flask, Steel|2 sp
A|Hammock|5 sp
A|Hunter's Horn|5 sp
A|Iron Spikes, 12|1 sp
A|Jar or Bottle, Ceramic|4 cp
A|Jar or Bottle, Glass|1 sp 2 cp
A|Ladder, Rope, 25ft|3 sp
A|Lantern, Bullseye|14 sp
A|Lantern, Hooded|8 sp
A|Lens, small|8 sp
A|Lock, Excellent|200 sp
A|Lock, Good|100 sp
A|Lock, Poor|20 sp
A|Magnet, small|1 cp
A|Magnifying glass|100 sp
A|Mirror, small metal|7 sp
A|Mirror, small silver|25 sp
A|Nails, Iron (20)|2 cp
A|Nails, silver (20)|2 sp
A|Needle, magnetized|1 sp
A|Oil (per flask)|1 sp
A|Paper or Parchment, per sheet|1 sp
A|Piton, climbing|2 cp
A|Rope, Hemp (per 50 ft)|1 sp
A|Rope, Silk (per 50 ft)|10 sp
A|Signal whistle|1 sp
A|Skates|10 sp
A|Snow skis|15 sp
A|String / Twine, 100 ft|2 cp
A|String / Twine, Silk, 100 ft|6 cp
A|Tent, Large (ten men)|25 sp
A|Tent, Pavilion|100 sp
A|Tent, Small (one man)|5 sp
A|Trap, large animal|14 sp
A|Trap, medium animal|7 sp
A|Trap, small animal|4 sp
A|Travois|5 sp
A|Vial, glass|1 sp
A|Wax, beeswax|3 cp
A|Wooden Stake|1 cp
T|Acid, flask|10 sp
T|Alchemist's glass works, each piece|5 cp to 10 sp
T|Alchemist's lab|500 sp
T|Altar case, Wood|15 sp
T|Altar Symbol, Elaborate|250 sp
T|Altar Symbol, Metal|50 sp
T|Altar Symbol, Simple|5 cp
T|Armor patch kit|5 sp
T|Arrowhead|1 cp
T|Arrowhead, silver|1 sp 5 cp
T|Artisan tools (Basic set)|5 sp
T|Artisan tools (Complete)|50 sp
T|Aspergillum|20 sp
T|Balance and Weights, Large|150 sp
T|Bell, small|1 sp
T|Belladonna, 1 sprig|4 cp
T|Bellows|10 sp
T|Block and tackle|5 sp
T|Book, blank, per 25 pages|12 sp
T|Bowstrings (10)|1 sp
T|Bucket (up to 5 gal)|5 cp
T|Canvas (per sq yard)|4 cp
T|Censer, brass|1 sp
T|Censer, gold|5 sp
T|Chain (per ft), Heavy|4 sp
T|Chain (per ft), Light|3 sp
T|Chisel|2 sp
T|Climbing harness|15 sp
T|Climbing Tools|20 sp
T|Common substances|1 cp
T|Craft Tools (Basic Set)|15 sp
T|Craft Tools (Complete)|70 sp
T|Crowbar (3 ft)|2 sp
T|Dead Hammer|10 sp
T|Disguise Kit|20 sp
T|Exotic ingredients|min 50 sp
T|Fishing net, 10 ft sq|4 sp
T|Folding / Extending rods|25 sp
T|Glass cutter|5 sp
T|Grease Pot|5 sp
T|Hammer or Mallet|3 sp
T|Hand Drill|10 sp
T|Herbalist's kit|10 sp
T|Holy Symbol|25 sp
T|Holy Symbol Flask|50 sp
T|Holy Symbol, Ornate|50 sp
T|Holy Water, per vial|10 sp
T|Hourglass (Hour)|25 sp
T|Incense, per stick|1 sp
T|Ink pot, hard ceramic|2 sp
T|Ladder, 10 ft|1 sp
T|Lampblack, pot|50 sp
T|Lens, Concave/Convex|5 sp
T|Magnets, per 1 inch sq|5 cp
T|Mandrake, root|2 sp 5 cp
T|Map-maker / Scrivener's Kit|35 sp
T|Marbles, Bag|8 cp
T|Needle, sewing|5 cp
T|Nightshade, sprig|1 sp 5 cp
T|Paint, per gallon|1 sp to 2 sp
T|Paint, small pot|2 cp
T|Pick Axe, Mining|4 sp
T|Pliers|1 sp
T|Pole, 10 ft Collapsing|50 sp
T|Pole, 10 ft wooden|1 sp
T|Prayer Beads|2 sp
T|Prayer Book (Simple)|25 sp
T|Prayer Book (Tome/Ornate)|min 250 sp
T|Prism|10 sp
T|Quill|1 cp
T|Quill knife (for sharpening quills)|1 sp
T|Quiver or Bolt case (20)|1 sp
T|Quiver, Fullback / Archer's pack|4 sp
T|Quiver, Secured (corkfoot)|25 sp
T|Rare reagents|25 sp
T|Reference Books, per 25 pages|5 sp to 100 sp
T|Ruler, silk (30 ft)|80 sp
T|Scissors|5 cp
T|Simple Scribe Kit|15 sp
T|Slate, 1 ft sq|10 sp
T|Slate, 4×6 ft|30 sp
T|Spellbook, reference|50 sp
T|Spellbook, traveling|25 sp
T|Sword Oil|1 sp
T|Thieves' picks and tools|25 sp
T|Tome, blank, per 25 pages|25 sp
T|Travel Altar|40 sp
T|Uncommon components|2 sp
T|Whetstone|1 sp
T|Wolfsbane, per sprig|1 sp
T|Writing ink (assorted color set)|20 sp
H|Bandages|1 cp
H|Crutches|1 sp
H|Oil (per flask), scented / rubbing|5 sp
H|Perfume (per vial)|5 sp
H|Razor|1 sp
H|Soap (per lb)|5 cp
H|Soap, perfumed (per lb)|5 sp
C|Adventurer's Outfit|8 sp
C|Apron, Canvas|1 sp
C|Apron, Leather|2 sp
C|Artisan / Craftsman Clothes|5 sp
C|Baldric, Belt Sash|8 cp
C|Belt|6 cp
C|Belt Hook or Ring|1 cp
C|Belt, Money Belt|4 sp
C|Belt, Weapon Belt|1 sp
C|Blouse, Linen|1 cp
C|Boots, High or Swash-topped|2 sp
C|Boots, Low|1 sp
C|Boots, Riding|3 sp
C|Bracers|6 cp
C|Breeches|7 cp
C|Bustle|3 sp
C|Cap|1 cp
C|Cap, Woolen|2 cp
C|Clerical Vestments|10 sp
C|Cold Weather Outfit|6 sp
C|Common Outfit|4 sp
C|Corset|1 sp
C|Corset, Leather|5 sp
C|Courtier Costume|min 25 sp
C|Doublet|1 sp
C|Entertainer's Costume|10 sp
C|Foot wraps|1 cp
C|Girdle|1 sp
C|Gloves|7 cp
C|Gloves, Fur Lined|4 sp
C|Gorget|3 sp
C|Gown or Dress, common|1 sp 2 cp
C|Hat, Cloth|5 cp
C|Hat, Fur|1 sp
C|Hat, Straw|1 cp
C|Headband|1 cp
C|Headband, Tooled|2 cp
C|Hood or Cowl, Wool or Linen|2 cp
C|Hose|5 cp
C|Hose Supporter/Garter|5 cp
C|Jacket|1 sp
C|Jacket, Leather|2 sp
C|Jerkin, Leather|2 sp
C|Jerkin, Wool or Linen|1 sp
C|Journal (blank)|20 sp
C|Leggings|9 cp
C|Leggings, Leather|2 sp
C|Loincloth|1 cp
C|Map or scroll case|1 sp
C|Mess Kit|8 sp
C|Mittens|3 cp
C|Noble's Finery|min 50 sp
C|Peasant Outfit|1 sp
C|Robe, Common|9 cp
C|Robe, Embroidered|10 sp
C|Robe, Lounging|2 sp
C|Royal Regalia|min 100 sp
C|Sandals|1 cp
C|Sash|2 cp
C|Sash, Silk|10 sp
C|Scabbard Suspenders|7 cp
C|Scabbard, Medium|3 cp
C|Scabbard, Small|1 cp
C|Scarf|5 cp
C|Scholar's Robes|5 sp
C|Sealing Wax|3 cp
C|Shirt or Chemise|8 cp
C|Shirt or Chemise, Silk|15 sp
C|Shoes|8 cp
C|Shoes, Moccasins|2 sp
C|Signet ring or personal seal|5 sp
C|Skirt or Kilt|7 cp
C|Skirt or Kilt, Leather|2 sp
C|Slippers|1 sp 5 cp
C|Smoking Pipe|1 sp
C|Smoking pouch|1 sp
C|Snowshoes|20 sp
C|Surcoat|6 cp
C|Suspenders / Braces|4 cp
C|Tabards|2 sp
C|Tinder Box, Flint & Steel|3 sp
C|Toga|1 sp
C|Torches, 6|1 sp
C|Travel Clothes|6 sp
C|Trousers or Trews|8 cp
C|Trousers or Trews, Leather|2 sp
C|Tunic|8 cp
C|Turban|3 cp
C|Veil, Silk|1 sp
C|Vest, Cloth w/Pockets|8 cp
C|Vest, Fur / Leather|2 sp
C|Wig|1 sp
C|Wineskin/Waterskin|1 sp
C|Wineskin/Waterskin, gallon|3 sp
C|Winter blanket|1 sp
C|Writing ink (per vial)|8 sp
F|Ale / Cider, common, 250-gallon tun|40 sp
F|Ale / Cider, common, 30-gallon barrel|8 sp
F|Ale / Cider, common, gallon|8 cp
F|Ale / Cider, common, pint|1 cp
F|Ale / Cider, exceptional, 250-gallon tun|400 sp
F|Ale / Cider, exceptional, 30-gallon barrel|80 sp
F|Ale / Cider, exceptional, gallon|8 sp
F|Ale / Cider, exceptional, pint|1 sp
F|Ale / Cider, quality, 250-gallon tun|150 sp
F|Ale / Cider, quality, 30-gallon barrel|30 sp
F|Ale / Cider, quality, gallon|3 sp
F|Ale / Cider, quality, pint|4 cp
F|Beer, common, 250-gallon tun|20 sp
F|Beer, common, 30-gallon barrel|4 sp
F|Beer, common, gallon|4 cp
F|Beer, common, pint|1 cp
F|Beer, quality, 250-gallon tun|80 sp
F|Beer, quality, 30-gallon barrel|16 sp
F|Beer, quality, gallon|1 sp 6 cp
F|Beer, quality, pint|2 cp
F|Candied fruit/herbs, oz|5 cp to 5 sp
F|Carcass, Game Animal|1 sp/HD
F|Cooking Supplies (per week)|3 sp
F|Cured meats (salted, smoked, dried, etc.)|4 sp
F|Dry, one week|10 sp
F|Elven Waybread, one week|35 sp
F|Fire grate|3 sp
F|Firewood (per day)|1 cp
F|Fishhook|1 cp
F|Flour (fine)|1 cp
F|Fresh fruits, Common, per lb|1 sp
F|Fresh fruits, Rare/imported, per lb|10 sp
F|Fruit, dried|2 cp
F|Garlic, 1 bulb|1 cp
F|Grain (raw)|1 cp
F|Halfling pipeweed|2 sp
F|Herbs / Spices, common|5 cp
F|Herbs / Spices, Exotic|15 sp
F|Herbs / Spices, Rare|2 sp
F|Herbs / Spices, uncommon|1 sp
F|Iron Pan (Frying)|8 cp
F|Iron Pot|5 cp
F|Mead, common, 250-gallon tun|40 sp
F|Mead, common, 30-gallon barrel|8 sp
F|Mead, common, bottle|5 cp
F|Mead, common, pint|1 cp
F|Mead, quality, 250-gallon tun|150 sp
F|Mead, quality, 30-gallon barrel|30 sp
F|Mead, quality, bottle|2 sp
F|Mead, quality, pint|4 cp
F|Meal (rough)|1 cp
F|Meal, Banquet (per person)|10 sp
F|Meal, Common|1 cp
F|Meal, Merchant's (Good quality)|2 cp
F|Meal, Poor|1 cp
F|Meal, Rich|1 sp
F|Nuts|1 sp
F|Pickled fish, 5 gal barrel|3 sp
F|Pickled vegetables, quart|1 sp
F|Salt (1lb)|1 sp
F|Small Beer / Applejack, 30-gallon barrel|4 sp
F|Small Beer / Applejack, gallon|4 cp
F|Small Beer / Applejack, pint|1 cp
F|Spirits, common, 250-gallon tun|200 sp
F|Spirits, common, 30-gallon barrel|40 sp
F|Spirits, common, bottle|2 sp
F|Spirits, common, shot|1 cp
F|Spirits, exceptional, 250-gallon tun|10000 sp
F|Spirits, exceptional, 30-gallon barrel|2000 sp
F|Spirits, exceptional, bottle|min 100 sp
F|Spirits, exceptional, shot|min 5 sp
F|Spirits, quality, 250-gallon tun|2000 sp
F|Spirits, quality, 30-gallon barrel|400 sp
F|Spirits, quality, bottle|20 sp
F|Spirits, quality, shot|1 sp
F|Spirits, rotgut, 30-gallon barrel|12 sp
F|Spirits, rotgut, bottle|6 cp
F|Spirits, rotgut, shot|1 cp
F|Standard (perishable), one day|6 cp
F|Sugar|1 sp
F|Tea pot|3 cp
F|Tobacco, high quality|1 sp
F|Tobacco, per pouch|5 cp
F|Tripod, cooking|3 sp
F|Wine, common, 250-gallon tun|40 sp
F|Wine, common, 30-gallon barrel|8 sp
F|Wine, common, bottle|1 sp`;

export const equipmentEmporiumStoreSeedsA: readonly StoreCatalogSeed[] = raw
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
