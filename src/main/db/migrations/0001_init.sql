CREATE TABLE `attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` text NOT NULL,
	`answer_json` text NOT NULL,
	`is_correct` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`synced_at` text,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `bncc_skills` (
	`code` text PRIMARY KEY NOT NULL,
	`grade` integer NOT NULL,
	`thematic_unit` text NOT NULL,
	`object_of_knowledge` text,
	`description` text NOT NULL,
	`is_enabled` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `classrooms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`grade` integer NOT NULL,
	`school_year` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`synced_at` text,
	CONSTRAINT "classrooms_grade_check" CHECK("classrooms"."grade" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE `generation_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`model_id` text,
	`latency_ms` integer NOT NULL,
	`retries` integer NOT NULL,
	`fell_back` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`model_id`) REFERENCES `llm_models`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `llm_models` (
	`id` text PRIMARY KEY NOT NULL,
	`catalog_key` text,
	`display_name` text NOT NULL,
	`file_path` text NOT NULL,
	`file_size_bytes` integer,
	`quantization` text,
	`source` text NOT NULL,
	`status` text NOT NULL,
	`sha256` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "llm_models_source_check" CHECK("llm_models"."source" IN ('catalog','imported')),
	CONSTRAINT "llm_models_status_check" CHECK("llm_models"."status" IN ('downloading','ready','error'))
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`question_id` text,
	`role` text NOT NULL,
	`kind` text NOT NULL,
	`hint_level` integer,
	`content` text NOT NULL,
	`source` text NOT NULL,
	`model_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`synced_at` text,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`model_id`) REFERENCES `llm_models`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "messages_role_check" CHECK("messages"."role" IN ('student','tutor','event')),
	CONSTRAINT "messages_kind_check" CHECK("messages"."kind" IN ('chat','hint','rephrase','example','feedback','event')),
	CONSTRAINT "messages_hint_level_check" CHECK("messages"."hint_level" BETWEEN 1 AND 3),
	CONSTRAINT "messages_source_check" CHECK("messages"."source" IN ('llm','fallback','system'))
);
--> statement-breakpoint
CREATE INDEX `ix_messages_session` ON `messages` (`session_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`student_id` text NOT NULL,
	`position` integer NOT NULL,
	`skill_code` text NOT NULL,
	`template_id` text NOT NULL,
	`seed` integer NOT NULL,
	`params_json` text NOT NULL,
	`correct_answer_json` text NOT NULL,
	`statement` text NOT NULL,
	`statement_source` text NOT NULL,
	`theme` text NOT NULL,
	`status` text NOT NULL,
	`hints_used` integer DEFAULT 0 NOT NULL,
	`attempts_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`answered_at` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`synced_at` text,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`skill_code`) REFERENCES `bncc_skills`(`code`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "questions_statement_source_check" CHECK("questions"."statement_source" IN ('llm','fallback')),
	CONSTRAINT "questions_status_check" CHECK("questions"."status" IN ('pending','correct','skipped','needs_teacher'))
);
--> statement-breakpoint
CREATE INDEX `ix_questions_session` ON `questions` (`session_id`,`position`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`title` text NOT NULL,
	`focus` text NOT NULL,
	`status` text NOT NULL,
	`questions_target` integer DEFAULT 5 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_activity_at` text NOT NULL,
	`deleted_at` text,
	`synced_at` text,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sessions_focus_check" CHECK("sessions"."focus" IN ('add_sub','mul','div','mixed')),
	CONSTRAINT "sessions_status_check" CHECK("sessions"."status" IN ('active','finished','archived'))
);
--> statement-breakpoint
CREATE INDEX `ix_sessions_student_activity` ON `sessions` (`student_id`,last_activity_at DESC);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`classroom_id` text,
	`full_name` text NOT NULL,
	`display_name` text NOT NULL,
	`grade` integer NOT NULL,
	`pin_hash` text NOT NULL,
	`avatar_key` text NOT NULL,
	`color_key` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`synced_at` text,
	FOREIGN KEY (`classroom_id`) REFERENCES `classrooms`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "students_grade_check" CHECK("students"."grade" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_students_pin_active` ON `students` (`pin_hash`) WHERE deleted_at IS NULL AND is_active = 1;