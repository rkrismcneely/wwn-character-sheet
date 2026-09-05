/**
 * Shared player-facing explanations for rules entries.
 *
 * The full SRD text remains available through the rules-help affordance; this
 * layer is intentionally short and describes what a choice does at the table.
 */
export function plainLanguageSummary(name: string, text: string) {
  const namedSummaries: Record<string, string> = {
    "Apprehending the Arcane Form": "Lets you see and identify magic and see in darkness.",
    "Cognitive Supersession of the Inferior Orders": "Lets you control a normal animal and share its senses.",
    "The Coruscating Coffin": "Blasts one visible creature with lethal magical energy.",
    "Damnation of the Sense": "Lets you control or suppress one of a creature’s senses.",
    "Decree of Ligneous Dissolution": "Destroys ordinary wood, cloth, rope, and other plant-based material in an area.",
    "The Excellent Transpicuous Transformation": "Makes willing creatures invisible until one of them acts violently.",
    "Imperceptible Cerebral Divulgence": "Reads a creature’s surface thoughts and can probe its memories.",
    "Ineluctable Shackles of Volition": "Enthralls a creature and makes it obey your physical commands.",
    "The Long Amber Moment": "Freezes a touched creature in protected temporal stasis.",
    "Phantasmal Mimesis": "Creates a convincing multisensory illusion that can also fight.",
    "Velocitous Imbuement": "Lets allies move twice as fast, run on walls, and slip safely through melee.",
    "Wardpact Invocation": "Temporarily protects a creature from weapons or makes one weapon harmless.",
    "The Wind of the Final Repose": "Puts a group of weaker living creatures to sleep.",
    "Calculation of the Evoked Servitor": "Summons a loyal, intelligent familiar until the next dawn.",
    "Casting Forth the Inner Eye": "Lets you remotely see and hear a distant place.",
    "Conjunction of the Inexorable Step": "Teleports a visible creature or object to a nearby visible location.",
    "Decree of Lithic Dissolution": "Destroys a large amount of ordinary earth or stone.",
    "Extirpate Arcana": "Dispels or temporarily suppresses unwanted magic in an area.",
    "The Inexorable Imputation": "Makes listeners believe one plausible statement for a limited time.",
    "The Jade Palanquin of the Faceless God": "Summons a floating platform that can carry people and heavy cargo.",
    "Mantle of Disjecting Dissection": "Surrounds an ally with blades that punish anyone who approaches or attacks them.",
    "Prudentially Transient Abnegation of Life": "Lets someone appear to die at 0 HP and revive a short time later.",
    "Resounding Temporal Echo": "Gives allies an extra Main Action for several rounds.",
    "The Verdant Vallation": "Creates a large, sturdy wall of vines that can be covered in thorns.",
    "Visitation of the Clement Clime": "Protects allies from extreme heat, cold, acid, and electricity.",
    "Adopt the Simulacular Visage": "Disguises willing creatures as other humanoids, including voice and clothing.",
    "Conjunct the Vital Viscera": "Transfers health, afflictions, or body parts between willing or helpless creatures.",
    "Exhalation of Congelating Cold": "Freezes a wide area, damaging and slowing creatures inside it.",
    "Foresightful Apprehension": "Reveals the most likely immediate result of a planned action.",
    "The Glass Chimes of the Bamboo Terrace": "Sends a perfectly understood message over great distance or shatters in a damaging blast.",
    "The Howl of Light": "Creates a powerful explosion of heat, sound, and force.",
    "Phobic Storm": "Terrifies nearby enemies and can force them to flee.",
    "Scorn the Fetters of Earth": "Lets allies walk through the air or forces flying creatures to land.",
    "The Torment of Tumefaction": "Curses a creature so strenuous actions cause it damage.",
    "Touch of Elucidating Intangibility": "Lets you see through a solid barrier or briefly pass through it.",
    "Vallation of Specified Exclusion": "Creates a barrier that a chosen type of creature and its powers cannot cross.",
    "Calculation of the Phantasmal Eidolon": "Summons a loyal semi-real creature that fights without killing.",
    "Contingent Excision of Arcana": "Stores a dispel that you can trigger instantly later.",
    "Disjunctive Temporal Reversion": "Makes a creature redo its current turn.",
    "Evert the Inwardness": "Pulls contents from a container or violently tears into a creature.",
    "The Grinding Geas": "Forces a creature to obey a command or suffer a deadly worsening curse.",
    "Obnubilation of the Will": "Turns a helpless creature into an obedient long-term thrall.",
    "The Ochre Sigil of Juxtaposition": "Swaps everyone and everything near you with those near a prepared sigil.",
    "Pierce the Pallid Gate": "Opens a temporary two-way portal between two nearby places.",
    "Sigil of Aeolian Auctoritas": "Creates a violent blast of wind or changes the local weather.",
    "Abdication of Temporal Presence": "Gives your group several free rounds while the rest of the world is frozen.",
    "Banishment to the Black Glass Labyrinth": "Traps creatures in an extradimensional maze.",
    "The Dazzling Prismatic Hemicycle": "Hits creatures in a huge cone with one of several severe random effects.",
    "Deluge of Hell": "Devastates a huge outdoor area with massively destructive magical damage.",
    "The Earth as Clay": "Reshapes natural earth and stone into terrain, tunnels, or structures.",
    "Invocation of the Invincible Citadel": "Creates an almost impenetrable protective force bubble.",
    "Open the High Road": "Opens a long-distance one-way portal to a prepared destination.",
    "Arcane Lexicon": "Lets you read almost any non-coded writing.",
    "Counter Magic": "Lets you try to cancel an enemy mage’s spell as it is cast.",
    "Empowered Sorcery": "Lets you reroll one of your spell’s variable effects.",
    "Hang Sorcery": "Holds a spell so you can choose its target and release it later.",
    "Inexorable Effect": "Forces an enemy to reroll a successful save against your magic.",
    "Iron Resolution": "Gives you a chance to keep casting after being hurt or disrupted.",
    "Preparatory Countermagic": "Makes you immune to the direct effects of a spell you have prepared.",
    "Psychic Conversion": "Trades one spell casting for healing and reduced System Strain.",
    "Restrained Casting": "Lets you cast a spell silently and without gestures.",
    "Retain Sorcery": "Lets you recover the casting you just spent, effectively giving the spell slot back.",
    "Sense Magic": "Lets you see magical energy, identify active magic, and see in darkness.",
    "Suppress Magic": "Temporarily shuts down a magical effect.",
    "Swift Casting": "Lets you cast a normally slow spell as an On Turn action.",
    "Ward Allies": "Protects chosen allies from the direct effects of your area spell.",
    "Wizard’s Grandeur": "Keeps you clean, comfortable, and able to sleep without shelter.",
  };
  if (namedSummaries[name]) return namedSummaries[name];

  const normalized = text
    .replace(/\s+/g, " ")
    .replace(/\bsoporific influence\b/gi, "sleep-inducing magic")
    .replace(/\bfall unconscious\b/gi, "fall asleep")
    .replace(/\bthaumic discharge\b/gi, "magical blast")
    .replace(/\bper scene\b/gi, "once each scene")
    .replace(/\bper day\b/gi, "once each day")
    .replace(/\bCommit(?: all remaining)? Effort\b/g, "Spend Effort")
    .replace(/\bcommitted Effort\b/g, "spent Effort")
    .replace(/\bthe caster’s\b/gi, "your")
    .replace(/\bthe caster\b/gi, "you")
    .replace(/\bthe mage’s\b/gi, "your")
    .replace(/\bthe mage\b/gi, "you");

  const withoutCostPreamble = normalized
    .replace(/^Spend Effort[^.;]*\bto\s+/i, "")
    .replace(/^Spend Effort (?:for the (?:scene|day)|as an [^.]+?)(?: as an? [^.]+?)?[.;]\s*/i, "")
    .replace(/^Once per (?:day|scene)[^,]*,\s*/i, "")
    .replace(/^As an? (?:Main|On Turn|Instant) action,\s*/i, "");
  const sentences = withoutCostPreamble
    .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
    ?.map(sentence => sentence.trim()) ?? [withoutCostPreamble.trim()];
  const effectSentence = sentences.find(sentence =>
    !/^Spend Effort\b/i.test(sentence) &&
    /\b(?:allows?|becomes?|causes?|creates?|cures?|detects?|gains?|heals?|ignores?|makes?|prevents?|puts?|removes?|restores?|summons?|teleports?|turns?|can|may)\b/i.test(sentence),
  ) ?? sentences.find(sentence => !/^Spend Effort\b/i.test(sentence)) ?? withoutCostPreamble;
  const selected = effectSentence
    .replace(/^You (?:may |can )?/i, "You ")
    .replace(/^A magical blast is focused on /i, "You hit ")
    .replace(/^You conjures up /i, "You create ")
    .replace(/^You designates /i, "Choose ")
    .replace(/^You targets /i, "You target ")
    .replace(/\s+(?:The|This|Any|Each|Targets?)\b.*$/i, "")
    .trim();
  return selected.length > 180 ? `${selected.slice(0, 177).trimEnd()}…` : selected;
}
