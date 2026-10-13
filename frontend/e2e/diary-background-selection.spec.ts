import { expect, test, type Page } from "@playwright/test";
import { acceptedLegalStatus } from "./legal-fixture";
const owner="76767676-7676-4676-8676-767676767676";
async function setup(page:Page){
 let alive = true;
 const profile={id:owner,username:"selection-qa",telegram_id:null,auth_email:null,anthropometry:{},goals:{advanced_analytics_enabled:true},subscription_status:"plus",onboarding_completed:true,stars_balance:0,legal_status:acceptedLegalStatus(owner)};
 await page.clock.setFixedTime(new Date("2026-10-13T12:00:00+03:00"));
 await page.addInitScript(user=>{localStorage.setItem("fitness_jwt","synthetic-selection-token");localStorage.setItem("fitness_cached_user_v1",JSON.stringify(user));},profile);
 await page.route("**/users/me",route=>route.fulfill({json:profile}));
 let histories=0,dashboards=0;
 await page.route("**/workouts/history**",route=>{
  histories++;
  const query=new URL(route.request().url()).searchParams;
  const show=query.get("date_from")!<="2026-05-13"&&query.get("date_to")!>="2026-05-13";
  const workout={id:"77777777-7777-4777-8777-777777777777",user_id:owner,program_id:null,scheduled_date:"2026-05-13",status:"completed",title:"Майская тренировка",workout_type:"custom",plan:{exercises:[]},sets:[],rpe:null,ai_notes:null,started_at:null,completed_at:"2026-05-13T08:00:00Z",duration_sec:0};
  return route.fulfill({json:{items:show&&alive?[workout]:[],total:show&&alive?1:0}});
 });
 await page.route("**/workouts/dashboard**",route=>{
  dashboards++;
  const sum={completed_workouts:0,active_days:0,completed_sets:0,planned_sets:0,volume_kg:0,average_rpe:null,rpe_workouts:0};
  return route.fulfill({json:{period_start:"2026-09-16",period_end:"2026-10-13",period_days:Number(new URL(route.request().url()).searchParams.get("period_days")),previous_period_start:"2026-08-19",previous_period_end:"2026-09-15",current:sum,previous:sum,weeks:[],muscle_groups:[],lifetime_completed_workouts:1,lifetime_completed_sets:0}});
 });
 await page.goto("/progress");
 await expect(page.getByRole("heading",{name:"Календарь тренировок"})).toBeVisible();
 return {histories:()=>histories,dashboards:()=>dashboards,removeRemote:()=>{alive=false;}};
}
async function refresh(page:Page){
 await page.evaluate(owner=>window.dispatchEvent(new CustomEvent("fitness:read-cache-updated",{detail:{owner,paths:["/metrics/range"]}})),owner);
}
test("background update preserves an old month and an unfinished workout note",async({page})=>{
 const counts=await setup(page);
 for(let index=0;index<5;index++)await page.getByRole("button",{name:"Предыдущий месяц"}).click();
 const date=page.getByRole("button",{name:"2026-05-13: тренировок 1"});
 await expect(date).toBeVisible();await date.click();
 await page.getByRole("button",{name:"Заметки и тяжесть тренировки"}).click();
 const note=page.getByRole("textbox",{name:"Заметки",exact:true});
 await note.fill("Незавершённая заметка");
 const before=counts.histories();await refresh(page);
 await expect.poll(counts.histories).toBeGreaterThan(before);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await expect(note).toHaveValue("Незавершённая заметка");
 await expect(date).toHaveCount(1);
});
test("background update preserves the chosen analytics period",async({page})=>{
 const counts=await setup(page);
 const period=page.getByRole("button",{name:"8 нед.",exact:true});
 await period.click();await expect(period).toHaveAttribute("aria-pressed","true");
 const before=counts.dashboards();await refresh(page);
 await expect.poll(counts.dashboards).toBeGreaterThan(before);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await expect(period).toHaveAttribute("aria-pressed","true");
});
test("a remotely deleted workout stays absent after offline reopening",async({page,context})=>{
 const state=await setup(page);
 await page.getByRole("link",{name:"Помощь",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Помощь",exact:true})).toBeVisible();
 await page.getByRole("link",{name:"Дневник",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Календарь тренировок"})).toBeVisible();
 for(let index=0;index<5;index++)await page.getByRole("button",{name:"Предыдущий месяц"}).click();
 await expect(page.getByRole("button",{name:"2026-05-13: тренировок 1"})).toBeVisible();
 state.removeRemote();await refresh(page);
 await expect(page.getByRole("button",{name:"2026-05-13: нет тренировок"})).toBeVisible();
 await page.unrouteAll({behavior:"wait"});await context.setOffline(true);
 await page.getByRole("link",{name:"Помощь",exact:true}).click();
 await expect(page).toHaveURL(/\/help-center$/);
 await page.getByRole("link",{name:"Дневник",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Календарь тренировок"})).toBeVisible();
 for(let index=0;index<5;index++)await page.getByRole("button",{name:"Предыдущий месяц"}).click();
 await expect(page.getByRole("button",{name:"2026-05-13: нет тренировок"})).toBeVisible();
});
