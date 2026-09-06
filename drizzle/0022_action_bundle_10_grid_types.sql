-- Action Bundle 10 keeps existing square maps unchanged while allowing a
-- persisted, independently calibrated pointy-hex grid for each campaign map.
ALTER TABLE `campaign_maps`
  ADD COLUMN `grid_type` text NOT NULL DEFAULT 'square'
  CHECK (`grid_type` in ('square', 'hex'));
