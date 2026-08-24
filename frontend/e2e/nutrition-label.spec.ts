import { expect, test } from "@playwright/test";

const USER_ID = "22222222-2222-4222-8222-222222222222";

test("label photo is uploaded as multipart and opens an editable review", async ({ page }) => {
  let requestContentType = "";
  let requestBody = "";

  await page.setViewportSize({ width: 375, height: 667 });
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "e2e-token"));
  await page.route("**/users/me", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: USER_ID,
        telegram_id: null,
        username: "e2e-user",
        auth_email: "e2e@example.test",
        anthropometry: {},
        goals: { onboarding_completed: true },
        subscription_status: "free",
        stars_balance: 0,
        onboarding_completed: true,
      }),
    });
  });
  await page.route(/\/nutrition\/daily(?:\?|$)/, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        date: "2026-08-16",
        totals: { calories: 0, proteins: 0, fats: 0, carbs: 0 },
        meals: { breakfast: [], lunch: [], dinner: [], snack: [] },
        targets: {
          complete: true,
          calories_target: 2000,
          macros: { proteins_g: 120, fats_g: 65, carbs_g: 220 },
        },
      }),
    });
  });
  await page.route("**/nutrition/label/recognize", async (route) => {
    const request = route.request();
    requestContentType = request.headers()["content-type"] || "";
    requestBody = request.postDataBuffer()?.toString("latin1") || "";
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        recognized: true,
        name_ru: "Тестовый йогурт",
        basis_label: "Пищевая ценность на 100 г",
        serving_grams: null,
        calories_kcal: 81,
        proteins_g: 5.2,
        fats_g: 2.5,
        carbs_g: 9.1,
        fiber_g: null,
        sugars_g: 7.4,
        salt_g: 0.12,
        confidence: 0.92,
        warnings: ["Сверьте сахар с упаковкой"],
        remaining_requests: 9,
      }),
    });
  });

  await page.goto("/nutrition");
  await page.getByRole("button", { name: "+ Добавить продукт" }).click();
  await expect(page.getByRole("button", { name: /Снять этикетку/ })).toHaveCount(0);
  await page.getByRole("button", { name: /Сканировать штрихкод/ }).click();
  await page.getByRole("dialog", { name: "Сканер штрихкода" }).getByRole("button", { name: "Этикетка" }).click();

  const cameraDialog = page.getByRole("dialog", { name: "Фото этикетки" });
  await expect(cameraDialog).toBeVisible();
  const cameraBox = await cameraDialog.boundingBox();
  expect(cameraBox).not.toBeNull();
  expect(cameraBox!.y).toBeGreaterThanOrEqual(0);
  expect(cameraBox!.y + cameraBox!.height).toBeLessThanOrEqual(667);
  await expect(cameraDialog.getByRole("button", { name: "Выбрать фото или файл" })).toBeVisible();

  await cameraDialog.locator('input[type="file"]').setInputFiles({
    name: "label.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
  });

  const review = page.getByRole("dialog", { name: "Проверьте этикетку" });
  await expect(review).toBeVisible();
  await expect(review.getByLabel("Название")).toHaveValue("Тестовый йогурт");
  await expect(review.getByLabel("Ккал")).toHaveValue("81");
  await expect(review.getByLabel("Белки")).toHaveValue("5,2");
  await expect(review.getByLabel("Жиры")).toHaveValue("2,5");
  await expect(review.getByLabel("Углеводы")).toHaveValue("9,1");
  await expect(review.getByText(/черновик: сверьте каждое поле/i)).toBeVisible();
  await expect(review.getByText(/Сверьте сахар с упаковкой/)).toBeVisible();

  expect(requestContentType).toContain("multipart/form-data; boundary=");
  expect(requestBody).toContain('name="image"');
  expect(requestBody).toContain('filename="label.png"');
});

test("unknown barcode offers label, rescan and manual product entry", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "e2e-token"));
  await page.route("**/users/me", async (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      id: USER_ID,
      telegram_id: null,
      username: "e2e-user",
      auth_email: "e2e@example.test",
      anthropometry: {},
      goals: { onboarding_completed: true },
      subscription_status: "free",
      stars_balance: 0,
      onboarding_completed: true,
    }),
  }));
  await page.route(/\/nutrition\/daily(?:\?|$)/, async (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      date: "2026-08-20",
      totals: { calories: 0, proteins: 0, fats: 0, carbs: 0 },
      meals: { breakfast: [], lunch: [], dinner: [], snack: [] },
      targets: { complete: false },
    }),
  }));
  await page.route("**/nutrition/barcode/4601234567890", async (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      found: false,
      barcode: "4601234567890",
      product: null,
      source: null,
      created: false,
      error: null,
    }),
  }));

  await page.goto("/nutrition");
  await page.getByRole("button", { name: "+ Добавить продукт" }).click();
  await page.getByRole("button", { name: /Сканировать штрихкод/ }).click();

  const scanner = page.getByRole("dialog", { name: "Сканер штрихкода" });
  await expect(scanner.getByRole("button", { name: "Этикетка" })).toBeVisible();
  await expect(scanner.getByRole("button", { name: "Ввести вручную" })).toBeVisible();
  await scanner.getByLabel(/Код вручную/).fill("4601234567890");
  await scanner.getByRole("button", { name: "Найти" }).click();

  await expect(page.getByText(/пока не найден в каталоге/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Сканировать ещё раз" })).toBeVisible();
  await page.getByRole("button", { name: "Ввести вручную" }).click();
  await expect(page.getByRole("dialog", { name: "Новый продукт" })).toBeVisible();
});

test("nutrition edit dialog keeps full mobile width", async ({ page }) => {
  const productId = "33333333-3333-4333-8333-333333333333";
  const logId = "44444444-4444-4444-8444-444444444444";
  await page.setViewportSize({ width: 360, height: 800 });
  await page.addInitScript(() => localStorage.setItem("fitness_jwt", "e2e-token"));
  await page.route("**/users/me", async (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      id: USER_ID,
      telegram_id: null,
      username: "nutrition-user",
      auth_email: null,
      anthropometry: {},
      goals: { onboarding_completed: true },
      subscription_status: "free",
      stars_balance: 0,
      onboarding_completed: true,
    }),
  }));
  await page.route(/\/nutrition\/daily(?:\?|$)/, async (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      date: "2026-08-24",
      totals: { calories: 100, proteins: 20, fats: 1, carbs: 2 },
      meals: {
        breakfast: [{
          id: logId,
          user_id: USER_ID,
          date: "2026-08-24",
          meal_type: "breakfast",
          product_id: productId,
          quantity_grams: 43,
          calculated_kbj: {},
          product: {
            id: productId,
            name_ru: "Первый русский протеин",
            barcode: null,
            calories: 350,
            proteins: 80,
            fats: 2,
            carbs: 4,
            category: "Протеин",
            source: "manual",
          },
        }],
        lunch: [],
        dinner: [],
        snack: [],
      },
      targets: { complete: false },
    }),
  }));

  await page.goto("/nutrition");
  await page.getByRole("button", { name: "Изменить" }).click();
  const dialog = page.getByRole("dialog", { name: "Изменить запись" });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.width).toBeGreaterThanOrEqual(330);
  expect(box?.x).toBeGreaterThanOrEqual(10);
  expect(box ? box.x + box.width : 999).toBeLessThanOrEqual(350);
});
