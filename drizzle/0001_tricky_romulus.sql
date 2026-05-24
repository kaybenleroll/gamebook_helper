PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_characters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`stats` text NOT NULL,
	`initial_stats` text NOT NULL,
	`creation_rolls` text DEFAULT 'null',
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_characters`("id", "session_id", "stats", "initial_stats", "creation_rolls", "created_at") SELECT "id", "session_id", "stats", "initial_stats", "creation_rolls", "created_at" FROM `characters`;--> statement-breakpoint
DROP TABLE `characters`;--> statement-breakpoint
ALTER TABLE `__new_characters` RENAME TO `characters`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `characters_session_id_idx` ON `characters` (`session_id`);--> statement-breakpoint
CREATE TABLE `__new_combat_rounds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`combat_id` integer NOT NULL,
	`round_number` integer NOT NULL,
	`detail` text NOT NULL,
	`damage_dealt` integer NOT NULL,
	`damage_taken` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`combat_id`) REFERENCES `combats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_combat_rounds`("id", "combat_id", "round_number", "detail", "damage_dealt", "damage_taken", "created_at") SELECT "id", "combat_id", "round_number", "detail", "damage_dealt", "damage_taken", "created_at" FROM `combat_rounds`;--> statement-breakpoint
DROP TABLE `combat_rounds`;--> statement-breakpoint
ALTER TABLE `__new_combat_rounds` RENAME TO `combat_rounds`;--> statement-breakpoint
CREATE INDEX `combat_rounds_combat_id_idx` ON `combat_rounds` (`combat_id`);--> statement-breakpoint
CREATE TABLE `__new_combats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`enemy_name` text NOT NULL,
	`enemy_stats` text NOT NULL,
	`enemy_state` text NOT NULL,
	`metadata` text NOT NULL,
	`outcome` text DEFAULT 'in_progress' NOT NULL,
	`started_at` integer DEFAULT (unixepoch()) NOT NULL,
	`ended_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_combats`("id", "session_id", "enemy_name", "enemy_stats", "enemy_state", "metadata", "outcome", "started_at", "ended_at") SELECT "id", "session_id", "enemy_name", "enemy_stats", "enemy_state", "metadata", "outcome", "started_at", "ended_at" FROM `combats`;--> statement-breakpoint
DROP TABLE `combats`;--> statement-breakpoint
ALTER TABLE `__new_combats` RENAME TO `combats`;--> statement-breakpoint
CREATE INDEX `combats_session_id_idx` ON `combats` (`session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `combats_active_session_uniq` ON `combats` (`session_id`) WHERE outcome = 'in_progress';--> statement-breakpoint
CREATE TABLE `__new_inventory_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`name` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`is_special` integer DEFAULT false NOT NULL,
	`item_type` text DEFAULT 'item' NOT NULL,
	`dose_count` integer,
	`heal_amount` integer,
	`heal_dice` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_inventory_items`("id", "session_id", "name", "quantity", "is_special", "item_type", "dose_count", "heal_amount", "heal_dice", "created_at") SELECT "id", "session_id", "name", "quantity", "is_special", "item_type", "dose_count", "heal_amount", "heal_dice", "created_at" FROM `inventory_items`;--> statement-breakpoint
DROP TABLE `inventory_items`;--> statement-breakpoint
ALTER TABLE `__new_inventory_items` RENAME TO `inventory_items`;--> statement-breakpoint
CREATE INDEX `inventory_items_session_id_idx` ON `inventory_items` (`session_id`);--> statement-breakpoint
CREATE TABLE `__new_section_visits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`section_number` integer NOT NULL,
	`visited_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_section_visits`("id", "session_id", "section_number", "visited_at") SELECT "id", "session_id", "section_number", "visited_at" FROM `section_visits`;--> statement-breakpoint
DROP TABLE `section_visits`;--> statement-breakpoint
ALTER TABLE `__new_section_visits` RENAME TO `section_visits`;--> statement-breakpoint
CREATE INDEX `section_visits_session_id_idx` ON `section_visits` (`session_id`);--> statement-breakpoint
CREATE TABLE `__new_session_spells` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`spell_id` text NOT NULL,
	`uses_remaining` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_session_spells`("id", "session_id", "spell_id", "uses_remaining") SELECT "id", "session_id", "spell_id", "uses_remaining" FROM `session_spells`;--> statement-breakpoint
DROP TABLE `session_spells`;--> statement-breakpoint
ALTER TABLE `__new_session_spells` RENAME TO `session_spells`;--> statement-breakpoint
CREATE INDEX `session_spells_session_id_idx` ON `session_spells` (`session_id`);