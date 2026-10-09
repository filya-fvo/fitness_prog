import { describe, expect, it } from "vitest";
import { overlayOfflineProgramProgress } from "./offlineProgramProgress";
import type { Program, Workout } from "@/types/workout";
const program: Program = { id:"p",name:"План",description:null,target_level:null,duration_weeks:8,structure:{days:[{day:1},{day:2}]},workout_type:"strength",level:null,is_template:true };
const goals={active_program_id:"p",active_program_next_day:1,active_program_week_phase:"medium",active_program_phase_source:"manual"};
const workout=(id:string,date:string,index:number,base="medium",phase=base):Workout=>({id,user_id:"owner",program_id:"p",scheduled_date:date,status:"completed",completed_at:date+"T12:00:00Z",started_at:date+"T11:00:00Z",plan:{day_index:index,base_week_phase:base,week_phase:phase,exercises:[]},sets:[],title:null,workout_type:null,rpe:null,ai_notes:null,duration_sec:3600});
describe("local completion cursor overlay",()=>{
 it("advances two successive offline days once without sending a profile patch",()=>{
  const result=overlayOfflineProgramProgress(goals,program,[workout("a","2026-10-09",1),workout("b","2026-10-10",2)],"2026-10-09T08:00:00Z","2026-10-11","owner");
  expect(result.active_program_next_day).toBe(1);expect(result.active_program_week_phase).toBe("heavy");
  expect(goals.active_program_next_day).toBe(1);expect(goals.active_program_week_phase).toBe("medium");
 });
 it("repeats the base phase after a readiness reduction in the split",()=>{
  const result=overlayOfflineProgramProgress(goals,program,[workout("a","2026-10-09",1,"medium","light"),workout("b","2026-10-10",2)],"2026-10-09T08:00:00Z","2026-10-11","owner");
  expect(result.active_program_week_phase).toBe("medium");expect(result.active_program_repeat_phase).toBeUndefined();
 });
 it("ignores completed workouts already included in the server context, future dates and other owners/programs",()=>{
  const rows=[workout("a","2026-10-08",1),workout("b","2026-10-12",1),{...workout("c","2026-10-09",1),program_id:"other"}];
  expect(overlayOfflineProgramProgress(goals,program,rows,"2026-10-09T08:00:00Z","2026-10-11","owner")).toEqual(goals);
 });
 it("does not advance twice for a replayed completed day",()=>{
  const row=workout("a","2026-10-09",1);
  const result=overlayOfflineProgramProgress(goals,program,[row,row],"2026-10-09T08:00:00Z","2026-10-10","owner");
  expect(result.active_program_next_day).toBe(2);expect(result.active_program_workouts_in_phase).toBe(1);
 });
});
