import { expect, test, type Page } from "@playwright/test";
import { emptyPersonalDraft, maximumPersonalDraft } from "./fixtures/personal-draft-data";

const fixture = "/e2e/fixtures/personal-draft-recovery.html";
const key = "fitness_form_draft:v1:synthetic-a:personal-program:v2";
async function openFixture(page: Page, url = fixture) {
  await page.goto(url);
  await expect(page.locator('[data-instance="a"]')).toBeVisible();
}

test("private denied storage keeps editable memory and a visible recovery warning", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException("denied", "SecurityError"); };
    Storage.prototype.setItem = () => { throw new DOMException("denied", "SecurityError"); };
  });
  await openFixture(page, `${fixture}?domain`);
  const draft = { ...emptyPersonalDraft(), name: "В памяти" };
  await page.evaluate(draft => Reflect.get(window, "draftHarness").setValue(draft), draft);
  await expect(page.locator("output")).toHaveText("true:false");
  expect(await page.evaluate(() => Reflect.get(window, "draftHarness").value)).toEqual(draft);
  expect(await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented;
  })).toBe(true);
});

test("caller recovery budget restores a draft beyond the shared default", async ({ page }) => {
  await openFixture(page);
  await page.evaluate(() => (Reflect.get(window, "draftHarness").setValue({ text: "x".repeat(120_000) })));
  await expect(page.locator("output")).toHaveText("true:true");
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key)?.length, key)).toBe(120_011);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Reflect.get(window, "draftHarness")?.value.text.length)).toBe(120_000);
});

test("overbudget typing stays in memory, warns, and cannot resurrect its older owned draft after clear", async ({ page }) => {
  await openFixture(page);
  await page.evaluate(() => Reflect.get(window, "draftHarness").setValue({ text: "old" }));
  await expect(page.locator("output")).toHaveText("true:true");
  await page.evaluate(() => Reflect.get(window, "draftHarness").setValue({ text: "x".repeat(2_000_000) }));
  await expect(page.locator("output")).toHaveText("true:false");
  expect(await page.evaluate(() => Reflect.get(window, "draftHarness").value.text.length)).toBe(2_000_000);
  await page.evaluate(() => Reflect.get(window, "draftHarness").recovery.clear());
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBeNull();
});

test("maximum valid personal topology and every raw buffer survive actual storage and reload with full equality", async ({ page }) => {
  const expected = maximumPersonalDraft();
  await openFixture(page, `${fixture}?domain`);
  await page.evaluate(draft => Reflect.get(window, "draftHarness").setValue(draft), expected);
  await expect(page.locator("output")).toHaveText("true:true");
  const serialized = JSON.stringify(expected);
  expect(serialized.length).toBeGreaterThan(362_664);
  await test.info().attach("maximum-draft-size", { body: JSON.stringify({ chars: serialized.length, days: 7, exercises: 84, methods: 672, parts: 5376, groups: 42, rawFields: 16506 }), contentType: "application/json" });
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key)?.length, key)).toBe(serialized.length);
  expect(await page.evaluate(() => {
    const draft = Reflect.get(window, "draftHarness").value;
    return Reflect.get(window, "personalProgramInput")(draft, Reflect.get(window, "personalDraftCatalog")(draft)).ok;
  })).toBe(true);
  await page.reload();
  await expect(page.locator("output")).toHaveText("true:true");
  expect(await page.evaluate(() => Reflect.get(window, "draftHarness").value)).toEqual(expected);
  // Retained, temporarily hidden days remain part of recovery, not the request.
  expected.dayCount = 1; expected.activeDay = 0;
  await page.evaluate(draft => Reflect.get(window, "draftHarness").setValue(draft), expected);
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).dayCount, key)).toBe(1);
  await page.reload();
  await expect(page.locator("output")).toHaveText("true:true");
  expect(await page.evaluate(() => Reflect.get(window, "draftHarness").value)).toEqual(expected);
});

test("maximum draft plus pending group proposal metadata remains recoverable within the finite budget", async ({ page }) => {
  const expected = maximumPersonalDraft();
  for (const day of expected.days) day.groupProposal = { ...day.groups![0], isNew: false, exercise_ids: day.exercises.map(row => row.exercise_id),
    rounds: "", transition_sec: "-", round_rest_sec: "1," };
  const serialized = JSON.stringify(expected);
  expect(serialized.length).toBeLessThan(4_000_000);
  await test.info().attach("maximum-proposal-draft-size", { body: JSON.stringify({ chars: serialized.length, proposals: 7, numericRawFields: 16506 }), contentType: "application/json" });
  await openFixture(page, `${fixture}?domain`);
  await page.evaluate(draft => Reflect.get(window, "draftHarness").setValue(draft), expected);
  await expect(page.locator("output")).toHaveText("true:true");
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key)?.length, key)).toBe(serialized.length);
  await page.reload();
  await expect(page.locator("output")).toHaveText("true:true");
  expect(await page.evaluate(() => Reflect.get(window, "draftHarness").value)).toEqual(expected);
  expect(await page.evaluate(() => {
    const draft = Reflect.get(window, "draftHarness").value;
    return Reflect.get(window, "personalProgramInput")(draft, Reflect.get(window, "personalDraftCatalog")(draft)).ok;
  })).toBe(false);
});

test("default budget remains 100000 and rejects an oversized saved value before parsing it", async ({ page }) => {
  await page.addInitScript(({ key }) => {
    localStorage.setItem(key, JSON.stringify({ text: "x".repeat(100_000) }));
    const parse = JSON.parse;
    Reflect.set(window, "oversizedParseCount", 0);
    JSON.parse = function(value, ...rest) {
      if (typeof value === "string" && value.length > 100_000) Reflect.set(window, "oversizedParseCount", Reflect.get(window, "oversizedParseCount") + 1);
      return parse(value, ...rest);
    };
  }, { key });
  await openFixture(page, `${fixture}?default`);
  await expect(page.locator("output")).toHaveText("false:true");
  expect(await page.evaluate(() => Reflect.get(window, "oversizedParseCount"))).toBe(0);
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBeNull();
  await page.evaluate(() => Reflect.get(window, "draftHarness").setValue({ text: "x".repeat(100_000) }));
  await expect(page.locator("output")).toHaveText("true:false");
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBeNull();
});

test("account and context keys restore only their own draft", async ({ page }) => {
  await openFixture(page);
  await page.evaluate(() => Reflect.get(window, "draftHarness").setValue({ text: "account a" }));
  await expect(page.locator("output")).toHaveText("true:true");
  await openFixture(page, `${fixture}?owner=synthetic-b`);
  await expect(page.locator("output")).toHaveText("false:true");
  expect(await page.evaluate(() => Reflect.get(window, "draftHarness").value)).toEqual({ text: "" });
  await page.evaluate(() => Reflect.get(window, "draftHarness").setValue({ text: "account b" }));
  await expect(page.locator("output")).toHaveText("true:true");
  await openFixture(page, `${fixture}?context=other-form`);
  await expect(page.locator("output")).toHaveText("false:true");
  expect(await page.evaluate(() => Reflect.get(window, "draftHarness").value)).toEqual({ text: "" });
  await openFixture(page);
  await expect(page.locator("output")).toHaveText("true:true");
  expect(await page.evaluate(() => Reflect.get(window, "draftHarness").value)).toEqual({ text: "account a" });
});

for (const bad of ["malformed", "unknown", "oversized"] as const) {
  test(`personal recovery rejects ${bad} data safely`, async ({ page }) => {
    await page.addInitScript(({ key, bad }) => {
      localStorage.setItem(key, bad === "malformed" ? "{broken" : bad === "oversized" ? " ".repeat(4_000_001) : JSON.stringify({ name: "unknown", catalog: [{ token: "do not persist" }] }));
    }, { key, bad });
    await openFixture(page, `${fixture}?domain`);
    await expect(page.locator("output")).toHaveText("false:true");
    expect(await page.evaluate(() => Reflect.get(window, "draftHarness").value)).toEqual(emptyPersonalDraft());
    expect(await page.evaluate(key => localStorage.getItem(key), key)).toBeNull();
  });
}

test("quota failure keeps memory and exit guard, and successful clear removes its older owned draft", async ({ page }) => {
  await openFixture(page);
  await page.evaluate(() => Reflect.get(window, "draftHarness").setValue({ text: "old" }));
  await expect(page.locator("output")).toHaveText("true:true");
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (key.startsWith("fitness_form_draft:")) throw new DOMException("quota", "QuotaExceededError"); return set.call(this, key, value); };
    Reflect.get(window, "draftHarness").setValue({ text: "new memory" });
  });
  await expect(page.locator("output")).toHaveText("true:false");
  expect(await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented;
  })).toBe(true);
  expect(await page.evaluate(() => Reflect.get(window, "draftHarness").value)).toEqual({ text: "new memory" });
  await page.evaluate(() => Reflect.get(window, "draftHarness").recovery.clear());
  await expect(page.locator("output")).toHaveText("false:true");
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBeNull();
});

test("clear persists valid retained edits and refuses overbudget retained text without reviving old storage", async ({ page }) => {
  await openFixture(page);
  await page.evaluate(() => Reflect.get(window, "draftHarness").setValue({ text: "submitted" }));
  await expect(page.locator("output")).toHaveText("true:true");
  await page.evaluate(() => {
    const harness = Reflect.get(window, "draftHarness");
    const retained = { text: "pending after save" }; harness.setValue(retained); harness.recovery.clear({ text: "accepted" }, retained);
  });
  await expect(page.locator("output")).toHaveText("true:true");
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(JSON.stringify({ text: "pending after save" }));
  await page.evaluate(() => {
    const harness = Reflect.get(window, "draftHarness");
    const retained = { text: "x".repeat(2_000_000) }; harness.setValue(retained); harness.recovery.clear({ text: "accepted" }, retained);
  });
  await expect(page.locator("output")).toHaveText("true:false");
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBeNull();
  expect(await page.evaluate(() => Reflect.get(window, "draftHarness").value.text.length)).toBe(2_000_000);
});

test("clear preserves another instance's newer draft and warns for retained edits it could not store", async ({ page }) => {
  await openFixture(page);
  await page.evaluate(() => Reflect.get(window, "draftHarness").setValue({ text: "submitted" }));
  await expect(page.locator("output")).toHaveText("true:true");
  await page.evaluate(() => Reflect.get(window, "mountDraft")("b"));
  await expect(page.locator('[data-instance="b"]')).toHaveText("true:true");
  await page.evaluate(() => Reflect.get(window, "draftHarness_b").setValue({ text: "newer elsewhere" }));
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), key)).toBe(JSON.stringify({ text: "newer elsewhere" }));
  await page.evaluate(() => {
    const a = Reflect.get(window, "draftHarness_a");
    const next = { text: "accepted" }; const retained = { text: "unsaved retained" };
    a.setValue(retained); a.recovery.clear(next, retained);
  });
  await expect(page.locator('[data-instance="a"]')).toHaveText("true:false");
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(JSON.stringify({ text: "newer elsewhere" }));
  await page.evaluate(() => Reflect.get(window, "draftHarness_a").rerender());
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(JSON.stringify({ text: "newer elsewhere" }));
});

test("bounded invalid personal numeric text restores exactly and unbounded typing warns without a truncated write", async ({ page }) => {
  const expected = maximumPersonalDraft();
  const row = expected.days[6].exercises[11];
  row.sets = ""; row.rest_sec = "-1";
  expected.durationWeeks = "1.5";
  expected.days[6].raw![`${row.exercise_id}/method/8/part/1/target_weight`] = "1,";
  expected.days[6].raw![`${row.exercise_id}/method/8/part/2/target_reps`] = "";
  expected.days[6].raw![`${expected.days[6].groups![5].id}/rounds`] = "";
  await openFixture(page, `${fixture}?domain`);
  await page.evaluate(draft => Reflect.get(window, "draftHarness").setValue(draft), expected);
  await expect(page.locator("output")).toHaveText("true:true");
  await page.reload();
  await expect(page.locator("output")).toHaveText("true:true");
  expect(await page.evaluate(() => Reflect.get(window, "draftHarness").value)).toEqual(expected);
  expect(await page.evaluate(() => {
    const draft = Reflect.get(window, "draftHarness").value;
    return Reflect.get(window, "personalProgramInput")(draft, Reflect.get(window, "personalDraftCatalog")(draft)).ok;
  })).toBe(false);
  await page.evaluate(() => {
    const harness = Reflect.get(window, "draftHarness");
    harness.setValue({ ...harness.value, durationWeeks: "1".repeat(Reflect.get(window, "maxDraftChars")) });
  });
  await expect(page.locator("output")).toHaveText("true:false");
  expect(await page.evaluate(() => Reflect.get(window, "draftHarness").value.durationWeeks.length)).toBe(4_000_000);
  // Its previous owned, recoverable snapshot may remain until an accepted save.
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), key)).toEqual(expected);
  expect(await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented;
  })).toBe(true);
  await page.evaluate(() => Reflect.get(window, "draftHarness").recovery.clear());
  await expect(page.locator("output")).toHaveText("false:true");
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBeNull();
});

for (const newer of ["recoverable", "overbudget"] as const) {
  test(`a captured save callback retains newer ${newer} typing in the same form`, async ({ page }) => {
    await openFixture(page);
    await page.evaluate(() => Reflect.get(window, "draftHarness").setValue({ text: "submitted" }));
    await expect(page.locator("output")).toHaveText("true:true");
    await page.evaluate(() => Reflect.set(window, "capturedClear", Reflect.get(window, "draftHarness").recovery.clear));
    await page.evaluate(newer => Reflect.get(window, "draftHarness").setValue({ text: newer === "overbudget" ? "x".repeat(2_000_000) : "new unsaved typing" }), newer);
    await expect(page.locator("output")).toHaveText(`true:${newer === "recoverable"}`);
    await page.evaluate(() => Reflect.get(window, "capturedClear")());
    await expect(page.locator("output")).toHaveText(`true:${newer === "recoverable"}`);
    if (newer === "recoverable") {
      expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), key)).toEqual({ text: "new unsaved typing" });
    } else {
      expect(await page.evaluate(key => localStorage.getItem(key), key)).toBeNull();
      expect(await page.evaluate(() => Reflect.get(window, "draftHarness").value.text.length)).toBe(2_000_000);
    }
  });
}

test("typed and buffered goals determine canonical/API repetition text after reload while the raw draft stays lossless", async ({ page }) => {
  const draft = emptyPersonalDraft(); draft.name = "Цели плана";
  const ids = [1, 2, 3, 4].map(i => `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`);
  draft.days[0].exercises = [
    { exercise_id: ids[0], sets: "2", reps: "3-5", rest_sec: "0", target: { kind: "weight_reps", reps_min: 8, reps_max: 12, target_weight: 12.5 } },
    { exercise_id: ids[1], sets: "2", reps: "3-5", rest_sec: "0", target: { kind: "timed", duration_sec: 60 } },
    { exercise_id: ids[2], sets: "2", reps: "3-5", rest_sec: "0", target: { kind: "reps_only", reps_min: 15, reps_max: 15 } },
    { exercise_id: ids[3], sets: "2", reps: "3 – 5", rest_sec: "0" },
  ];
  draft.days[0].raw = { [`${ids[0]}/target/reps_min`]: "12", [`${ids[0]}/target/reps_max`]: "15", [`${ids[1]}/target/duration_sec`]: "95" };
  await openFixture(page, `${fixture}?domain`);
  await page.evaluate(draft => Reflect.get(window, "draftHarness").setValue(draft), draft);
  await expect(page.locator("output")).toHaveText("true:true");
  await page.reload();
  await expect(page.locator("output")).toHaveText("true:true");
  expect(await page.evaluate(() => Reflect.get(window, "draftHarness").value)).toEqual(draft);
  const result = await page.evaluate(() => {
    const draft = Reflect.get(window, "draftHarness").value;
    const loads = ["weight_reps", "timed", "reps_only", "weight_reps"];
    const catalog = Reflect.get(window, "personalDraftCatalog")(draft).map((row: object, index: number) => ({ ...row, tags: [`load:${loads[index]}`] }));
    const plan = Reflect.get(window, "personalDayToPlan")(draft.days[0], catalog);
    const input = Reflect.get(window, "personalProgramInput")(draft, catalog);
    return { plan: plan.ok ? plan.value.exercises.map((row: { target_reps: string }) => row.target_reps) : null,
      input: input.ok ? input.value.days[0].exercises.map((row: { reps: string }) => row.reps) : null };
  });
  expect(result).toEqual({ plan: ["12-15", "95с", "15", "3 – 5"], input: ["12-15", "95с", "15", "3 – 5"] });
  expect(await page.evaluate(() => Reflect.get(window, "draftHarness").value)).toEqual(draft);
});

test("canonical roundtrip and reorder retain owning raw reps through hook reload, explicit edit and goal removal", async ({ page }) => {
  const draft = emptyPersonalDraft(); draft.name = "Исходные повторы";
  const a = "11111111-1111-4111-8111-111111111111";
  const b = "22222222-2222-4222-8222-222222222222";
  draft.days[0].exercises = [
    { exercise_id: a, sets: "2", reps: "3-5", rest_sec: "0", target: { kind: "reps_only", reps_min: 12, reps_max: 15 } },
    { exercise_id: b, sets: "2", reps: "7-9", rest_sec: "0", target: { kind: "timed", duration_sec: 95 } },
  ];
  draft.days[0].raw = { [`${a}/target/reps_min`]: "0012" };
  await openFixture(page, `${fixture}?domain`);
  await page.evaluate(draft => Reflect.get(window, "draftHarness").setValue(draft), draft);
  await expect(page.locator("output")).toHaveText("true:true");
  const labels = await page.evaluate(() => {
    const harness = Reflect.get(window, "draftHarness"); const day = harness.value.days[0];
    const forward = Reflect.get(window, "personalDayToPlan")(day);
    if (!forward.ok) throw new Error("forward fixture");
    const canonical = forward.value.exercises.map((row: { target_reps: string }) => row.target_reps);
    const returned = Reflect.get(window, "personalDayFromPlan")(forward.value, day.name, day);
    if (!returned.ok) throw new Error("backward fixture");
    const reordered = { ...forward.value, exercises: [...forward.value.exercises].reverse().map((row, i) => ({ ...row, order: i + 1 })) };
    const reorderedDay = Reflect.get(window, "personalDayFromPlan")(reordered, day.name, returned.value);
    if (!reorderedDay.ok) throw new Error("reorder fixture");
    harness.setValue({ ...harness.value, days: [reorderedDay.value] });
    return { canonical, raw: returned.value.exercises.map((row: { reps: string }) => row.reps) };
  });
  expect(labels).toEqual({ canonical: ["12-15", "95с"], raw: ["3-5", "7-9"] });
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).days[0].exercises[0].exercise_id, key)).toBe(b);
  await page.reload();
  await expect(page.locator("output")).toHaveText("true:true");
  expect(await page.evaluate(() => Reflect.get(window, "draftHarness").value)).toEqual({ ...draft, days: [{ ...draft.days[0], exercises: [...draft.days[0].exercises].reverse() }] });
  await page.evaluate(a => {
    const harness = Reflect.get(window, "draftHarness"); const day = harness.value.days[0];
    const forward = Reflect.get(window, "personalDayToPlan")(day);
    forward.value.exercises.find((row: { exercise_id: string }) => row.exercise_id === a).target_reps = "6-8";
    const edited = Reflect.get(window, "personalDayFromPlan")(forward.value, day.name, day, [`${a}/reps`]);
    if (!edited.ok) throw new Error("edit fixture");
    forward.value.exercises.find((row: { exercise_id: string }) => row.exercise_id === a).target = null;
    const cleared = Reflect.get(window, "personalDayFromPlan")(forward.value, day.name, edited.value);
    if (!cleared.ok) throw new Error("clear fixture");
    harness.setValue({ ...harness.value, days: [cleared.value] });
  }, a);
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).days[0].exercises[1].reps, key)).toBe("6-8");
  await page.reload();
  await expect(page.locator("output")).toHaveText("true:true");
  expect(await page.evaluate(() => {
    const day = Reflect.get(window, "draftHarness").value.days[0];
    const plan = Reflect.get(window, "personalDayToPlan")(day);
    return { raw: day.exercises.map((row: { reps: string }) => row.reps), canonical: plan.value.exercises.map((row: { target_reps: string }) => row.target_reps), target: day.exercises[1].target };
  })).toEqual({ raw: ["7-9", "6-8"], canonical: ["95с", "6-8"], target: null });
});

test("current private draft preserves incomplete minute text and its time unit through reload", async ({ page }) => {
  const draft = emptyPersonalDraft(); draft.name = "Незавершённое время";
  const id = "11111111-1111-4111-8111-111111111111";
  draft.days[0].exercises = [{ exercise_id: id, sets: "", reps: "60с", rest_sec: "-", target: { kind: "timed", duration_sec: 60 } }];
  draft.days[0].raw = { [`${id}/target/duration_sec`]: "1," };
  draft.days[0].timeUnits = { [id]: "minutes" };
  await openFixture(page, `${fixture}?domain`);
  await page.evaluate(draft => Reflect.get(window, "draftHarness").setValue(draft), draft);
  await expect(page.locator("output")).toHaveText("true:true");
  await page.reload();
  await expect(page.locator("output")).toHaveText("true:true");
  expect(await page.evaluate(() => Reflect.get(window, "draftHarness").value)).toEqual(draft);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), key)).toEqual(draft);
});
