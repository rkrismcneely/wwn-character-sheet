-- Fog is stored as independent, grid-addressed cells. It is deliberately
-- sparse: visible maps retain no duplicate bitmap or per-frame state.
CREATE TABLE `campaign_map_fog_cells` (
  `map_id` text NOT NULL,
  `campaign_id` text NOT NULL,
  `cell_q` integer NOT NULL,
  `cell_r` integer NOT NULL,
  `created_at` text NOT NULL,
  PRIMARY KEY (`map_id`, `cell_q`, `cell_r`),
  FOREIGN KEY (`map_id`) REFERENCES `campaign_maps`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `campaign_map_fog_cells_campaign_map_idx`
  ON `campaign_map_fog_cells` (`campaign_id`, `map_id`);
