# Graph Report - fitness_prog  (2026-08-30)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 4118 nodes · 10958 edges · 253 communities (212 shown, 41 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 404 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6f4dca94`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 89
- Community 90
- Community 91
- Community 92
- Community 93
- Community 94
- Community 95
- Community 96
- Community 97
- Community 98
- Community 99
- Community 100
- Community 101
- Community 102
- Community 103
- Community 104
- Community 105
- Community 106
- Community 107
- Community 108
- Community 109
- Community 110
- Community 111
- Community 112
- Community 113
- Community 114
- Community 115
- Community 116
- Community 117
- Community 118
- Community 119
- Community 120
- Community 121
- Community 122
- Community 123
- Community 124
- Community 125
- Community 127
- Community 128
- Community 129
- Community 130
- Community 131
- Community 132
- Community 133
- Community 134
- Community 135
- Community 136
- Community 137
- Community 138
- Community 139
- Community 140
- Community 143
- Community 144
- Community 145
- Community 146
- Community 148
- Community 149
- Community 151
- Community 152
- Community 153
- Community 154
- Community 155
- Community 156
- Community 159
- Community 160
- Community 161
- Community 162
- Community 163
- Community 164
- Community 165
- Community 167
- Community 168
- Community 172
- Community 173
- Community 174
- Community 175
- Community 176
- Community 177
- Community 178
- Community 179
- Community 180
- Community 183
- Community 184
- Community 185
- Community 186
- Community 187
- Community 188
- Community 189
- Community 190
- Community 191
- Community 192
- Community 193
- Community 194
- Community 195
- Community 197
- Community 198
- Community 199
- Community 200
- Community 202
- Community 220

## God Nodes (most connected - your core abstractions)
1. `Settings` - 206 edges
2. `toUserMessage()` - 111 edges
3. `build_all()` - 82 edges
4. `ex()` - 81 edges
5. `AuditContext` - 68 edges
6. `_get()` - 57 edges
7. `isOnline()` - 57 edges
8. `getStoredToken()` - 49 edges
9. `ActiveWorkout()` - 47 edges
10. `get_settings()` - 44 edges

## Surprising Connections (you probably didn't know these)
- `add_event()` --calls--> `admin_audit_log`  [EXTRACTED]
  backend/app/services/admin_audit.py → supabase/migrations/20260826000023_admin_audit_log.sql
- `create_draft()` --calls--> `AdminBroadcast`  [EXTRACTED]
  backend/app/services/admin_broadcasts.py → frontend/src/api/adminBroadcasts.ts
- `save_for_day()` --calls--> `BodyMeasurement`  [EXTRACTED]
  backend/app/services/body_measurements.py → frontend/src/api/bodyMeasurements.ts
- `save_for_day()` --calls--> `DailyMetric`  [EXTRACTED]
  backend/app/services/daily_metrics.py → frontend/src/api/dailyMetrics.ts
- `create_exercise()` --calls--> `Exercise`  [EXTRACTED]
  backend/app/services/exercise_service.py → frontend/src/types/workout.ts

## Import Cycles
- None detected.

## Communities (253 total, 41 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (72): cancelTimerNotification(), notifyTimerEnded(), scheduleTimerNotification(), RestTimer(), RestTimerProps, Props, RestContext, RestTimerHost (+64 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (89): build_all(), day(), ex(), fb_bw_a(), fb_bw_b(), fb_bw_c(), gym_adv_legs(), gym_adv_legs_b() (+81 more)

### Community 2 - "Community 2"
Cohesion: 0.04
Nodes (73): dispatchMyDueNotifications(), fetchPushConfig(), fetchWaterLog(), NotificationSettingsPayload, PushConfig, pushConfigSchema, removePushSubscription(), savePushSubscription() (+65 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (74): fetchBodyMeasurementAnalytics(), getStoredToken(), fetchDailyMetricsRange(), fetchExercises(), fetchNotificationSettings(), saveNotificationSettings(), addNutritionLog(), fetchDailyNutrition() (+66 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (54): DecimalInput(), displayValue(), isDecimalDraft(), Props, normalizeDecimalInput(), parseDecimalInput(), NumberStepper(), Props (+46 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (56): AdminExercise, AdminExerciseFilters, AdminExerciseOptions, AdminExercisePayload, adminExerciseSchema, applyExerciseImport(), archiveAdminExercise(), createAdminExercise() (+48 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (45): hasSession(), loginWithTelegram(), fetchMyProfile(), Shell(), bootstrapAuth(), useMainButton(), UseMainButtonOptions, CatalogUiState (+37 more)

### Community 7 - "Community 7"
Cohesion: 0.04
Nodes (44): AIAnalyzeResult, AIChatResult, AIHistoryResult, analyzeProgress(), analyzeSchema, chatSchema, fetchAIHistory(), historySchema (+36 more)

### Community 8 - "Community 8"
Cohesion: 0.08
Nodes (48): cancelScheduledWorkout(), fetchPlannedWorkoutPlan(), fetchWorkoutSchedule(), recentWorkoutResponses, rescheduleWorkout(), scheduleOccurrenceSchema, scheduleOverviewSchema, setSchema (+40 more)

### Community 9 - "Community 9"
Cohesion: 0.06
Nodes (41): PlannedWorkoutPlanInput, savePlannedWorkoutPlan(), ExerciseCard(), ExerciseCardProps, ExerciseDetailModal(), Props, ExerciseMediaPlayer(), extractYouTubeId() (+33 more)

### Community 10 - "Community 10"
Cohesion: 0.09
Nodes (51): _acquire_timer_lock(), cancel_timer_notification(), create_reminder(), delete_push_subscription(), dispatch_all(), dispatch_all_users(), dispatch_due_for_me(), _dispatch_user() (+43 more)

### Community 11 - "Community 11"
Cohesion: 0.09
Nodes (47): addWorkoutSet(), completeWorkout(), createWorkout(), deleteWorkout(), fetchWorkout(), invalidateWorkoutResponse(), mapSet(), mapWorkout() (+39 more)

### Community 12 - "Community 12"
Cohesion: 0.10
Nodes (43): DayExerciseRow, dayExerciseRows(), limitationConflict(), normalizeName(), placeholderExercise(), profileLimits(), ProgramsPage(), openProgramExercise() (+35 more)

### Community 13 - "Community 13"
Cohesion: 0.09
Nodes (42): AdminSystemCheck, AdminSystemFact, get_admin_system_status(), AdminSystemStatusResponse, AsyncSession, AdminSystemCheck, AdminSystemFact, AdminSystemStatusResponse (+34 more)

### Community 14 - "Community 14"
Cohesion: 0.06
Nodes (51): admin_guide_path(), build_mini_app_open_url(), extract_callback_query(), extract_open_text_tap(), extract_start_command(), load_admin_guide_bytes(), load_user_guide_bytes(), mini_app_keyboard() (+43 more)

### Community 15 - "Community 15"
Cohesion: 0.07
Nodes (39): get_db(), AsyncSession, Yield an async database session., init_sentry(), Optional Sentry init for production (no hard crash if package missing)., get_current_user(), AsyncSession, User (+31 more)

### Community 16 - "Community 16"
Cohesion: 0.08
Nodes (42): UploadFile, Extract an editable per-100g draft from a nutrition-label photo., recognize_label(), NutritionLabelRecognitionResponse, Editable draft extracted from a package nutrition label., call_local_chat(), is_local_ai_config(), Bounded client for the internal llama.cpp Chat Completions endpoint. (+34 more)

### Community 17 - "Community 17"
Cohesion: 0.08
Nodes (40): AdminBroadcast, AdminBroadcastAudience, AdminBroadcastDraft, AdminBroadcastList, audienceKindSchema, audienceSchema, campaignSchema, cancelAdminBroadcast() (+32 more)

### Community 18 - "Community 18"
Cohesion: 0.06
Nodes (30): users, exercises, programs, workout_sets, workouts, nutrition_logs, nutrition_products, ai_conversations (+22 more)

### Community 19 - "Community 19"
Cohesion: 0.10
Nodes (43): bot_api(), bot_commands_reply_keyboard(), delete_webhook(), extract_admin_command(), extract_bot_command(), extract_help_command(), get_webhook_info(), local_ai_restored_announcement_text() (+35 more)

### Community 20 - "Community 20"
Cohesion: 0.14
Nodes (40): add_set(), cancel_workout_occurrence(), complete_workout(), create_workout(), delete_workout(), get_workout(), planned_workout_plan(), AsyncSession (+32 more)

### Community 21 - "Community 21"
Cohesion: 0.12
Nodes (39): catalog_by_key(), Any, Built-in supplement catalog — only items with meaningful evidence for athletes., Optional suggestions for UI — NOT auto-applied to new users., recommended_user_entries(), user_entry_from_catalog(), add_custom(), add_from_catalog() (+31 more)

### Community 22 - "Community 22"
Cohesion: 0.16
Nodes (35): cancel_broadcast(), _context(), copy_broadcast(), create_broadcast(), _enqueue(), get_broadcast(), launch_broadcast(), list_broadcasts() (+27 more)

### Community 23 - "Community 23"
Cohesion: 0.10
Nodes (35): AuthResponse, authResponseSchema, AuthUser, authUserSchema, EmailLinkResult, emailLinkResultSchema, EmailOtpRequestResult, emailOtpRequestSchema (+27 more)

### Community 24 - "Community 24"
Cohesion: 0.09
Nodes (32): Parse comma-separated CORS origins., Runtime configuration for the FastAPI backend., Settings, _verify_secret(), _build_otp_message(), _build_service_message(), SMTP send helpers for email OTP login., Deliver one admin service message after verified user opt-in. (+24 more)

### Community 25 - "Community 25"
Cohesion: 0.09
Nodes (35): Application settings loaded from environment variables., _build_data_check_string(), create_access_token(), decode_access_token(), get_token_subject(), InitDataError, Any, ValueError (+27 more)

### Community 26 - "Community 26"
Cohesion: 0.16
Nodes (36): create_program(), delete_program(), get_program(), list_programs(), preview_program(), _publication_error(), publish_program(), AsyncSession (+28 more)

### Community 27 - "Community 27"
Cohesion: 0.12
Nodes (37): apply_state_updates(), due_notifications(), format_calorie_reminder_text(), _in_window(), is_workout_day(), local_now(), _normalize_days_mode(), normalize_supplement_schedule() (+29 more)

### Community 28 - "Community 28"
Cohesion: 0.12
Nodes (37): add_log(), calc_kbju(), create_product(), daily_summary(), delete_log(), fetch_openfoodfacts(), get_product_by_barcode(), get_products_map() (+29 more)

### Community 29 - "Community 29"
Cohesion: 0.16
Nodes (38): is_accessible_to_user(), Allow the public current version or the immutable version already in use., add_workout_set(), _advance_program_cursor_for_completed_workout(), build_plan_from_program_day(), build_program_plan_for_user(), _create_set_slots(), create_workout() (+30 more)

### Community 30 - "Community 30"
Cohesion: 0.11
Nodes (37): _ensure_bot_commands(), _ensure_default_menu_button(), _handle_supplement_callback(), _handle_water_callback(), _is_first_start(), _load_guide_sent(), _mark_guide_sent(), Any (+29 more)

### Community 31 - "Community 31"
Cohesion: 0.14
Nodes (36): AdminNotificationCategory, AdminUserActivity, AdminUserCommunications, AdminUserNextWorkout, AdminUserProgramSummary, AdminUserQuestionnaire, AdminUserRecordCounts, AdminUserSafeEvent (+28 more)

### Community 32 - "Community 32"
Cohesion: 0.10
Nodes (36): mark_seed_program_published(), Any, Stable non-identifying key for versioned programs maintained in seed., Trusted seed rows are published content, unlike admin-created drafts., seed_program_key(), seed_program_payload(), main(), apply_db() (+28 more)

### Community 33 - "Community 33"
Cohesion: 0.10
Nodes (34): due_workout_notification(), mark_occurrence_started(), Any, date, datetime, mark_skipped_and_shift(), AsyncSession, date (+26 more)

### Community 34 - "Community 34"
Cohesion: 0.14
Nodes (35): add_log(), create_product(), daily(), delete_log(), energy_targets(), list_categories(), lookup_barcode(), nutrition_range() (+27 more)

### Community 35 - "Community 35"
Cohesion: 0.11
Nodes (31): adminDetailSchema, adminSummarySchema, AdminSupportDetail, AdminSupportList, AdminSupportTicket, getAdminSupportTicket(), listAdminSupportTickets(), listSchema (+23 more)

### Community 36 - "Community 36"
Cohesion: 0.07
Nodes (20): AsyncClient, get_settings(), Return cached settings instance., Base, Async SQLAlchemy engine and session factory., Base class for SQLAlchemy models., main(), Print SMTP config status without leaking the password. (+12 more)

### Community 37 - "Community 37"
Cohesion: 0.12
Nodes (26): get_daily_metrics(), get_metric_range(), put_daily_metrics(), AsyncSession, date, put, User, Manual daily sleep and movement API. (+18 more)

### Community 38 - "Community 38"
Cohesion: 0.13
Nodes (33): add_message(), close_ticket(), create_ticket(), _detail(), download_attachment(), get_ticket(), list_tickets(), AsyncSession (+25 more)

### Community 39 - "Community 39"
Cohesion: 0.21
Nodes (33): active_program_snapshot(), cancel_workout_occurrence(), _cancellation_for_day(), effective_workout_context(), _fallback_title(), get_schedule_overview(), local_schedule_day(), next_base_workout_date() (+25 more)

### Community 40 - "Community 40"
Cohesion: 0.09
Nodes (26): actionSchema, AdminActionResult, adminApiError(), AdminResetScope, AdminUser, adminUserSchema, clearAdminUser(), deleteAdminUser() (+18 more)

### Community 41 - "Community 41"
Cohesion: 0.14
Nodes (32): auth_email_link_request_code(), auth_email_link_verify(), auth_email_request_code(), auth_email_verify(), auth_telegram(), AsyncSession, post, Request (+24 more)

### Community 42 - "Community 42"
Cohesion: 0.17
Nodes (32): merge_notification_settings(), _resolve_tz(), claim_notified(), _day_bounds(), day_items(), due_groups(), ensure_day(), intake_group() (+24 more)

### Community 43 - "Community 43"
Cohesion: 0.11
Nodes (30): send_workout_reminder(), _claim_dispatch_minute(), dispatch_scheduled_notifications_task(), notification_settings(), on_shutdown(), on_startup(), Any, datetime (+22 more)

### Community 44 - "Community 44"
Cohesion: 0.09
Nodes (16): get_request_id(), parse_or_create_request_id(), Request, UUID, Validated request correlation identifiers., AddOnlySession, AuthSession, ListSession (+8 more)

### Community 45 - "Community 45"
Cohesion: 0.21
Nodes (31): health(), Liveness probe used by CI and local checks., AdminBroadcastCounts, AuditContext, _audit_snapshot(), cancel_scheduled(), _clean_message(), _clean_title() (+23 more)

### Community 46 - "Community 46"
Cohesion: 0.14
Nodes (30): _generate_code(), _hash_code(), _issue_otp(), LinkVerificationResult, _load_valid_otp(), normalize_email(), AsyncSession, MergePreference (+22 more)

### Community 47 - "Community 47"
Cohesion: 0.09
Nodes (25): actorSchema, AdminAuditActor, AdminAuditEntry, AdminAuditFilters, AdminAuditResponse, AdminAuditResult, entrySchema, fetchAdminAudit() (+17 more)

### Community 48 - "Community 48"
Cohesion: 0.12
Nodes (26): actionSchema, AdminMessageChannel, AdminUserActivity, adminUserActivitySchema, AdminUserCommunications, adminUserCommunicationsSchema, adminUserCountsSchema, AdminUserSummary (+18 more)

### Community 49 - "Community 49"
Cohesion: 0.11
Nodes (24): archive_stale_logs(), _date_from_log_name(), _EncodingSafeStream, InterceptHandler, date, Path, Structured logging via loguru (TZ section 12). Layout (project root): logs/…, Configure loguru: stdout + daily file sink + archive of previous days. - One… (+16 more)

### Community 50 - "Community 50"
Cohesion: 0.10
Nodes (15): Background tasks (Arq)., FakeDispatchRedis, FakeNotificationSession, FakePagedSession, FakeRedisLock, FakeScalarResult, asyncio, Regression tests for timer locking and paged notification dispatch. (+7 more)

### Community 51 - "Community 51"
Cohesion: 0.16
Nodes (28): _anthro_name(), _clear_measurements(), clear_user_data(), _delete_nutrition_rows(), delete_user(), _delete_user_owned_rows(), _delete_workout_rows(), display_name() (+20 more)

### Community 52 - "Community 52"
Cohesion: 0.14
Nodes (20): apply_replacements(), apply_saved_override(), _find_override(), Any, AsyncSession, date, UUID, WorkoutPlanOverride (+12 more)

### Community 53 - "Community 53"
Cohesion: 0.13
Nodes (24): BodyMeasurementAnalytics, bodyMeasurementAnalyticsItemSchema, bodyMeasurementAnalyticsSchema, BodyMeasurementField, bodyMeasurementRangeSchema, bodyMeasurementSchema, deleteBodyMeasurement(), fetchBodyMeasurement() (+16 more)

### Community 54 - "Community 54"
Cohesion: 0.14
Nodes (28): AIQueryDomain, classify_ai_query(), extract_period_days(), missing_data_question(), conversation_history(), format_rag_block(), analyze_progress(), _bounded_context() (+20 more)

### Community 55 - "Community 55"
Cohesion: 0.16
Nodes (26): change_status(), _detail(), get_ticket(), list_tickets(), _not_found(), AsyncSession, Exception, patch (+18 more)

### Community 56 - "Community 56"
Cohesion: 0.17
Nodes (28): AdminSupportTicketSummary, SupportTicketSummary, add_admin_reply(), add_user_message(), close_user_ticket(), create_ticket(), _ensure_rate_limit(), get_admin_ticket() (+20 more)

### Community 57 - "Community 57"
Cohesion: 0.11
Nodes (15): exercise(), ListSession, MutationSession, program(), asyncio, Regression tests for safe program drafts and publication visibility., Scalars, test_editing_published_program_creates_draft_without_mutating_source() (+7 more)

### Community 58 - "Community 58"
Cohesion: 0.12
Nodes (23): AdminSystemCheck, AdminSystemFact, AdminSystemStatus, AdminSystemStatusResponse, checkSchema, factSchema, fetchAdminSystemStatus(), responseSchema (+15 more)

### Community 59 - "Community 59"
Cohesion: 0.14
Nodes (25): AdminAuditActor, AdminAuditEntry, AuditResult, AdminAuditActor, AdminAuditEntry, AdminAuditListResponse, BaseModel, Safe contracts for the administrator audit journal. (+17 more)

### Community 60 - "Community 60"
Cohesion: 0.12
Nodes (22): get_me(), AsyncSession, put, User, update_me(), Any, BaseModel, field_validator (+14 more)

### Community 61 - "Community 61"
Cohesion: 0.14
Nodes (22): DAYS_PER_WEEK, defaultAdjPct(), EQUIPMENT, GOALS, JOINT_LIMITS, LEVELS, LOCATIONS, OnboardingPage() (+14 more)

### Community 62 - "Community 62"
Cohesion: 0.17
Nodes (20): create_exercise(), delete_exercise(), get_exercise(), list_exercises(), AsyncSession, delete, post, put (+12 more)

### Community 63 - "Community 63"
Cohesion: 0.08
Nodes (25): autoprefixer, chrome-launcher, eslint-plugin-react-hooks, eslint-plugin-react-refresh, devDependencies, autoprefixer, chrome-launcher, eslint-plugin-react-hooks (+17 more)

### Community 64 - "Community 64"
Cohesion: 0.08
Nodes (25): axios, dexie, dependencies, axios, dexie, react, react-dom, react-router-dom (+17 more)

### Community 65 - "Community 65"
Cohesion: 0.15
Nodes (22): _active_program(), build_application_context(), _format_workout(), _list_text(), _number(), _plan_exercises(), _profile_context(), _program_context() (+14 more)

### Community 66 - "Community 66"
Cohesion: 0.16
Nodes (23): age_from_birth_date(), compute_energy_targets(), is_female_sex(), macro_split_grams(), mifflin_st_jeor_bmr(), Any, date, Daily energy targets from anthropometry + goals (Mifflin–St Jeor). (+15 more)

### Community 67 - "Community 67"
Cohesion: 0.17
Nodes (22): admin_user_activity(), admin_user_communications(), admin_user_export_download(), admin_user_message(), admin_user_notifications(), admin_user_resend_guide(), admin_user_summary(), AdminUserActivity (+14 more)

### Community 68 - "Community 68"
Cohesion: 0.22
Nodes (22): _choose(), _counts(), merge_accounts(), _merge_body_measurements(), _merge_daily_metrics(), merge_preview(), _merge_supplements(), merge_values() (+14 more)

### Community 69 - "Community 69"
Cohesion: 0.11
Nodes (17): Reject model drift into English; callers then use the Russian rule fallback., _russian_only(), FakeAsyncClient, FakeResponse, local_settings(), MonkeyPatch, parametrize, Local AI request profile and output safety tests. (+9 more)

### Community 70 - "Community 70"
Cohesion: 0.14
Nodes (17): AuthSession, exercise(), FakeHttpClient, FakeResponse, asyncio, Stage 5 exercise editor safety and validation regressions., settings(), test_archive_is_blocked_before_mutation_when_exercise_is_used() (+9 more)

### Community 71 - "Community 71"
Cohesion: 0.20
Nodes (19): fetchDailyMetrics(), saveDailyMetrics(), saveWaterLog(), HabitsCheckin(), syncWater(), parseNullable(), Props, valueOrEmpty() (+11 more)

### Community 72 - "Community 72"
Cohesion: 0.18
Nodes (18): shiftDate(), BadgesPanel(), ProgressPage(), Badge, computeBadges(), buildCalendarDays(), computeDailyVolume(), computeStreak() (+10 more)

### Community 73 - "Community 73"
Cohesion: 0.08
Nodes (23): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+15 more)

### Community 74 - "Community 74"
Cohesion: 0.17
Nodes (21): ExerciseArchiveConflict, ExerciseDuplicateCandidate, ExerciseImportApplyRequest, ExerciseImportApplyResponse, ExerciseImportPreviewRequest, ExerciseImportPreviewResponse, ExerciseImportPreviewRow, BaseModel (+13 more)

### Community 75 - "Community 75"
Cohesion: 0.15
Nodes (12): BodyMeasurementUpdate, model_validator, FakeSession, asyncio, test_body_measurement_schema_bounds(), test_delete_measurement_soft_deletes_and_removes_stale_weight(), test_measurement_analytics_does_not_call_weight_loss_a_success_without_target(), test_measurement_analytics_uses_field_baselines_and_explicit_weight_goal() (+4 more)

### Community 76 - "Community 76"
Cohesion: 0.16
Nodes (21): PlannedWorkoutPlanRequest, PlannedWorkoutReplacement, BaseModel, Workout and set request/response schemas., Editable summary fields for an existing workout., WorkoutCreate, WorkoutHistoryResponse, WorkoutPlan (+13 more)

### Community 77 - "Community 77"
Cohesion: 0.16
Nodes (18): Props, WeeklyOverview(), daysCount(), exercisesCount(), pluralRu(), setsCount(), workoutsCount(), avgRpe() (+10 more)

### Community 78 - "Community 78"
Cohesion: 0.22
Nodes (21): Get-FitnessPortPids(), Get-FitnessStatus(), Invoke-FitnessMigrate(), Invoke-FitnessSeed(), Invoke-FitnessTest(), Restart-Backend(), Restart-FitnessStack(), Restart-Frontend() (+13 more)

### Community 79 - "Community 79"
Cohesion: 0.19
Nodes (20): admin_clear_user_data(), admin_delete_user(), admin_list_users(), admin_reset_user(), AsyncSession, delete, post, User (+12 more)

### Community 80 - "Community 80"
Cohesion: 0.23
Nodes (21): media_check(), preflight(), ExerciseMediaCheckRequest, ExerciseMediaCheckResponse, ExercisePreflightRequest, ExercisePreflightResponse, check_media(), find_duplicates() (+13 more)

### Community 81 - "Community 81"
Cohesion: 0.15
Nodes (20): Push a short Telegram message when in-app rest/hold timer finishes., timer_ended_notify(), Send HTML notification with Mini App Open button (web_app preferred)., send_app_notification(), fetch_recipients(), main(), notify_all(), TRUNCATE user tables. Returns deleted-ish counts from before wipe. (+12 more)

### Community 82 - "Community 82"
Cohesion: 0.15
Nodes (16): App(), descriptions, ThemeSelector(), initSentry(), rootElement, applyThemePreference(), isThemePreference(), palette (+8 more)

### Community 83 - "Community 83"
Cohesion: 0.10
Nodes (18): BarcodeLookup, barcodeLookupSchema, createNutritionProduct(), dailySchema, deleteNutritionLog(), EnergyTargets, logSchema, lookupBarcode() (+10 more)

### Community 84 - "Community 84"
Cohesion: 0.15
Nodes (18): closeSupportTicket(), getSupportTicket(), sendSupportMessage(), SupportTicketDetail, uploadSupportScreenshot(), PageSkeleton(), Props, SupportPage() (+10 more)

### Community 85 - "Community 85"
Cohesion: 0.14
Nodes (8): Ensure-Chocolatey(), Fail(), Get-EnvMap(), Get-InstallerEnvMap(), Info(), Invoke-Native(), Invoke-Step(), Refresh-ProcessPath()

### Community 86 - "Community 86"
Cohesion: 0.23
Nodes (17): ai_analyze(), ai_chat(), ai_history(), AsyncSession, date, post, User, AI trainer routes backed by the unlimited local inference service. (+9 more)

### Community 87 - "Community 87"
Cohesion: 0.26
Nodes (17): delete_daily_measurement(), get_daily_measurement(), get_measurement_analytics(), get_measurement_range(), put_daily_measurement(), AsyncSession, date, delete (+9 more)

### Community 88 - "Community 88"
Cohesion: 0.18
Nodes (17): BarcodeDetectorCtor, BarcodeDetectorLike, BarcodeScannerModal(), emitCode(), start(), startNative(), startZxing(), createZxingReader() (+9 more)

### Community 89 - "Community 89"
Cohesion: 0.18
Nodes (15): ./feature-${version}.js, contentTypes, assertInside(), criticalFiles, fileHash(), frontendDir, isVersionedAsset(), main() (+7 more)

### Community 90 - "Community 90"
Cohesion: 0.28
Nodes (17): apply_import(), archive_exercise(), create_exercise(), _item(), list_exercises(), preview_import(), AsyncSession, delete (+9 more)

### Community 91 - "Community 91"
Cohesion: 0.20
Nodes (16): exercise_snapshot(), Return only catalog metadata; URLs and long instructional text stay out., create_exercise(), ExerciseInUseError, ExerciseRestoreConflictError, get_archived_exercise(), get_exercise(), list_exercises() (+8 more)

### Community 92 - "Community 92"
Cohesion: 0.14
Nodes (8): AuthSession, MutationSession, asyncio, Stage 4 broadcast safety, authorization, and queue regressions., test_broadcast_audit_never_accepts_message_content(), test_cancel_stops_only_not_started_scheduled_campaign(), test_launch_requires_test_and_double_confirmation(), test_regular_user_cannot_open_broadcast_center()

### Community 93 - "Community 93"
Cohesion: 0.20
Nodes (11): db, FitnessDB, LocalWorkoutSession, MetaRow, SyncOpType, SyncQueueItem, WorkoutIdMap, sessionBelongsToUser() (+3 more)

### Community 94 - "Community 94"
Cohesion: 0.17
Nodes (9): AddCommitSession, AuthSession, asyncio, Stage 3 admin user card contracts and safety regressions., ScalarAddCommitSession, test_regular_user_cannot_open_user_card(), test_service_email_requires_and_records_user_consent(), test_service_message_is_escaped_and_never_written_to_audit() (+1 more)

### Community 95 - "Community 95"
Cohesion: 0.15
Nodes (15): DailyMetric, DailyMetricRange, dailyMetricRangeSchema, dailyMetricSchema, average(), buildPeriod(), localIso(), MetricChart() (+7 more)

### Community 96 - "Community 96"
Cohesion: 0.17
Nodes (11): System prompts for AI trainer (TZ §6)., _has_urgent_health_marker(), _requires_rule_only(), _rule_based_reply(), test_basic_safety_facts_use_deterministic_reply(), test_non_urgent_pain_question_uses_safe_rule_reply(), test_urgent_health_question_never_reaches_model(), _contains_any() (+3 more)

### Community 97 - "Community 97"
Cohesion: 0.36
Nodes (15): BodyMeasurementAnalyticsItem, build_analytics(), delete_for_day(), get_analytics(), get_for_day(), _interpret_change(), list_range(), _period_start() (+7 more)

### Community 98 - "Community 98"
Cohesion: 0.27
Nodes (14): _mapping(), Any, AsyncSession, UUID, Audited administrator actions from the user detail card., _record_delivery_action(), resend_guide(), send_service_message() (+6 more)

### Community 99 - "Community 99"
Cohesion: 0.15
Nodes (14): fetchProductCategories(), NutritionLabelRecognition, NutritionLog, CATEGORY_LABELS, categoryLabel(), formatDayLabel(), MealId, MEALS (+6 more)

### Community 100 - "Community 100"
Cohesion: 0.27
Nodes (13): exercise_query_terms(), _exercise_score(), _normalize(), AsyncSession, Lightweight deterministic retrieval over the local exercise catalog., Return top exercise snippets for LLM / rule context., retrieve_exercise_context(), _stem() (+5 more)

### Community 101 - "Community 101"
Cohesion: 0.21
Nodes (13): create_draft_version(), _integer(), is_public_catalog_program(), ProgramPublicationError, publish(), AsyncSession, ValueError, Validation and immutable publication lifecycle for training programs. (+5 more)

### Community 102 - "Community 102"
Cohesion: 0.31
Nodes (12): WorkoutCompleteRequest, complete_workout(), four_day_program(), NoCommitSession, asyncio, parametrize, Offline retries must converge on one server-side workout state., test_complete_workout_returns_existing_completed_snapshot() (+4 more)

### Community 103 - "Community 103"
Cohesion: 0.31
Nodes (11): Make a deleted program workout the next workout again. Deletion means that the…, _rollback_program_cursor_for_deleted_workout(), ppl6_program(), ProgramSession, asyncio, Deleting a program workout must restore that exact day in the cycle., Out-of-order client updates and later rows must not suppress deletion rollback., test_deleting_pull_b_restores_pull_b_instead_of_legs_b() (+3 more)

### Community 104 - "Community 104"
Cohesion: 0.26
Nodes (11): Ensure-LocalStack(), Ensure-Tailscale(), Get-PublicUrl(), Invoke-RequestedApiRestart(), Invoke-RequestedWorkerRestart(), Read-DotEnvValue(), Start-HiddenPowerShell(), Test-Http() (+3 more)

### Community 105 - "Community 105"
Cohesion: 0.26
Nodes (12): DailyNutrition, NutritionProduct, isFavoriteProduct(), loadFavoriteProducts(), loadRecentProducts(), localYesterdayISO(), logsFromDaily(), readList() (+4 more)

### Community 106 - "Community 106"
Cohesion: 0.28
Nodes (8): StrengthTrends(), bestSetInWorkout(), buildLiftTrends(), compoundBoost(), estimate1rm(), formatDelta(), LiftPoint, LiftTrend

### Community 107 - "Community 107"
Cohesion: 0.22
Nodes (11): ExerciseProgressChart(), LineChart(), Metric, Period, Phase, PHASES, shortDate(), ExerciseDiarySession (+3 more)

### Community 108 - "Community 108"
Cohesion: 0.48
Nodes (11): AnalysisEvidence, build_analysis_evidence(), _fmt(), _measurement_evidence(), _nutrition_evidence(), AsyncSession, date, User (+3 more)

### Community 109 - "Community 109"
Cohesion: 0.24
Nodes (10): health(), _parse_tesseract_tsv(), _prepare_image(), post, Request, Internal-only Tesseract OCR microservice for nutrition labels., Reassemble words by block/paragraph/line, not by word number., recognize() (+2 more)

### Community 110 - "Community 110"
Cohesion: 0.30
Nodes (10): AdminBroadcastAudience, model_validator, audience_count(), audience_recipients(), audience_statement(), AdminBroadcastAudience, AsyncSession, datetime (+2 more)

### Community 111 - "Community 111"
Cohesion: 0.30
Nodes (10): aggregate_workout_load(), LoadSet, normalized_set_volume(), Canonical workout-load math shared by analytics and AI., Return kg×reps only for a completed weighted set. A weight saved as…, WorkoutLoadMetrics, Domain routing, period parsing and canonical workout-load tests., test_canonical_load_separates_weight_reps_and_time() (+2 more)

### Community 112 - "Community 112"
Cohesion: 0.17
Nodes (11): compilerOptions, lib, module, moduleResolution, noEmit, skipLibCheck, strict, target (+3 more)

### Community 113 - "Community 113"
Cohesion: 0.21
Nodes (5): Get-EnvVal(), Get-ListenPids(), Read-DotEnv(), Stop-Port(), Warn()

### Community 114 - "Community 114"
Cohesion: 0.33
Nodes (10): AdminBroadcastDelivery, _claim_batch(), classify_telegram_error(), deliver_batch(), _finish_or_continue(), Any, UUID, Rate-limited, restart-safe delivery batches for administrator broadcasts. (+2 more)

### Community 115 - "Community 115"
Cohesion: 0.25
Nodes (11): http_exception_handler(), Exception, Request, request_id_middleware(), unhandled_exception_handler(), validation_exception_handler(), exception_handler, JSONResponse (+3 more)

### Community 116 - "Community 116"
Cohesion: 0.18
Nodes (10): adminJs, adminJsGzip, assetsDir, buildDir, failures, js, largestJsGzip, limits (+2 more)

### Community 117 - "Community 117"
Cohesion: 0.25
Nodes (10): BodyMeasurementAnalyticsItem, BodyMeasurementPeriod, FEATURED_FIELDS, GOAL_LABELS, MeasurementAnalyticsCard(), numberText(), PERIODS, shortDate() (+2 more)

### Community 118 - "Community 118"
Cohesion: 0.36
Nodes (8): audit(), load_json(), main(), Path, Deterministic audit of the exercise catalog, manifest and local GIF files., write_report(), test_every_seed_exercise_has_audited_media_status(), test_plank_has_verified_gif_and_side_plank_is_not_substituted()

### Community 120 - "Community 120"
Cohesion: 0.20
Nodes (10): scripts, audit:lighthouse, build, build:publish, check:bundle, dev, lint, preview (+2 more)

### Community 121 - "Community 121"
Cohesion: 0.31
Nodes (7): NutritionLogCreate, NutritionLogUpdate, Partial update for an existing diary entry (grams / meal / optional KBJU…, test_calc_kbju_per_portion(), test_nutrition_log_update_schema_partial(), Nutrition quantities must fail validation before reaching NUMERIC columns., test_log_quantity_has_upper_bound()

### Community 122 - "Community 122"
Cohesion: 0.39
Nodes (8): _active_rows(), export_row(), prepare_user_export(), Any, AsyncSession, UUID, Allowlisted user data export for administrator-assisted requests., Serialize only mapped columns from an explicitly selected safe model.

### Community 124 - "Community 124"
Cohesion: 0.33
Nodes (6): _load_script(), Tests for the managed Timeweb App Platform deployment helpers., test_timeweb_environment_accepts_managed_public_services(), test_timeweb_environment_rejects_local_or_unprotected_services(), test_timeweb_environment_requires_postgres_tls(), test_timeweb_migration_environment_does_not_put_password_in_command()

### Community 125 - "Community 125"
Cohesion: 0.25
Nodes (4): isHhMm(), Props, SPECIAL, TimeSlotsEditor()

### Community 127 - "Community 127"
Cohesion: 0.39
Nodes (7): Response, Smoke tests for app wiring., request(), test_auth_telegram_rejects_empty_body(), test_auth_telegram_rejects_invalid_init_data(), test_health(), test_notification_dispatch_all_requires_authentication()

### Community 129 - "Community 129"
Cohesion: 0.46
Nodes (8): AdminUserActions(), archiveUser(), clearData(), exportData(), perform(), resend(), sendMessage(), toggleReminders()

### Community 130 - "Community 130"
Cohesion: 0.36
Nodes (7): fmtDelta(), fmtKcal(), NutritionBalanceChart(), PeriodCard(), Props, NutritionBalanceDay, NutritionPeriodTotals

### Community 132 - "Community 132"
Cohesion: 0.38
Nodes (6): main(), ordered_migrations(), postgres_environment(), Path, Apply append-only SQL migrations in Timeweb without exposing DB credentials., Convert the SQLAlchemy URL to libpq variables without logging a password.

### Community 133 - "Community 133"
Cohesion: 0.48
Nodes (6): apply(), load_from_checklist(), load_from_seed(), main(), media_source_for(), Apply video_url (+ media_source) from seed JSON into DB without wiping GIFs.…

### Community 134 - "Community 134"
Cohesion: 0.29
Nodes (5): apiAddress, apiServer, child, cli, root

### Community 135 - "Community 135"
Cohesion: 0.38
Nodes (5): ToastHost(), ToastItem, ToastKind, ToastState, useToastStore

### Community 136 - "Community 136"
Cohesion: 0.38
Nodes (6): Calendar(), CalendarProps, statusClass(), WEEKDAYS, CalendarDay, monthLabel()

### Community 137 - "Community 137"
Cohesion: 0.47
Nodes (4): main(), patch_seed(), Add missing replacement exercises to seed_content/exercises.json and seed DB., seed_db()

### Community 138 - "Community 138"
Cohesion: 0.33
Nodes (4): outputDir, report, root, routes

### Community 139 - "Community 139"
Cohesion: 0.47
Nodes (5): cameraStream(), frameToFile(), NutritionLabelCameraModal(), takePhoto(), Props

### Community 140 - "Community 140"
Cohesion: 0.53
Nodes (4): ALLOWED_TYPES, canvasBlob(), loadImage(), prepareNutritionLabelImage()

### Community 143 - "Community 143"
Cohesion: 0.50
Nodes (5): options(), AdminExerciseOptions, AdminExerciseOptions, get_options(), AdminExerciseOptions

### Community 144 - "Community 144"
Cohesion: 0.50
Nodes (4): main(), Run the API and ARQ worker as one Timeweb App Platform container., _terminate(), Popen

### Community 145 - "Community 145"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 146 - "Community 146"
Cohesion: 0.40
Nodes (3): BottomNavigation(), items, NavIconName

### Community 148 - "Community 148"
Cohesion: 0.70
Nodes (4): column_exists(), is_applied(), record_applied(), apply_migrations_vps.sh script

### Community 149 - "Community 149"
Cohesion: 0.70
Nodes (4): compose(), on_exit(), backup_vps.sh script, write_backup_status()

### Community 151 - "Community 151"
Cohesion: 0.67
Nodes (3): day(), main(), Generate exercises.json (100) and programs.json (8) for P0 seed.

### Community 152 - "Community 152"
Cohesion: 0.67
Nodes (3): main(), Fail fast on unsafe or incomplete Timeweb production settings., validation_errors()

### Community 153 - "Community 153"
Cohesion: 0.50
Nodes (3): adminProfile, summary, userMessage

### Community 154 - "Community 154"
Cohesion: 0.50
Nodes (3): Charts(), ChartsProps, DayVolume

### Community 155 - "Community 155"
Cohesion: 0.50
Nodes (3): apiPrefixes, navigationStrategy, offlineNavigationFallback

### Community 156 - "Community 156"
Cohesion: 0.50
Nodes (3): ImportMeta, ImportMetaEnv, Window

## Knowledge Gaps
- **432 isolated node(s):** `fitness-backend`, `start.sh script`, `40-publish-release.sh script`, `publicRoutes`, `adminProfile` (+427 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **41 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Settings` connect `Community 24` to `Community 10`, `Community 13`, `Community 14`, `Community 15`, `Community 16`, `Community 19`, `Community 22`, `Community 25`, `Community 30`, `Community 34`, `Community 36`, `Community 38`, `Community 41`, `Community 43`, `Community 44`, `Community 45`, `Community 46`, `Community 50`, `Community 51`, `Community 54`, `Community 55`, `Community 67`, `Community 69`, `Community 70`, `Community 79`, `Community 80`, `Community 81`, `Community 86`, `Community 90`, `Community 92`, `Community 94`, `Community 98`?**
  _High betweenness centrality (0.119) - this node is a cross-community bridge._
- **Why does `Exercise` connect `Community 9` to `Community 0`, `Community 2`, `Community 3`, `Community 4`, `Community 6`, `Community 40`, `Community 8`, `Community 106`, `Community 11`, `Community 12`, `Community 52`, `Community 91`, `Community 93`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **Why does `create_exercise()` connect `Community 91` to `Community 9`, `Community 45`, `Community 90`, `Community 59`, `Community 62`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Are the 137 inferred relationships involving `Settings` (e.g. with `create_access_token()` and `decode_access_token()`) actually correct?**
  _`Settings` has 137 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `build_all()` (e.g. with `shoulder_home_female()` and `shoulder_home_male()`) actually correct?**
  _`build_all()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `fitness-backend`, `start.sh script`, `40-publish-release.sh script` to the rest of the system?**
  _432 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.047928331466965284 - nodes in this community are weakly interconnected._