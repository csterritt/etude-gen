CREATE TABLE `etude_validation_state` (
	`nonce` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`payload` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
