import {afterEach,expect,it,vi} from "vitest";
import {cacheHabitDay,getHabitDay} from "@/utils/habits";
afterEach(()=>vi.unstubAllGlobals());
it("reports an owner-bound habit change only after durable storage succeeds",()=>{
 const target=new EventTarget(),values=new Map<string,string>(),changed=vi.fn((event:Event)=>{
  expect((event as CustomEvent<{owner:string}>).detail.owner).toBe("owner-a");
  expect(getHabitDay("2026-10-10","owner-a").waterMl).toBe(2500);
 });
 vi.stubGlobal("window",target);vi.stubGlobal("localStorage",{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)});
 target.addEventListener("fitness:habits-updated",changed);
 cacheHabitDay({date:"2026-10-10",waterMl:2500,sleepHours:null,checkedIn:false},"owner-a");expect(changed).toHaveBeenCalledTimes(1);
 changed.mockClear();vi.stubGlobal("localStorage",{getItem:()=>null,setItem:()=>{throw Error("quota");}});
 cacheHabitDay({date:"2026-10-10",waterMl:3000,sleepHours:null,checkedIn:false},"owner-a");expect(changed).not.toHaveBeenCalled();
});
