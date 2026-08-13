CREATE TABLE `etude_operation` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`generationLockOwner` text,
	`generationLockAcquiredAt` integer,
	`generationLockExpiresAt` integer,
	`pdfLockOwner` text,
	`pdfLockAcquiredAt` integer,
	`pdfLockExpiresAt` integer,
	`generationCooldownAt` integer,
	`pdfCooldownAt` integer,
	`pdfGrantId` text,
	`pdfGrantExpiresAt` integer,
	`pdfGrantConsumedAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `etude_operation_userId_unique` ON `etude_operation` (`userId`);--> statement-breakpoint
CREATE TABLE `etude_piece` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`pieceId` text NOT NULL,
	`pieceJson` text NOT NULL,
	`sourceParameterVersion` integer NOT NULL,
	`svgArtifactKey` text,
	`renderState` text,
	`renderErrorCategory` text,
	`lilypondVersion` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `etude_piece_userId_unique` ON `etude_piece` (`userId`);