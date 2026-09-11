CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 5) DEFAULT '0' NOT NULL,
	"ref_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"chosen_index" integer NOT NULL,
	"is_correct" boolean NOT NULL,
	"response_ms" integer DEFAULT 0 NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_progress" (
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"answered" integer DEFAULT 0 NOT NULL,
	"correct" integer DEFAULT 0 NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"minutes" integer DEFAULT 0 NOT NULL,
	"morning_done" boolean DEFAULT false NOT NULL,
	"evening_done" boolean DEFAULT false NOT NULL,
	"reading_done" boolean DEFAULT false NOT NULL,
	"new_words_learned" integer DEFAULT 0 NOT NULL,
	"grammar_learned" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "daily_progress_user_id_date_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "explanations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"version" integer DEFAULT 2 NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"target" integer DEFAULT 0 NOT NULL,
	"produced" integer DEFAULT 0 NOT NULL,
	"cursor" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text DEFAULT 'text' NOT NULL,
	"title" text,
	"raw_text" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"passage_id" uuid,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"level" text NOT NULL,
	"term" text NOT NULL,
	"reading" text,
	"meaning_zh" text,
	"pos" text,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"book_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"video_url" text,
	"source" text DEFAULT 'seed' NOT NULL,
	"is_extra" boolean DEFAULT false NOT NULL,
	"content_ready" boolean DEFAULT false NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "level_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passage_reads" (
	"user_id" uuid NOT NULL,
	"passage_id" uuid NOT NULL,
	"unknown_tokens" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"correct" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "passage_reads_user_id_passage_id_pk" PRIMARY KEY("user_id","passage_id")
);
--> statement-breakpoint
CREATE TABLE "passages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level" text NOT NULL,
	"title" text,
	"body" text NOT NULL,
	"tokens" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary_zh" text,
	"target_kp_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scheduled_for" date,
	"source" text DEFAULT 'ai' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_knowledge_points" (
	"question_id" uuid NOT NULL,
	"knowledge_point_id" uuid NOT NULL,
	CONSTRAINT "question_knowledge_points_question_id_knowledge_point_id_pk" PRIMARY KEY("question_id","knowledge_point_id")
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level" text NOT NULL,
	"skill" text NOT NULL,
	"qtype" text NOT NULL,
	"stem" text NOT NULL,
	"passage_id" uuid,
	"options" jsonb NOT NULL,
	"answer_index" integer NOT NULL,
	"explanation" jsonb NOT NULL,
	"source" text DEFAULT 'ai' NOT NULL,
	"source_ref" text,
	"audio_url" text,
	"stem_hash" text NOT NULL,
	"quality" text DEFAULT 'ok' NOT NULL,
	"flags_count" integer DEFAULT 0 NOT NULL,
	"times_answered" integer DEFAULT 0 NOT NULL,
	"times_correct" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"question_ids" jsonb NOT NULL,
	"total" integer NOT NULL,
	"correct" integer DEFAULT 0 NOT NULL,
	"answered" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"time_limit_sec" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_knowledge_state" (
	"user_id" uuid NOT NULL,
	"knowledge_point_id" uuid NOT NULL,
	"due" timestamp with time zone DEFAULT now() NOT NULL,
	"stability" real DEFAULT 0 NOT NULL,
	"difficulty" real DEFAULT 0 NOT NULL,
	"elapsed_days" integer DEFAULT 0 NOT NULL,
	"scheduled_days" integer DEFAULT 0 NOT NULL,
	"learning_steps" integer DEFAULT 0 NOT NULL,
	"reps" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"state" integer DEFAULT 0 NOT NULL,
	"last_review" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"correct" integer DEFAULT 0 NOT NULL,
	"mastery" real DEFAULT 0 NOT NULL,
	"learned_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	CONSTRAINT "user_knowledge_state_user_id_knowledge_point_id_pk" PRIMARY KEY("user_id","knowledge_point_id")
);
--> statement-breakpoint
CREATE TABLE "user_question_state" (
	"user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"seen" integer DEFAULT 0 NOT NULL,
	"correct" integer DEFAULT 0 NOT NULL,
	"last_seen_at" timestamp with time zone,
	"last_wrong_at" timestamp with time zone,
	"wrong_streak" integer DEFAULT 0 NOT NULL,
	"retry_due" timestamp with time zone,
	CONSTRAINT "user_question_state_user_id_question_id_pk" PRIMARY KEY("user_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "user_stats" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"last_active_date" date,
	"level_estimate" text DEFAULT 'N5' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text DEFAULT 'me' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_progress" ADD CONSTRAINT "daily_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "explanations" ADD CONSTRAINT "explanations_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_passage_id_passages_id_fk" FOREIGN KEY ("passage_id") REFERENCES "public"."passages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_snapshots" ADD CONSTRAINT "level_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passage_reads" ADD CONSTRAINT "passage_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passage_reads" ADD CONSTRAINT "passage_reads_passage_id_passages_id_fk" FOREIGN KEY ("passage_id") REFERENCES "public"."passages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_knowledge_points" ADD CONSTRAINT "question_knowledge_points_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_knowledge_points" ADD CONSTRAINT "question_knowledge_points_knowledge_point_id_knowledge_points_id_fk" FOREIGN KEY ("knowledge_point_id") REFERENCES "public"."knowledge_points"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_passage_id_passages_id_fk" FOREIGN KEY ("passage_id") REFERENCES "public"."passages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_knowledge_state" ADD CONSTRAINT "user_knowledge_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_knowledge_state" ADD CONSTRAINT "user_knowledge_state_knowledge_point_id_knowledge_points_id_fk" FOREIGN KEY ("knowledge_point_id") REFERENCES "public"."knowledge_points"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_question_state" ADD CONSTRAINT "user_question_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_question_state" ADD CONSTRAINT "user_question_state_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stats" ADD CONSTRAINT "user_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_created_idx" ON "ai_usage" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "answers_user_time_idx" ON "answers" USING btree ("user_id","answered_at");--> statement-breakpoint
CREATE INDEX "answers_question_idx" ON "answers" USING btree ("question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kp_type_term_reading_idx" ON "knowledge_points" USING btree ("type","term",coalesce("reading", ''));--> statement-breakpoint
CREATE INDEX "kp_level_type_idx" ON "knowledge_points" USING btree ("level","type");--> statement-breakpoint
CREATE UNIQUE INDEX "level_snapshots_user_date_idx" ON "level_snapshots" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "passages_scheduled_idx" ON "passages" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX "qkp_kp_idx" ON "question_knowledge_points" USING btree ("knowledge_point_id");--> statement-breakpoint
CREATE UNIQUE INDEX "questions_stem_hash_idx" ON "questions" USING btree ("stem_hash");--> statement-breakpoint
CREATE INDEX "questions_level_skill_idx" ON "questions" USING btree ("level","skill","quality");--> statement-breakpoint
CREATE INDEX "questions_passage_idx" ON "questions" USING btree ("passage_id");--> statement-breakpoint
CREATE INDEX "sessions_user_started_idx" ON "sessions" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "uks_due_idx" ON "user_knowledge_state" USING btree ("user_id","due");--> statement-breakpoint
CREATE INDEX "uks_mastery_idx" ON "user_knowledge_state" USING btree ("user_id","mastery");--> statement-breakpoint
CREATE INDEX "uqs_retry_idx" ON "user_question_state" USING btree ("user_id","retry_due");--> statement-breakpoint
CREATE INDEX "uqs_lastwrong_idx" ON "user_question_state" USING btree ("user_id","last_wrong_at");