import "fake-indexeddb/auto";
import { beforeEach, afterEach, expect, it } from "vitest";
import { db } from "@/db/schema";
import { useUserStore } from "@/store/userStore";
import type { Workout } from "@/types/workout";
import { cacheWorkoutHistory, installWorkoutHistoryProtection } from "./workoutHistoryCache";
const owner="00000000-0000-4000-8000-000000000001";
const workout=(id:string,date:string):Workout=>({id,user_id:owner,program_id:null,scheduled_date:date,status:"completed",sets:[],plan:{exercises:[]},title:id,workout_type:"custom",rpe:null,ai_notes:null,started_at:null,completed_at:date+"T08:00:00Z",duration_sec:0});
beforeEach(async()=>{await db.delete();await db.open();useUserStore.setState({user:{id:owner,subscription_status:"plus",onboarding_completed:true}});installWorkoutHistoryProtection(async()=>({pendingIds:[],deletedIds:[]}));});
afterEach(async()=>{await db.delete();useUserStore.setState({user:null});installWorkoutHistoryProtection(async()=>({pendingIds:[],deletedIds:[]}));});

it("reconciles complete windows while preserving outside history and unsent legacy edits after reopen",async()=>{
 await db.workouts.bulkPut([workout("deleted","2026-10-13"),workout("outside","2026-05-13"),workout("pending","2026-10-14")]);
 await db.syncQueue.put({id:"op",ownerUserId:owner,type:"add_set",clientWorkoutId:"pending",payload:{},createdAt:1,attempts:0,lastError:null});
 await cacheWorkoutHistory(owner,[],[{start:"2026-10-01",end:"2026-10-31"}]);
 db.close();await db.open();
 expect((await db.workouts.toArray()).map(row=>row.id).sort()).toEqual(["outside","pending"]);
});
it("never infers deletions from a partial page",async()=>{
 await db.workouts.put(workout("kept","2026-10-13"));
 await cacheWorkoutHistory(owner,[workout("new","2026-10-14")],[]);
 expect((await db.workouts.toArray()).map(row=>row.id).sort()).toEqual(["kept","new"]);
});
it("a native pending row beats stale server content",async()=>{
 await db.workouts.put({...workout("pending","2026-10-13"),ai_notes:"Локальная заметка"});
 installWorkoutHistoryProtection(async()=>({pendingIds:["pending"],deletedIds:[]}));
 await cacheWorkoutHistory(owner,[workout("pending","2026-10-13")],[{start:"2026-10-01",end:"2026-10-31"}]);
 expect((await db.workouts.get("pending"))?.ai_notes).toBe("Локальная заметка");
});
it("an unsent delete cannot be resurrected by server history",async()=>{
 await db.syncQueue.put({id:"op",ownerUserId:owner,type:"delete_workout",clientWorkoutId:"deleted",payload:{},createdAt:1,attempts:0,lastError:null});
 await cacheWorkoutHistory(owner,[workout("deleted","2026-10-13")],[{start:"2026-10-01",end:"2026-10-31"}]);
 expect(await db.workouts.count()).toBe(0);
});
it("rejects foreign rows and rolls back if the owner changes during protection read",async()=>{
 await db.workouts.put(workout("existing","2026-10-13"));
 await expect(cacheWorkoutHistory(owner,[{...workout("foreign","2026-10-13"),user_id:"other"}],[])).rejects.toThrow("другому аккаунту");
 installWorkoutHistoryProtection(async()=>{useUserStore.setState({user:null});return {pendingIds:[],deletedIds:[]};});
 await expect(cacheWorkoutHistory(owner,[],[{start:"2026-10-01",end:"2026-10-31"}])).rejects.toThrow("Аккаунт изменился");
 expect(await db.workouts.count()).toBe(1);
});
