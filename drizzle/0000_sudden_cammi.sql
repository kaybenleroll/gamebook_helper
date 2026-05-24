CREATE TABLE `characters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`stats` text NOT NULL,
	`initial_stats` text NOT NULL,
	`creation_rolls` text DEFAULT 'null',
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `characters_session_id_idx` ON `characters` (`session_id`);--> statement-breakpoint
CREATE TABLE `combat_rounds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`combat_id` integer NOT NULL,
	`round_number` integer NOT NULL,
	`detail` text NOT NULL,
	`damage_dealt` integer NOT NULL,
	`damage_taken` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`combat_id`) REFERENCES `combats`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `combat_rounds_combat_id_idx` ON `combat_rounds` (`combat_id`);--> statement-breakpoint
CREATE TABLE `combats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`enemy_name` text NOT NULL,
	`enemy_stats` text NOT NULL,
	`enemy_state` text NOT NULL,
	`metadata` text NOT NULL,
	`outcome` text DEFAULT 'in_progress' NOT NULL,
	`started_at` integer DEFAULT (unixepoch()) NOT NULL,
	`ended_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `combats_session_id_idx` ON `combats` (`session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `combats_active_session_uniq` ON `combats` (`session_id`) WHERE outcome = 'in_progress';--> statement-breakpoint
CREATE TABLE `inventory_items` (
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
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `inventory_items_session_id_idx` ON `inventory_items` (`session_id`);--> statement-breakpoint
CREATE TABLE `map_edges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`map_id` integer NOT NULL,
	`from_node_id` integer NOT NULL,
	`to_node_id` integer NOT NULL,
	`target_map_id` integer,
	`direction` text,
	`connection_type` text NOT NULL,
	FOREIGN KEY (`map_id`) REFERENCES `maps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_node_id`) REFERENCES `map_nodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_node_id`) REFERENCES `map_nodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_map_id`) REFERENCES `maps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `map_edges_map_id_idx` ON `map_edges` (`map_id`);--> statement-breakpoint
CREATE TABLE `map_nodes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`map_id` integer NOT NULL,
	`section_number` integer,
	`location_type` text NOT NULL,
	`location_type_custom` text,
	`notes` text,
	`visited` integer DEFAULT false NOT NULL,
	`is_current` integer DEFAULT false NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	FOREIGN KEY (`map_id`) REFERENCES `maps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `map_nodes_map_id_idx` ON `map_nodes` (`map_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `map_nodes_current_idx` ON `map_nodes` (`map_id`) WHERE is_current = 1;--> statement-breakpoint
CREATE TABLE `maps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `maps_session_id_idx` ON `maps` (`session_id`);--> statement-breakpoint
CREATE TABLE `section_visits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`section_number` integer NOT NULL,
	`visited_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `section_visits_session_id_idx` ON `section_visits` (`session_id`);--> statement-breakpoint
CREATE TABLE `session_spells` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`spell_id` text NOT NULL,
	`uses_remaining` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `session_spells_session_id_idx` ON `session_spells` (`session_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_system_id` text NOT NULL,
	`book_title` text NOT NULL,
	`notes` text,
	`panel_order` text,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
