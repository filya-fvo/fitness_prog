export type Exercise = {
  id: string;
  name_ru: string;
  muscle_group: string;
  equipment: string | null;
  description: string | null;
  technique: string | null;
  common_mistakes: string | null;
  difficulty: number;
  video_url: string | null;
  animation_url: string | null;
  thumbnail_url: string | null;
  media_duration_sec: number | null;
  media_source: "youtube" | "external" | "none" | string;
  tags: string[];
};

export type WorkoutSet = {
  id: string;
  workout_id: string;
  exercise_id: string;
  set_number: number;
  reps: number | null;
  weight: number | null;
  is_completed: boolean;
  rest_time_sec: number | null;
};

export type WorkoutPlanExercise = {
  exercise_id: string;
  order: number;
  target_sets: number;
  target_reps?: string | null;
  rest_sec?: number | null;
  name_ru?: string | null;
};

export type WorkoutPlan = {
  title?: string | null;
  workout_type?: string | null;
  day_index?: number | null;
  exercises: WorkoutPlanExercise[];
};

export type Workout = {
  id: string;
  user_id: string;
  program_id: string | null;
  scheduled_date: string;
  status: "planned" | "completed" | "skipped" | string;
  ai_notes: string | null;
  rpe: number | null;
  started_at: string | null;
  completed_at: string | null;
  title?: string | null;
  workout_type?: string | null;
  plan?: WorkoutPlan | Record<string, unknown> | null;
  duration_sec?: number | null;
  sets: WorkoutSet[];
};

export type LocalSetDraft = {
  exerciseId: string;
  setNumber: number;
  reps: string;
  weight: string;
  isCompleted: boolean;
  restTimeSec: number;
};

export type Program = {
  id: string;
  name: string;
  description: string | null;
  target_level: string | null;
  duration_weeks: number | null;
  structure: Record<string, unknown>;
  workout_type: string;
  level: string | null;
  is_template: boolean;
};
