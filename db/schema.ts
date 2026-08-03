import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const characters = sqliteTable("characters", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  player: text("player").notNull().default(""),
  classLabel: text("class_label").notNull().default(""),
  level: integer("level").notNull().default(1),
  data: text("data").notNull(),
  version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
