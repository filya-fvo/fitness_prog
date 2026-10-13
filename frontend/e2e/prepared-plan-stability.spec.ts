import { expect, test } from "@playwright/test";
import { acceptedLegalStatus } from "./legal-fixture";
const owner="73737373-7373-4373-8373-737373737373", programId="74747474-7474-4474-8474-747474747474", exerciseId="75757575-7575-4575-8575-757575757575";
const day="2026-10-13";
const program={id:programId,name:"Локальная программа",is_template:true,publication_status:"published",is_current:true,version:1,workout_type:"strength",structure:{schedule:[{day_index:1,name:"Жим",exercises:[{exercise_id:exerciseId,name_ru:"Жим лёжа",sets:3,reps:"10"}]}]}};
const profile={id:owner,username:"local-plan-qa",telegram_id:null,anthropometry:{},goals:{onboarding_completed:true,active_program_id:programId,active_program_next_day:1,active_program_week_phase:"medium",active_program_phase_source:"manual"},subscription_status:"free",onboarding_completed:true,stars_balance:0,legal_status:acceptedLegalStatus(owner)};
const schedule={requested_date:day,current:{original_date:day,target_date:day,start_time:"06:00:00",title:"Жим",program_id:programId,day_index:1,status:"scheduled",is_override:false,can_reschedule:false},next:null};
const plan={title:"Жим",day_index:1,week_phase:"medium",exercises:[{exercise_id:exerciseId,name_ru:"Жим лёжа",order:1,target_sets:3,target_reps:"10",rest_sec:60}]};
const bundle={version:1,owner,schedule_fingerprint:"0".repeat(64),prepared_at:"2026-10-13T08:00:00Z",start:day,end:day,program,days:[{requested_date:day,schedule}],plans:[{scheduled_date:day,day_index:1,week_phase:"medium",readiness:"normal",plan}]};

test("background status reads keep the expanded home plan open",async({page})=>{
 await page.clock.setFixedTime(new Date("2026-10-13T12:00:00+03:00"));
 await page.addInitScript(profile=>{localStorage.setItem("fitness_jwt","synthetic-plan-token");localStorage.setItem("fitness_cached_user_v1",JSON.stringify(profile));},profile);
 await page.route("**/*",async route=>{
  const path=new URL(route.request().url()).pathname;
  let data:unknown;
  if(path==="/users/me")data=profile;
  else if(path==="/programs")data={items:[program],total:1};
  else if(path==="/programs/mine")data={items:[],total:0};
  else if(path==="/exercises")data={items:[],total:0,page:1,page_size:200};
  else if(path==="/workouts/schedule/overview")data=schedule;
  else if(path==="/workouts/planned-plan")data=plan;
  else if(path==="/workouts/offline-context")data=bundle;
  else if(path==="/workouts/load-hints")data={items:[]};
  else return route.fallback();
  await route.fulfill({json:data});
 });
 await page.goto("/");
 await page.evaluate(async ({owner,bundle,profile})=>{
  // @ts-expect-error Vite serves the real module in this browser test.
  const {saveOfflineWorkoutContext}=await import("/src/db/offlineWorkoutContext.ts");
  await saveOfflineWorkoutContext(owner,bundle,profile,[],[]);
 },{owner,bundle,profile});
 const toggle=page.getByRole("button",{name:/План (на сегодня|следующей тренировки)/});
 await expect(toggle).toBeVisible();
 await toggle.click();
 await expect(toggle).toHaveAttribute("aria-expanded","true");
 for(let index=0;index<3;index++){
  await page.evaluate(()=>window.dispatchEvent(new Event("fitness:native-change")));
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expect(toggle).toHaveAttribute("aria-expanded","true");
 }
});
