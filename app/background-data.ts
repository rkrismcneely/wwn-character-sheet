export type BackgroundInfo = {
  freeSkill: string;
  quickSkills: string[];
  /** The six outcomes on the Background Growth table. */
  growth: string[];
  /** The eight outcomes on the Background Learning table. */
  learning: string[];
};

// These are the Free Edition background tables.  The application stores the
// actual rolls and choices on the character rather than collapsing them into
// Quick Skills, so changing creation methods remains reversible.
export const backgrounds: Record<string, BackgroundInfo> = {
  Artisan: { freeSkill: "Craft-0", quickSkills: ["Trade-0", "Connect-0"], growth: ["+1 Any Stat", "+2 Physical", "+2 Physical", "+2 Mental", "Exert", "Any Skill"], learning: ["Connect", "Convince", "Craft", "Craft", "Exert", "Know", "Notice", "Trade"] },
  Barbarian: { freeSkill: "Survive-0", quickSkills: ["Any Combat-0", "Notice-0"], growth: ["+1 Any Stat", "+2 Physical", "+2 Physical", "+2 Mental", "Exert", "Any Skill"], learning: ["Any Combat", "Connect", "Exert", "Lead", "Notice", "Punch", "Sneak", "Survive"] },
  Carter: { freeSkill: "Ride-0", quickSkills: ["Connect-0", "Any Combat-0"], growth: ["+1 Any Stat", "+2 Physical", "+2 Physical", "+2 Mental", "Connect", "Any Skill"], learning: ["Any Combat", "Connect", "Craft", "Exert", "Notice", "Ride", "Survive", "Trade"] },
  Courtesan: { freeSkill: "Perform-0", quickSkills: ["Notice-0", "Connect-0"], growth: ["+1 Any Stat", "+2 Mental", "+2 Mental", "+2 Physical", "Connect", "Any Skill"], learning: ["Any Combat", "Connect", "Convince", "Exert", "Notice", "Perform", "Survive", "Trade"] },
  Criminal: { freeSkill: "Sneak-0", quickSkills: ["Connect-0", "Convince-0"], growth: ["+1 Any Stat", "+2 Mental", "+2 Physical", "+2 Mental", "Connect", "Any Skill"], learning: ["Administer", "Any Combat", "Connect", "Convince", "Exert", "Notice", "Sneak", "Trade"] },
  Hunter: { freeSkill: "Shoot-0", quickSkills: ["Survive-0", "Sneak-0"], growth: ["+1 Any Stat", "+2 Physical", "+2 Physical", "+2 Mental", "Exert", "Any Skill"], learning: ["Any Combat", "Exert", "Heal", "Notice", "Ride", "Shoot", "Sneak", "Survive"] },
  Laborer: { freeSkill: "Work-0", quickSkills: ["Connect-0", "Exert-0"], growth: ["+1 Any Stat", "+1 Any Stat", "+1 Any Stat", "+1 Any Stat", "Exert", "Any Skill"], learning: ["Administer", "Any Skill", "Connect", "Convince", "Craft", "Exert", "Ride", "Work"] },
  Merchant: { freeSkill: "Trade-0", quickSkills: ["Convince-0", "Connect-0"], growth: ["+1 Any Stat", "+2 Mental", "+2 Mental", "+2 Mental", "Connect", "Any Skill"], learning: ["Administer", "Any Combat", "Connect", "Convince", "Craft", "Know", "Notice", "Trade"] },
  Noble: { freeSkill: "Lead-0", quickSkills: ["Connect-0", "Administer-0"], growth: ["+1 Any Stat", "+2 Mental", "+2 Mental", "+2 Mental", "Connect", "Any Skill"], learning: ["Administer", "Any Combat", "Connect", "Convince", "Know", "Lead", "Notice", "Ride"] },
  Nomad: { freeSkill: "Ride-0", quickSkills: ["Survive-0", "Any Combat-0"], growth: ["+1 Any Stat", "+2 Physical", "+2 Physical", "+2 Mental", "Exert", "Any Skill"], learning: ["Any Combat", "Connect", "Exert", "Lead", "Notice", "Ride", "Survive", "Trade"] },
  Peasant: { freeSkill: "Exert-0", quickSkills: ["Sneak-0", "Survive-0"], growth: ["+1 Any Stat", "+2 Physical", "+2 Physical", "+2 Physical", "Exert", "Any Skill"], learning: ["Connect", "Exert", "Craft", "Notice", "Sneak", "Survive", "Trade", "Work"] },
  Performer: { freeSkill: "Perform-0", quickSkills: ["Convince-0", "Connect-0"], growth: ["+1 Any Stat", "+2 Mental", "+2 Physical", "+2 Physical", "Connect", "Any Skill"], learning: ["Any Combat", "Connect", "Exert", "Notice", "Perform", "Perform", "Sneak", "Convince"] },
  Physician: { freeSkill: "Heal-0", quickSkills: ["Know-0", "Notice-0"], growth: ["+1 Any Stat", "+2 Physical", "+2 Mental", "+2 Mental", "Connect", "Any Skill"], learning: ["Administer", "Connect", "Craft", "Heal", "Know", "Notice", "Convince", "Trade"] },
  Priest: { freeSkill: "Pray-0", quickSkills: ["Convince-0", "Know-0"], growth: ["+1 Any Stat", "+2 Mental", "+2 Physical", "+2 Mental", "Connect", "Any Skill"], learning: ["Administer", "Connect", "Know", "Lead", "Heal", "Convince", "Pray", "Pray"] },
  Sailor: { freeSkill: "Sail-0", quickSkills: ["Exert-0", "Notice-0"], growth: ["+1 Any Stat", "+2 Physical", "+2 Physical", "+2 Mental", "Exert", "Any Skill"], learning: ["Any Combat", "Connect", "Craft", "Exert", "Heal", "Notice", "Perform", "Sail"] },
  Scholar: { freeSkill: "Know-0", quickSkills: ["Heal-0", "Administer-0"], growth: ["+1 Any Stat", "+2 Mental", "+2 Mental", "+2 Mental", "Connect", "Any Skill"], learning: ["Administer", "Heal", "Craft", "Know", "Notice", "Perform", "Pray", "Convince"] },
  Slave: { freeSkill: "Sneak-0", quickSkills: ["Survive-0", "Exert-0"], growth: ["+1 Any Stat", "+2 Physical", "+2 Physical", "+2 Mental", "Exert", "Any Skill"], learning: ["Administer", "Any Combat", "Any Skill", "Convince", "Exert", "Sneak", "Survive", "Work"] },
  Soldier: { freeSkill: "Any Combat-0", quickSkills: ["Exert-0", "Survive-0"], growth: ["+1 Any Stat", "+2 Physical", "+2 Physical", "+2 Physical", "Exert", "Any Skill"], learning: ["Any Combat", "Any Combat", "Exert", "Lead", "Notice", "Ride", "Sneak", "Survive"] },
  Thug: { freeSkill: "Any Combat-0", quickSkills: ["Convince-0", "Connect-0"], growth: ["+1 Any Stat", "+2 Mental", "+2 Physical", "+2 Physical", "Connect", "Any Skill"], learning: ["Any Combat", "Any Combat", "Connect", "Convince", "Exert", "Notice", "Sneak", "Survive"] },
  Wanderer: { freeSkill: "Survive-0", quickSkills: ["Sneak-0", "Notice-0"], growth: ["+1 Any Stat", "+2 Physical", "+2 Physical", "+2 Mental", "Exert", "Any Skill"], learning: ["Any Combat", "Connect", "Notice", "Perform", "Ride", "Sneak", "Survive", "Work"] },
};

export const backgroundNames = Object.keys(backgrounds);
