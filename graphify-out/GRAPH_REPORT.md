# Graph Report - fitness_prog  (2026-08-30)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 4219 nodes · 11207 edges · 258 communities (215 shown, 43 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 423 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e0dde041`
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
- Community 126
- Community 127
- Community 128
- Community 129
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
- Community 141
- Community 142
- Community 143
- Community 144
- Community 145
- Community 148
- Community 149
- Community 150
- Community 152
- Community 153
- Community 155
- Community 156
- Community 157
- Community 158
- Community 159
- Community 160
- Community 161
- Community 164
- Community 165
- Community 166
- Community 167
- Community 168
- Community 169
- Community 171
- Community 172
- Community 176
- Community 177
- Community 178
- Community 179
- Community 180
- Community 181
- Community 182
- Community 183
- Community 184
- Community 187
- Community 188
- Community 189
- Community 190
- Community 191
- Community 192
- Community 193
- Community 194
- Community 195
- Community 196
- Community 197
- Community 198
- Community 199
- Community 201
- Community 202
- Community 203
- Community 204
- Community 206
- Community 207
- Community 225

## God Nodes (most connected - your core abstractions)
1. `Settings` - 213 edges
2. `toUserMessage()` - 115 edges
3. `build_all()` - 82 edges
4. `ex()` - 81 edges
5. `AuditContext` - 66 edges
6. `_get()` - 58 edges
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

## Communities (258 total, 43 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (71): sendAIChat(), listSchema, mapExercise(), db, FitnessDB, LocalWorkoutSession, MetaRow, SyncOpType (+63 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (89): build_all(), day(), ex(), fb_bw_a(), fb_bw_b(), fb_bw_c(), gym_adv_legs(), gym_adv_legs_b() (+81 more)

### Community 2 - "Community 2"
Cohesion: 0.04
Nodes (81): cancelTimerNotification(), dispatchMyDueNotifications(), fetchNotificationSettings(), fetchPushConfig(), NotificationSettingsPayload, notifyTimerEnded(), PushConfig, pushConfigSchema (+73 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (59): AdminSystemCheck, AdminSystemFact, AdminSystemHistorySnapshot, AdminSystemSnapshotSource, check_and_record_admin_system_status(), get_admin_system_history(), get_admin_system_status(), AdminSystemHistoryResponse (+51 more)

### Community 4 - "Community 4"
Cohesion: 0.12
Nodes (61): getStoredToken(), fetchExercises(), fetchPrograms(), startProgramWorkout(), fetchMyProfile(), updateMyProfile(), fetchPlannedWorkoutPlan(), fetchWorkoutHistory() (+53 more)

### Community 5 - "Community 5"
Cohesion: 0.05
Nodes (37): get_settings(), Application settings loaded from environment variables., Return cached settings instance., Base, get_db(), AsyncSession, Async SQLAlchemy engine and session factory., Base class for SQLAlchemy models. (+29 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (59): AdminExercise, AdminExerciseFilters, AdminExerciseOptions, AdminExercisePayload, adminExerciseSchema, applyExerciseImport(), archiveAdminExercise(), createAdminExercise() (+51 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (45): DecimalInput(), displayValue(), isDecimalDraft(), Props, normalizeDecimalInput(), parseDecimalInput(), NumberStepper(), Props (+37 more)

### Community 8 - "Community 8"
Cohesion: 0.07
Nodes (51): create_exercise(), delete_exercise(), get_exercise(), list_exercises(), AsyncSession, delete, post, put (+43 more)

### Community 9 - "Community 9"
Cohesion: 0.08
Nodes (61): _ensure_bot_commands(), _ensure_default_menu_button(), _handle_supplement_callback(), _handle_water_callback(), _is_first_start(), _load_guide_sent(), _mark_guide_sent(), Any (+53 more)

### Community 10 - "Community 10"
Cohesion: 0.08
Nodes (51): addWorkoutSet(), completeWorkout(), createWorkout(), deleteWorkout(), fetchWorkout(), invalidateWorkoutResponse(), mapSet(), mapWorkout() (+43 more)

### Community 11 - "Community 11"
Cohesion: 0.09
Nodes (48): CollapsibleFilterPanel(), CollapsibleFilterPanelProps, chooseProgram(), ExerciseDetailModal(), DayExerciseRow, dayExerciseRows(), limitationConflict(), normalizeName() (+40 more)

### Community 12 - "Community 12"
Cohesion: 0.10
Nodes (54): apply_import(), archive_exercise(), create_exercise(), _item(), list_exercises(), media_check(), options(), preflight() (+46 more)

### Community 13 - "Community 13"
Cohesion: 0.09
Nodes (54): _acquire_timer_lock(), cancel_timer_notification(), delete_push_subscription(), dispatch_all(), dispatch_all_users(), dispatch_due_for_me(), _dispatch_user(), _enrich_due_item() (+46 more)

### Community 14 - "Community 14"
Cohesion: 0.09
Nodes (45): adminDetailSchema, adminSummarySchema, AdminSupportDetail, AdminSupportList, AdminSupportTicket, getAdminSupportTicket(), listAdminSupportTickets(), listSchema (+37 more)

### Community 15 - "Community 15"
Cohesion: 0.06
Nodes (51): admin_guide_path(), build_mini_app_open_url(), extract_start_command(), load_admin_guide_bytes(), load_user_guide_bytes(), mini_app_keyboard(), open_web_app_keyboard(), Path (+43 more)

### Community 16 - "Community 16"
Cohesion: 0.07
Nodes (36): cancelScheduledWorkout(), PlannedWorkoutPlanInput, rescheduleWorkout(), savePlannedWorkoutPlan(), WorkoutScheduleOccurrence, Props, ExerciseMediaPlayer(), extractYouTubeId() (+28 more)

### Community 17 - "Community 17"
Cohesion: 0.08
Nodes (40): AdminBroadcast, AdminBroadcastAudience, AdminBroadcastDraft, AdminBroadcastList, audienceKindSchema, audienceSchema, campaignSchema, cancelAdminBroadcast() (+32 more)

### Community 18 - "Community 18"
Cohesion: 0.08
Nodes (34): useMainButton(), UseMainButtonOptions, draftsFromWorkout(), buildDrafts(), CatalogUiState, makeLocalWorkout(), readCatalogUi(), todayISO() (+26 more)

### Community 19 - "Community 19"
Cohesion: 0.09
Nodes (41): AdminAuditActor, AuditResult, export_admin_audit_events(), list_admin_audit_events(), AsyncSession, AuditExportFormat, datetime, post (+33 more)

### Community 20 - "Community 20"
Cohesion: 0.06
Nodes (30): users, exercises, programs, workout_sets, workouts, nutrition_logs, nutrition_products, ai_conversations (+22 more)

### Community 21 - "Community 21"
Cohesion: 0.14
Nodes (37): cancel_broadcast(), _context(), copy_broadcast(), create_broadcast(), _enqueue(), get_broadcast(), launch_broadcast(), list_broadcasts() (+29 more)

### Community 22 - "Community 22"
Cohesion: 0.14
Nodes (40): add_set(), cancel_workout_occurrence(), complete_workout(), create_workout(), delete_workout(), get_workout(), planned_workout_plan(), AsyncSession (+32 more)

### Community 23 - "Community 23"
Cohesion: 0.10
Nodes (36): actionSchema, AdminMessageChannel, AdminUserActivity, adminUserActivitySchema, AdminUserCommunications, adminUserCommunicationsSchema, adminUserCountsSchema, AdminUserSummary (+28 more)

### Community 24 - "Community 24"
Cohesion: 0.07
Nodes (25): get_request_id(), parse_or_create_request_id(), Request, UUID, Validated request correlation identifiers., create_access_token(), Create HS256 JWT session token (default TTL: 30 days per TZ §8)., AddOnlySession (+17 more)

### Community 25 - "Community 25"
Cohesion: 0.12
Nodes (39): catalog_by_key(), Any, Built-in supplement catalog — only items with meaningful evidence for athletes., Optional suggestions for UI — NOT auto-applied to new users., recommended_user_entries(), user_entry_from_catalog(), add_custom(), add_from_catalog() (+31 more)

### Community 26 - "Community 26"
Cohesion: 0.09
Nodes (37): UploadFile, Extract an editable per-100g draft from a nutrition-label photo., recognize_label(), NutritionLabelRecognitionResponse, Editable draft extracted from a package nutrition label., _decimal(), detect_image_mime(), _energy_kcal() (+29 more)

### Community 27 - "Community 27"
Cohesion: 0.10
Nodes (31): _generate_code(), _hash_code(), _issue_otp(), LinkVerificationResult, _load_valid_otp(), normalize_email(), AsyncSession, MergePreference (+23 more)

### Community 28 - "Community 28"
Cohesion: 0.08
Nodes (34): actorSchema, AdminAuditActor, AdminAuditDownload, AdminAuditEntry, AdminAuditExportFormat, AdminAuditFilters, AdminAuditResponse, AdminAuditResult (+26 more)

### Community 29 - "Community 29"
Cohesion: 0.16
Nodes (38): is_accessible_to_user(), Allow the public current version or the immutable version already in use., add_workout_set(), _advance_program_cursor_for_completed_workout(), build_plan_from_program_day(), build_program_plan_for_user(), _create_set_slots(), create_workout() (+30 more)

### Community 30 - "Community 30"
Cohesion: 0.14
Nodes (36): add_log(), create_product(), daily(), delete_log(), energy_targets(), list_categories(), lookup_barcode(), nutrition_range() (+28 more)

### Community 31 - "Community 31"
Cohesion: 0.20
Nodes (36): parse_hhmm(), active_program_snapshot(), cancel_workout_occurrence(), _cancellation_for_day(), effective_workout_context(), _fallback_title(), get_schedule_overview(), local_schedule_day() (+28 more)

### Community 32 - "Community 32"
Cohesion: 0.10
Nodes (34): create_reminder(), Send or enqueue a Telegram reminder for a user's workout., send_workout_reminder(), Any, AsyncSession, Standards-based browser Web Push delivery., send_user_web_push(), _claim_dispatch_minute() (+26 more)

### Community 33 - "Community 33"
Cohesion: 0.07
Nodes (26): AIAnalyzeResult, AIChatResult, AIHistoryResult, analyzeProgress(), analyzeSchema, chatSchema, fetchAIHistory(), historySchema (+18 more)

### Community 34 - "Community 34"
Cohesion: 0.19
Nodes (35): health(), Liveness probe used by CI and local checks., AdminBroadcastCounts, add_event(), AuditContext, Stage one immutable event in the caller's current transaction., _audit_snapshot(), cancel_scheduled() (+27 more)

### Community 35 - "Community 35"
Cohesion: 0.12
Nodes (26): get_daily_metrics(), get_metric_range(), put_daily_metrics(), AsyncSession, date, put, User, Manual daily sleep and movement API. (+18 more)

### Community 36 - "Community 36"
Cohesion: 0.10
Nodes (32): mark_occurrence_started(), Any, date, mark_skipped_and_shift(), AsyncSession, date, User, UUID (+24 more)

### Community 37 - "Community 37"
Cohesion: 0.09
Nodes (32): _build_data_check_string(), decode_access_token(), get_token_subject(), InitDataError, Any, ValueError, Telegram initData validation (HMAC-SHA256) and JWT helpers. TZ §8: validate…, Decode and verify JWT. Raises JWTError on failure. (+24 more)

### Community 38 - "Community 38"
Cohesion: 0.08
Nodes (23): ActiveWorkout, AdminSupportPage, DailyLog, HelpPage, HomePage, KnowledgeBasePage, ProfilePage, ProgramsPage (+15 more)

### Community 39 - "Community 39"
Cohesion: 0.16
Nodes (31): AIQueryDomain, AnalysisEvidence, build_analysis_evidence(), classify_ai_query(), extract_period_days(), _fmt(), _measurement_evidence(), missing_data_question() (+23 more)

### Community 40 - "Community 40"
Cohesion: 0.10
Nodes (26): Parse comma-separated CORS origins., Runtime configuration for the FastAPI backend., Settings, Authorize the hidden command using Telegram's signed webhook identity., _telegram_actor_is_admin(), _verify_secret(), _build_otp_message(), _build_service_message() (+18 more)

### Community 41 - "Community 41"
Cohesion: 0.13
Nodes (32): apply_state_updates(), due_notifications(), format_calorie_reminder_text(), _in_window(), is_workout_day(), local_now(), _normalize_days_mode(), normalize_supplement_schedule() (+24 more)

### Community 42 - "Community 42"
Cohesion: 0.14
Nodes (32): AdminNotificationCategory, AdminUserNextWorkout, AdminUserProgramSummary, AdminUserQuestionnaire, AdminUserRecordCounts, AdminUserSafeEvent, AdminUserWorkoutSummary, AdminWebPushSummary (+24 more)

### Community 43 - "Community 43"
Cohesion: 0.17
Nodes (31): _resolve_tz(), claim_notified(), _day_bounds(), day_items(), due_groups(), ensure_day(), intake_group(), local_day_for_user() (+23 more)

### Community 44 - "Community 44"
Cohesion: 0.12
Nodes (26): get_me(), AsyncSession, put, User, User profile routes — GET/PUT /users/me (API contract)., update_me(), Any, BaseModel (+18 more)

### Community 45 - "Community 45"
Cohesion: 0.10
Nodes (25): AdminSystemCheck, AdminSystemFact, AdminSystemStatusResponse, AdminSystemPage, MorePage, AdminSupportPage(), changeStatus(), open() (+17 more)

### Community 46 - "Community 46"
Cohesion: 0.11
Nodes (24): archive_stale_logs(), _date_from_log_name(), _EncodingSafeStream, InterceptHandler, date, Path, Structured logging via loguru (TZ section 12). Layout (project root): logs/…, Configure loguru: stdout + daily file sink + archive of previous days. - One… (+16 more)

### Community 47 - "Community 47"
Cohesion: 0.15
Nodes (29): auth_email_link_request_code(), auth_email_link_verify(), auth_email_request_code(), auth_email_verify(), auth_telegram(), AsyncSession, post, Request (+21 more)

### Community 48 - "Community 48"
Cohesion: 0.15
Nodes (29): user_change_snapshot(), _anthro_name(), _clear_measurements(), clear_user_data(), _delete_nutrition_rows(), delete_user(), _delete_user_owned_rows(), _delete_workout_rows() (+21 more)

### Community 49 - "Community 49"
Cohesion: 0.12
Nodes (27): actionSchema, AdminActionResult, adminApiError(), AdminResetScope, AdminUser, adminUserSchema, clearAdminUser(), deleteAdminUser() (+19 more)

### Community 50 - "Community 50"
Cohesion: 0.10
Nodes (15): Background tasks (Arq)., FakeDispatchRedis, FakeNotificationSession, FakePagedSession, FakeRedisLock, FakeScalarResult, asyncio, Regression tests for timer locking and paged notification dispatch. (+7 more)

### Community 51 - "Community 51"
Cohesion: 0.14
Nodes (20): apply_replacements(), apply_saved_override(), _find_override(), Any, AsyncSession, date, UUID, WorkoutPlanOverride (+12 more)

### Community 52 - "Community 52"
Cohesion: 0.15
Nodes (26): ai_analyze(), ai_chat(), ai_history(), AsyncSession, date, post, User, AI trainer routes backed by the unlimited local inference service. (+18 more)

### Community 53 - "Community 53"
Cohesion: 0.22
Nodes (27): create_program(), delete_program(), get_program(), list_programs(), preview_program(), _publication_error(), publish_program(), AsyncSession (+19 more)

### Community 54 - "Community 54"
Cohesion: 0.17
Nodes (28): AdminSupportTicketSummary, SupportTicketSummary, add_admin_reply(), add_user_message(), close_user_ticket(), create_ticket(), _ensure_rate_limit(), get_admin_ticket() (+20 more)

### Community 55 - "Community 55"
Cohesion: 0.11
Nodes (15): exercise(), ListSession, MutationSession, program(), asyncio, Regression tests for safe program drafts and publication visibility., Scalars, test_editing_published_program_creates_draft_without_mutating_source() (+7 more)

### Community 56 - "Community 56"
Cohesion: 0.12
Nodes (26): format_rag_block(), _bounded_context(), _build_chat_prompt(), _call_configured_ai(), chat(), _looks_like_context_echo(), _normalized_words(), AsyncSession (+18 more)

### Community 57 - "Community 57"
Cohesion: 0.16
Nodes (25): admin_user_activity(), admin_user_communications(), admin_user_export_download(), admin_user_message(), admin_user_notifications(), admin_user_resend_guide(), admin_user_summary(), AdminUserActivity (+17 more)

### Community 59 - "Community 59"
Cohesion: 0.12
Nodes (23): AdminSystemHistoryItem, AdminSystemHistoryResponse, AdminSystemHistorySnapshot, AdminSystemStatus, checkAdminSystemStatus(), checkSchema, factSchema, fetchAdminSystemHistory() (+15 more)

### Community 60 - "Community 60"
Cohesion: 0.15
Nodes (23): DailyMetric, DailyMetricRange, dailyMetricRangeSchema, dailyMetricSchema, fetchDailyMetrics(), fetchDailyMetricsRange(), saveDailyMetrics(), fetchWaterLog() (+15 more)

### Community 61 - "Community 61"
Cohesion: 0.14
Nodes (24): create_product(), fetch_openfoodfacts(), get_product_by_barcode(), is_valid_barcode(), list_categories(), lookup_barcode(), normalize_barcode(), normalize_product_name() (+16 more)

### Community 62 - "Community 62"
Cohesion: 0.17
Nodes (22): hasSession(), loginWithTelegram(), Shell(), bootstrapAuth(), EdgeSwipe, isExitEdgeSwipe(), useTelegramExitGesture(), applyTelegramTheme() (+14 more)

### Community 63 - "Community 63"
Cohesion: 0.13
Nodes (22): OnboardingPage, DAYS_PER_WEEK, defaultAdjPct(), EQUIPMENT, GOALS, JOINT_LIMITS, LEVELS, LOCATIONS (+14 more)

### Community 64 - "Community 64"
Cohesion: 0.14
Nodes (23): _active_program(), build_application_context(), conversation_history(), _format_workout(), _list_text(), _number(), _plan_exercises(), _profile_context() (+15 more)

### Community 65 - "Community 65"
Cohesion: 0.08
Nodes (25): autoprefixer, chrome-launcher, eslint-plugin-react-hooks, eslint-plugin-react-refresh, devDependencies, autoprefixer, chrome-launcher, eslint-plugin-react-hooks (+17 more)

### Community 66 - "Community 66"
Cohesion: 0.08
Nodes (25): axios, dexie, dependencies, axios, dexie, react, react-dom, react-router-dom (+17 more)

### Community 67 - "Community 67"
Cohesion: 0.19
Nodes (23): change_status(), _detail(), get_ticket(), list_tickets(), _not_found(), AsyncSession, Exception, patch (+15 more)

### Community 68 - "Community 68"
Cohesion: 0.16
Nodes (23): age_from_birth_date(), compute_energy_targets(), is_female_sex(), macro_split_grams(), mifflin_st_jeor_bmr(), Any, date, Daily energy targets from anthropometry + goals (Mifflin–St Jeor). (+15 more)

### Community 69 - "Community 69"
Cohesion: 0.13
Nodes (21): BodyMeasurementAnalytics, BodyMeasurementAnalyticsItem, bodyMeasurementAnalyticsItemSchema, bodyMeasurementAnalyticsSchema, BodyMeasurementPeriod, bodyMeasurementRangeSchema, bodyMeasurementSchema, deleteBodyMeasurement() (+13 more)

### Community 70 - "Community 70"
Cohesion: 0.14
Nodes (22): Push a short Telegram message when in-app rest/hold timer finishes., timer_ended_notify(), Send one broadcast-formatted message without resolving a mass audience., send_broadcast_test_message(), Send HTML notification with Mini App Open button (web_app preferred)., send_app_notification(), fetch_recipients(), main() (+14 more)

### Community 71 - "Community 71"
Cohesion: 0.22
Nodes (22): _choose(), _counts(), merge_accounts(), _merge_body_measurements(), _merge_daily_metrics(), merge_preview(), _merge_supplements(), merge_values() (+14 more)

### Community 72 - "Community 72"
Cohesion: 0.12
Nodes (15): FakeRedis, FakeSession, asyncio, Exception, parametrize, Admin system dashboard states and access control., test_database_probe_has_independent_normal_and_error_states(), test_failed_backup_status_is_reported_without_host_details() (+7 more)

### Community 73 - "Community 73"
Cohesion: 0.08
Nodes (23): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+15 more)

### Community 74 - "Community 74"
Cohesion: 0.18
Nodes (20): NutritionLogCreate, NutritionLogUpdate, Partial update for an existing diary entry (grams / meal / optional KBJU…, add_log(), calc_kbju(), daily_summary(), delete_log(), get_user_log() (+12 more)

### Community 75 - "Community 75"
Cohesion: 0.16
Nodes (21): PlannedWorkoutPlanRequest, PlannedWorkoutReplacement, BaseModel, Workout and set request/response schemas., Editable summary fields for an existing workout., WorkoutCreate, WorkoutHistoryResponse, WorkoutPlan (+13 more)

### Community 76 - "Community 76"
Cohesion: 0.14
Nodes (22): bot_commands_reply_keyboard(), local_ai_restored_announcement_text(), open_app_markup(), HTTPS URL of the Mini App front (Menu Button / web_app)., One-time notice after moving AI and label OCR onto the production VPS., Inline Open button for Mini App (web_app preferred)., Persistent reply keyboard under the message field. Buttons send plain text…, Send full user guide as a downloadable Markdown file. (+14 more)

### Community 77 - "Community 77"
Cohesion: 0.18
Nodes (20): requestEmailLinkCode(), requestEmailLoginCode(), verifyEmailLinkCode(), EmailLoginForm(), onRequestCode(), persistCodeStep(), Props, LinkEmailCard() (+12 more)

### Community 78 - "Community 78"
Cohesion: 0.16
Nodes (19): BodyMeasurementField, fetchBodyMeasurement(), fetchBodyMeasurementRange(), saveBodyMeasurement(), MeasurementsPage, deltaText(), displayDate(), MeasurementsPage() (+11 more)

### Community 79 - "Community 79"
Cohesion: 0.16
Nodes (20): createNutritionProduct(), fetchProductCategories(), lookupBarcode(), previewKbju(), searchProducts(), CATEGORY_LABELS, categoryLabel(), DailyLog() (+12 more)

### Community 80 - "Community 80"
Cohesion: 0.15
Nodes (17): App(), descriptions, ThemeSelector(), initSentry(), rootElement, applyThemePreference(), initializeTheme(), isThemePreference() (+9 more)

### Community 81 - "Community 81"
Cohesion: 0.22
Nodes (21): Get-FitnessPortPids(), Get-FitnessStatus(), Invoke-FitnessMigrate(), Invoke-FitnessSeed(), Invoke-FitnessTest(), Restart-Backend(), Restart-FitnessStack(), Restart-Frontend() (+13 more)

### Community 82 - "Community 82"
Cohesion: 0.22
Nodes (19): delete_daily_measurement(), get_daily_measurement(), get_measurement_analytics(), get_measurement_range(), put_daily_measurement(), AsyncSession, date, delete (+11 more)

### Community 83 - "Community 83"
Cohesion: 0.18
Nodes (22): add_message(), close_ticket(), create_ticket(), _detail(), download_attachment(), get_ticket(), list_tickets(), AsyncSession (+14 more)

### Community 84 - "Community 84"
Cohesion: 0.19
Nodes (21): apply_db(), archive_old_gifs(), build_seed_rows(), description_from_ds(), download_gif(), ensure_programs_from_builder(), equipment_ru(), gif_filename() (+13 more)

### Community 85 - "Community 85"
Cohesion: 0.14
Nodes (17): AuthResponse, authResponseSchema, AuthUser, authUserSchema, EmailLinkResult, emailLinkResultSchema, EmailOtpRequestResult, emailOtpRequestSchema (+9 more)

### Community 86 - "Community 86"
Cohesion: 0.15
Nodes (18): SupportTicketCreate, attach_to_latest_user_message(), detect_screenshot_mime(), get_attachment(), AsyncSession, UUID, ValueError, Validated, access-controlled screenshot storage for support threads. (+10 more)

### Community 87 - "Community 87"
Cohesion: 0.17
Nodes (10): FakeSession, asyncio, test_body_measurement_schema_bounds(), test_delete_measurement_soft_deletes_and_removes_stale_weight(), test_measurement_analytics_does_not_call_weight_loss_a_success_without_target(), test_measurement_analytics_uses_field_baselines_and_explicit_weight_goal(), test_profile_uses_latest_weight_even_when_latest_measurement_has_only_circumferences(), test_save_body_measurement_updates_profile_snapshot() (+2 more)

### Community 88 - "Community 88"
Cohesion: 0.14
Nodes (8): Ensure-Chocolatey(), Fail(), Get-EnvMap(), Get-InstallerEnvMap(), Info(), Invoke-Native(), Invoke-Step(), Refresh-ProcessPath()

### Community 89 - "Community 89"
Cohesion: 0.19
Nodes (18): admin_clear_user_data(), admin_delete_user(), admin_list_users(), admin_reset_user(), AsyncSession, delete, post, User (+10 more)

### Community 90 - "Community 90"
Cohesion: 0.18
Nodes (17): BarcodeDetectorCtor, BarcodeDetectorLike, BarcodeScannerModal(), emitCode(), start(), startNative(), startZxing(), createZxingReader() (+9 more)

### Community 91 - "Community 91"
Cohesion: 0.18
Nodes (15): ./feature-${version}.js, contentTypes, assertInside(), criticalFiles, fileHash(), frontendDir, isVersionedAsset(), main() (+7 more)

### Community 92 - "Community 92"
Cohesion: 0.18
Nodes (15): ExerciseProgressChart(), LineChart(), Metric, Period, Phase, PHASES, shortDate(), buildExerciseDiary() (+7 more)

### Community 93 - "Community 93"
Cohesion: 0.14
Nodes (13): System prompts for AI trainer (TZ §6)., _has_urgent_health_marker(), _requires_rule_only(), _rule_based_reply(), parametrize, test_basic_safety_facts_use_deterministic_reply(), test_mixed_foreign_model_reply_is_rejected(), test_non_urgent_pain_question_uses_safe_rule_reply() (+5 more)

### Community 94 - "Community 94"
Cohesion: 0.12
Nodes (15): BarcodeLookup, barcodeLookupSchema, dailySchema, EnergyTargets, fetchNutritionRange(), logSchema, NutritionLabelRecognition, nutritionLabelRecognitionSchema (+7 more)

### Community 95 - "Community 95"
Cohesion: 0.20
Nodes (16): DailyNutrition, fetchDailyNutrition(), NutritionLog, NutritionProduct, copyYesterday(), isFavoriteProduct(), loadFavoriteProducts(), loadRecentProducts() (+8 more)

### Community 96 - "Community 96"
Cohesion: 0.36
Nodes (15): BodyMeasurementAnalyticsItem, build_analytics(), delete_for_day(), get_analytics(), get_for_day(), _interpret_change(), list_range(), _period_start() (+7 more)

### Community 97 - "Community 97"
Cohesion: 0.17
Nodes (15): mark_seed_program_published(), Any, Stable non-identifying key for versioned programs maintained in seed., Trusted seed rows are published content, unlike admin-created drafts., seed_program_key(), seed_program_payload(), main(), _load_exercise_renames() (+7 more)

### Community 98 - "Community 98"
Cohesion: 0.21
Nodes (11): BadgesPanel(), Charts(), ChartsProps, NutritionRangeMode, ProgressPage(), Badge, computeBadges(), buildCalendarDays() (+3 more)

### Community 99 - "Community 99"
Cohesion: 0.27
Nodes (13): exercise_query_terms(), _exercise_score(), _normalize(), AsyncSession, Lightweight deterministic retrieval over the local exercise catalog., Return top exercise snippets for LLM / rule context., retrieve_exercise_context(), _stem() (+5 more)

### Community 100 - "Community 100"
Cohesion: 0.21
Nodes (13): create_draft_version(), _integer(), is_public_catalog_program(), ProgramPublicationError, publish(), AsyncSession, ValueError, Validation and immutable publication lifecycle for training programs. (+5 more)

### Community 101 - "Community 101"
Cohesion: 0.29
Nodes (12): Props, WeeklyOverview(), DAY_TERMS, daysCount(), EXERCISE_TAG_LABELS, exercisesCount(), LABELS, pluralRu() (+4 more)

### Community 102 - "Community 102"
Cohesion: 0.18
Nodes (12): AnalyticsEventName, AnalyticsPayload, getAnalyticsBuffer(), pushLocal(), IMPORTANT: never call Telegram.WebApp.sendData from here., asEvents(), BufferedEvent, dayKey() (+4 more)

### Community 103 - "Community 103"
Cohesion: 0.25
Nodes (12): _is_spa_navigation(), Path, Request, Serve the built single-page application from the API process., Register production frontend files when a Vite build is available., register_frontend(), _safe_frontend_file(), Tests for the single-origin local production frontend. (+4 more)

### Community 104 - "Community 104"
Cohesion: 0.31
Nodes (12): WorkoutCompleteRequest, complete_workout(), four_day_program(), NoCommitSession, asyncio, parametrize, Offline retries must converge on one server-side workout state., test_complete_workout_returns_existing_completed_snapshot() (+4 more)

### Community 105 - "Community 105"
Cohesion: 0.24
Nodes (13): _days_count(), program_snapshot(), Return safe program metadata without descriptions or workout contents., _short_text(), create_program(), get_program(), get_program_for_admin(), list_programs() (+5 more)

### Community 106 - "Community 106"
Cohesion: 0.31
Nodes (11): Make a deleted program workout the next workout again. Deletion means that the…, _rollback_program_cursor_for_deleted_workout(), ppl6_program(), ProgramSession, asyncio, Deleting a program workout must restore that exact day in the cycle., Out-of-order client updates and later rows must not suppress deletion rollback., test_deleting_pull_b_restores_pull_b_instead_of_legs_b() (+3 more)

### Community 107 - "Community 107"
Cohesion: 0.22
Nodes (11): avgRpe(), buildWeeklyWorkoutOverview(), countCompletedSets(), formatWeekDelta(), inRange(), mondayOf(), shortRu(), WD_SHORT (+3 more)

### Community 108 - "Community 108"
Cohesion: 0.26
Nodes (11): Ensure-LocalStack(), Ensure-Tailscale(), Get-PublicUrl(), Invoke-RequestedApiRestart(), Invoke-RequestedWorkerRestart(), Read-DotEnvValue(), Start-HiddenPowerShell(), Test-Http() (+3 more)

### Community 109 - "Community 109"
Cohesion: 0.36
Nodes (12): _mapping(), Any, AsyncSession, UUID, Audited administrator actions from the user detail card., _record_delivery_action(), resend_guide(), send_service_message() (+4 more)

### Community 110 - "Community 110"
Cohesion: 0.28
Nodes (8): StrengthTrends(), bestSetInWorkout(), buildLiftTrends(), compoundBoost(), estimate1rm(), formatDelta(), LiftPoint, LiftTrend

### Community 111 - "Community 111"
Cohesion: 0.32
Nodes (10): buildNutritionBalance(), computeDailyVolume(), computeWorkoutVolume(), groupNutritionByWeek(), localDateKey(), mondayOf(), shortRuDate(), summarizeNutritionPeriods() (+2 more)

### Community 112 - "Community 112"
Cohesion: 0.24
Nodes (10): health(), _parse_tesseract_tsv(), _prepare_image(), post, Request, Internal-only Tesseract OCR microservice for nutrition labels., Reassemble words by block/paragraph/line, not by word number., recognize() (+2 more)

### Community 113 - "Community 113"
Cohesion: 0.27
Nodes (11): ExerciseImportPreviewRow, apply_import(), ExerciseImportError, import_fingerprint(), preview_import(), AsyncSession, RuntimeError, Validated and atomic JSON imports for the administrator exercise catalog. (+3 more)

### Community 114 - "Community 114"
Cohesion: 0.23
Nodes (11): average(), buildPeriod(), localIso(), MetricChart(), MetricConfig, MetricId, METRICS, Period (+3 more)

### Community 115 - "Community 115"
Cohesion: 0.17
Nodes (11): compilerOptions, lib, module, moduleResolution, noEmit, skipLibCheck, strict, target (+3 more)

### Community 116 - "Community 116"
Cohesion: 0.21
Nodes (5): Get-EnvVal(), Get-ListenPids(), Read-DotEnv(), Stop-Port(), Warn()

### Community 117 - "Community 117"
Cohesion: 0.33
Nodes (10): AdminBroadcastDelivery, _claim_batch(), classify_telegram_error(), deliver_batch(), _finish_or_continue(), Any, UUID, Rate-limited, restart-safe delivery batches for administrator broadcasts. (+2 more)

### Community 118 - "Community 118"
Cohesion: 0.25
Nodes (11): http_exception_handler(), Exception, Request, request_id_middleware(), unhandled_exception_handler(), validation_exception_handler(), exception_handler, JSONResponse (+3 more)

### Community 119 - "Community 119"
Cohesion: 0.22
Nodes (7): AddCommitSession, asyncio, ScalarAddCommitSession, test_regular_user_cannot_open_user_card(), test_service_email_requires_and_records_user_consent(), test_service_message_is_escaped_and_never_written_to_audit(), test_service_web_push_requires_consent_and_active_subscription()

### Community 120 - "Community 120"
Cohesion: 0.18
Nodes (10): adminJs, adminJsGzip, assetsDir, buildDir, failures, js, largestJsGzip, limits (+2 more)

### Community 121 - "Community 121"
Cohesion: 0.33
Nodes (9): AsyncClient, api_flow(), api_health(), db_check(), main(), make_init(), parse_args(), Namespace (+1 more)

### Community 122 - "Community 122"
Cohesion: 0.36
Nodes (8): audit(), load_json(), main(), Path, Deterministic audit of the exercise catalog, manifest and local GIF files., write_report(), test_every_seed_exercise_has_audited_media_status(), test_plank_has_verified_gif_and_side_plank_is_not_substituted()

### Community 124 - "Community 124"
Cohesion: 0.20
Nodes (10): scripts, audit:lighthouse, build, build:publish, check:bundle, dev, lint, preview (+2 more)

### Community 125 - "Community 125"
Cohesion: 0.39
Nodes (8): audience_count(), audience_recipients(), audience_statement(), AdminBroadcastAudience, AsyncSession, datetime, Allowlisted audience filters for administrator broadcasts., Build the only supported recipient query; raw SQL/admin expressions are…

### Community 126 - "Community 126"
Cohesion: 0.39
Nodes (8): _active_rows(), export_row(), prepare_user_export(), Any, AsyncSession, UUID, Allowlisted user data export for administrator-assisted requests., Serialize only mapped columns from an explicitly selected safe model.

### Community 127 - "Community 127"
Cohesion: 0.33
Nodes (6): _load_script(), Tests for the managed Timeweb App Platform deployment helpers., test_timeweb_environment_accepts_managed_public_services(), test_timeweb_environment_rejects_local_or_unprotected_services(), test_timeweb_environment_requires_postgres_tls(), test_timeweb_migration_environment_does_not_put_password_in_command()

### Community 128 - "Community 128"
Cohesion: 0.25
Nodes (4): isHhMm(), Props, SPECIAL, TimeSlotsEditor()

### Community 131 - "Community 131"
Cohesion: 0.39
Nodes (7): Response, Smoke tests for app wiring., request(), test_auth_telegram_rejects_empty_body(), test_auth_telegram_rejects_invalid_init_data(), test_health(), test_notification_dispatch_all_requires_authentication()

### Community 133 - "Community 133"
Cohesion: 0.36
Nodes (7): fmtDelta(), fmtKcal(), NutritionBalanceChart(), PeriodCard(), Props, NutritionBalanceDay, NutritionPeriodTotals

### Community 135 - "Community 135"
Cohesion: 0.38
Nodes (6): main(), ordered_migrations(), postgres_environment(), Path, Apply append-only SQL migrations in Timeweb without exposing DB credentials., Convert the SQLAlchemy URL to libpq variables without logging a password.

### Community 136 - "Community 136"
Cohesion: 0.48
Nodes (6): apply(), load_from_checklist(), load_from_seed(), main(), media_source_for(), Apply video_url (+ media_source) from seed JSON into DB without wiping GIFs.…

### Community 138 - "Community 138"
Cohesion: 0.29
Nodes (5): apiAddress, apiServer, child, cli, root

### Community 139 - "Community 139"
Cohesion: 0.29
Nodes (7): addNutritionLog(), deleteNutritionLog(), updateNutritionLog(), removeLog(), saveEditLog(), submit(), toast()

### Community 140 - "Community 140"
Cohesion: 0.38
Nodes (5): ToastHost(), ToastItem, ToastKind, ToastState, useToastStore

### Community 141 - "Community 141"
Cohesion: 0.38
Nodes (6): Calendar(), CalendarProps, statusClass(), WEEKDAYS, CalendarDay, monthLabel()

### Community 142 - "Community 142"
Cohesion: 0.47
Nodes (4): main(), patch_seed(), Add missing replacement exercises to seed_content/exercises.json and seed DB., seed_db()

### Community 143 - "Community 143"
Cohesion: 0.33
Nodes (4): outputDir, report, root, routes

### Community 144 - "Community 144"
Cohesion: 0.47
Nodes (5): cameraStream(), frameToFile(), NutritionLabelCameraModal(), takePhoto(), Props

### Community 145 - "Community 145"
Cohesion: 0.53
Nodes (4): ALLOWED_TYPES, canvasBlob(), loadImage(), prepareNutritionLabelImage()

### Community 148 - "Community 148"
Cohesion: 0.50
Nodes (4): main(), Run the API and ARQ worker as one Timeweb App Platform container., _terminate(), Popen

### Community 149 - "Community 149"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 150 - "Community 150"
Cohesion: 0.40
Nodes (3): BottomNavigation(), items, NavIconName

### Community 152 - "Community 152"
Cohesion: 0.70
Nodes (4): column_exists(), is_applied(), record_applied(), apply_migrations_vps.sh script

### Community 153 - "Community 153"
Cohesion: 0.70
Nodes (4): compose(), on_exit(), backup_vps.sh script, write_backup_status()

### Community 155 - "Community 155"
Cohesion: 0.67
Nodes (3): enqueue_support_reply(), UUID, ARQ enqueue helper for support reply notifications.

### Community 156 - "Community 156"
Cohesion: 0.67
Nodes (3): day(), main(), Generate exercises.json (100) and programs.json (8) for P0 seed.

### Community 157 - "Community 157"
Cohesion: 0.67
Nodes (3): main(), Fail fast on unsafe or incomplete Timeweb production settings., validation_errors()

### Community 158 - "Community 158"
Cohesion: 0.50
Nodes (3): adminProfile, systemHistory, systemStatus

### Community 159 - "Community 159"
Cohesion: 0.50
Nodes (3): adminProfile, summary, userMessage

### Community 160 - "Community 160"
Cohesion: 0.50
Nodes (3): apiPrefixes, navigationStrategy, offlineNavigationFallback

### Community 161 - "Community 161"
Cohesion: 0.50
Nodes (3): ImportMeta, ImportMetaEnv, Window

## Knowledge Gaps
- **445 isolated node(s):** `fitness-backend`, `start.sh script`, `40-publish-release.sh script`, `publicRoutes`, `adminProfile` (+440 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **43 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Exercise` connect `Community 0` to `Community 2`, `Community 98`, `Community 4`, `Community 7`, `Community 8`, `Community 10`, `Community 11`, `Community 110`, `Community 16`, `Community 18`, `Community 51`?**
  _High betweenness centrality (0.111) - this node is a cross-community bridge._
- **Why does `create_exercise()` connect `Community 8` to `Community 0`, `Community 34`, `Community 12`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Why does `Settings` connect `Community 40` to `Community 3`, `Community 5`, `Community 8`, `Community 9`, `Community 12`, `Community 13`, `Community 15`, `Community 21`, `Community 24`, `Community 26`, `Community 27`, `Community 155`, `Community 30`, `Community 32`, `Community 34`, `Community 37`, `Community 39`, `Community 47`, `Community 48`, `Community 50`, `Community 52`, `Community 56`, `Community 57`, `Community 67`, `Community 70`, `Community 72`, `Community 76`, `Community 83`, `Community 86`, `Community 89`, `Community 109`, `Community 119`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **Are the 142 inferred relationships involving `Settings` (e.g. with `create_access_token()` and `decode_access_token()`) actually correct?**
  _`Settings` has 142 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `build_all()` (e.g. with `shoulder_home_female()` and `shoulder_home_male()`) actually correct?**
  _`build_all()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `fitness-backend`, `start.sh script`, `40-publish-release.sh script` to the rest of the system?**
  _445 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.048484848484848485 - nodes in this community are weakly interconnected._