-- Independent owner-approved illustrations. GIF URLs, exercise UUIDs and history are preserved.
-- The runner executes this file in a transaction; the staging relation is temporary.
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS image_url TEXT;

CREATE TEMP TABLE approved_exercise_images_release (
    name_ru TEXT PRIMARY KEY,
    mapping_id TEXT NOT NULL,
    image_url TEXT NOT NULL,
    thumbnail_url TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO approved_exercise_images_release VALUES
    ('Приседания со штангой', '0043', '/exercise-images/001-0043-fc0d780ba18d.webp', '/exercise-thumbnails/001-0043-fc0d780ba18d-start.webp'),
    ('Фронтальные приседания', '0042', '/exercise-images/002-0042-cd0c8e0f2e3d.webp', '/exercise-thumbnails/002-0042-cd0c8e0f2e3d-start.webp'),
    ('Сумо-приседания', '0124', '/exercise-images/003-0124-da0208044616.webp', '/exercise-thumbnails/003-0124-da0208044616-start.webp'),
    ('Приседания со своим весом', '3119', '/exercise-images/004-3119-d6907cbe7db7.webp', '/exercise-thumbnails/004-3119-d6907cbe7db7-start.webp'),
    ('Приседания с гантелью у груди', '1760', '/exercise-images/005-1760-fdfda3c750a4.webp', '/exercise-thumbnails/005-1760-fdfda3c750a4-start.webp'),
    ('Жим ногами', '1463', '/exercise-images/006-1463-07cb88c4f130.webp', '/exercise-thumbnails/006-1463-07cb88c4f130-start.webp'),
    ('Разгибания ног', '0585', '/exercise-images/007-0585-eeacc31fe866.webp', '/exercise-thumbnails/007-0585-eeacc31fe866-start.webp'),
    ('Сгибания ног лёжа', '0586', '/exercise-images/008-0586-446ff39b46df.webp', '/exercise-thumbnails/008-0586-446ff39b46df-start.webp'),
    ('Румынская тяга', '0085', '/exercise-images/009-0085-2edb61f0c54a.webp', '/exercise-thumbnails/009-0085-2edb61f0c54a-start.webp'),
    ('Румынская тяга с гантелями', '1459', '/exercise-images/010-1459-e5806c35f8d9.webp', '/exercise-thumbnails/010-1459-e5806c35f8d9-start.webp'),
    ('Становая тяга классическая', '0032', '/exercise-images/011-0032-030f0bf9ce25.webp', '/exercise-thumbnails/011-0032-030f0bf9ce25-start.webp'),
    ('Болгарские выпады', '0410', '/exercise-images/012-0410-09e28dfed288.webp', '/exercise-thumbnails/012-0410-09e28dfed288-start.webp'),
    ('Выпады вперёд', '0336', '/exercise-images/013-0336-9fef28c7127d.webp', '/exercise-thumbnails/013-0336-9fef28c7127d-start.webp'),
    ('Выпады назад с гантелями', '0381', '/exercise-images/014-0381-ebea2d40318f.webp', '/exercise-thumbnails/014-0381-ebea2d40318f-start.webp'),
    ('Боковые выпады', '1410', '/exercise-images/015-1410-5844e4dd69a4.webp', '/exercise-thumbnails/015-1410-5844e4dd69a4-start.webp'),
    ('Зашагивания на тумбу', '0431', '/exercise-images/016-0431-45b16092cf47.webp', '/exercise-thumbnails/016-0431-45b16092cf47-start.webp'),
    ('Ягодичный мост', '3013', '/exercise-images/017-3013-c9a1fcde15ea.webp', '/exercise-thumbnails/017-3013-c9a1fcde15ea-start.webp'),
    ('Ягодичный мост со штангой', '1409', '/exercise-images/018-1409-9f2c782f2d83.webp', '/exercise-thumbnails/018-1409-9f2c782f2d83-start.webp'),
    ('Подъёмы на носки стоя', '1372', '/exercise-images/019-1372-eb62a03f6686.webp', '/exercise-thumbnails/019-1372-eb62a03f6686-start.webp'),
    ('Подъёмы на носки сидя', '0594', '/exercise-images/020-0594-756eecffead7.webp', '/exercise-thumbnails/020-0594-756eecffead7-start.webp'),
    ('Жим штанги лёжа', '0025', '/exercise-images/021-0025-a3b6b46d5f3b.webp', '/exercise-thumbnails/021-0025-a3b6b46d5f3b-start.webp'),
    ('Жим гантелей лёжа', '0289', '/exercise-images/022-0289-eb8653cca822.webp', '/exercise-thumbnails/022-0289-eb8653cca822-start.webp'),
    ('Жим гантелей на наклонной', '0314', '/exercise-images/023-0314-520892c66818.webp', '/exercise-thumbnails/023-0314-520892c66818-start.webp'),
    ('Жим лёжа узким хватом', '0030', '/exercise-images/024-0030-51c1bee18e2d.webp', '/exercise-thumbnails/024-0030-51c1bee18e2d-start.webp'),
    ('Жим в тренажёре', '0576', '/exercise-images/025-0576-031d5f883efd.webp', '/exercise-thumbnails/025-0576-031d5f883efd-start.webp'),
    ('Разведение гантелей лёжа', '0308', '/exercise-images/026-0308-66f99719ef99.webp', '/exercise-thumbnails/026-0308-66f99719ef99-start.webp'),
    ('Сведение рук в кроссовере', '0188', '/exercise-images/027-0188-4c396258b6f6.webp', '/exercise-thumbnails/027-0188-4c396258b6f6-start.webp'),
    ('Отжимания от пола', '0662', '/exercise-images/028-0662-fa0c2d36d59f.webp', '/exercise-thumbnails/028-0662-fa0c2d36d59f-start.webp'),
    ('Отжимания с колен', '3211', '/exercise-images/029-3211-36edda89f1e1.webp', '/exercise-thumbnails/029-3211-36edda89f1e1-start.webp'),
    ('Отжимания с возвышения', '0493', '/exercise-images/030-0493-3046b042a7f6.webp', '/exercise-thumbnails/030-0493-3046b042a7f6-start.webp'),
    ('Отжимания узким хватом', '0283', '/exercise-images/031-0283-55accc416bcd.webp', '/exercise-thumbnails/031-0283-55accc416bcd-start.webp'),
    ('Отжимания на брусьях', '0251', '/exercise-images/032-0251-8b5ec49a9e2f.webp', '/exercise-thumbnails/032-0251-8b5ec49a9e2f-start.webp'),
    ('Подтягивания', '0652', '/exercise-images/033-0652-bc5c0547260b.webp', '/exercise-thumbnails/033-0652-bc5c0547260b-start.webp'),
    ('Австралийские подтягивания', '0499', '/exercise-images/034-0499-e82eb437161d.webp', '/exercise-thumbnails/034-0499-e82eb437161d-start.webp'),
    ('Тяга штанги в наклоне', '0027', '/exercise-images/035-0027-b6f14d8a424f.webp', '/exercise-thumbnails/035-0027-b6f14d8a424f-start.webp'),
    ('Тяга гантели в наклоне', '0292', '/exercise-images/036-0292-10f3ba00dea6.webp', '/exercise-thumbnails/036-0292-10f3ba00dea6-start.webp'),
    ('Тяга верхнего блока', '0150', '/exercise-images/037-0150-ea6c856b2205.webp', '/exercise-thumbnails/037-0150-ea6c856b2205-start.webp'),
    ('Тяга горизонтального блока', '0861', '/exercise-images/038-0861-51cb0972f63b.webp', '/exercise-thumbnails/038-0861-51cb0972f63b-start.webp'),
    ('Тяга Т-грифа', '1349', '/exercise-images/039-1349-05ae9d977dc5.webp', '/exercise-thumbnails/039-1349-05ae9d977dc5-start.webp'),
    ('Тяга резинки к поясу', '3144', '/exercise-images/040-3144-616d4a81cc0e.webp', '/exercise-thumbnails/040-3144-616d4a81cc0e-start.webp'),
    ('Пуловер с гантелью', '0375', '/exercise-images/041-0375-9c92f409cd3e.webp', '/exercise-thumbnails/041-0375-9c92f409cd3e-start.webp'),
    ('Гиперэкстензия', '0489', '/exercise-images/042-0489-70f193d515bb.webp', '/exercise-thumbnails/042-0489-70f193d515bb-start.webp'),
    ('Тяга к лицу', '0203', '/exercise-images/043-0203-59e5b816d91d.webp', '/exercise-thumbnails/043-0203-59e5b816d91d-start.webp'),
    ('Жим штанги стоя', '1457', '/exercise-images/044-1457-1f65771c71bc.webp', '/exercise-thumbnails/044-1457-1f65771c71bc-start.webp'),
    ('Жим гантелей сидя', '0405', '/exercise-images/045-0405-b10db0955a82.webp', '/exercise-thumbnails/045-0405-b10db0955a82-start.webp'),
    ('Жим Арнольда', '2137', '/exercise-images/046-2137-9f5ae5843d48.webp', '/exercise-thumbnails/046-2137-9f5ae5843d48-start.webp'),
    ('Разводка гантелей в стороны', '0334', '/exercise-images/047-0334-f6949899ae23.webp', '/exercise-thumbnails/047-0334-f6949899ae23-start.webp'),
    ('Разводка в наклоне', '2292', '/exercise-images/048-2292-7bc18e78507b.webp', '/exercise-thumbnails/048-2292-7bc18e78507b-start.webp'),
    ('Подъёмы гантелей перед собой', '0310', '/exercise-images/049-0310-61f168569481.webp', '/exercise-thumbnails/049-0310-61f168569481-start.webp'),
    ('Обратные разведения в тренажёре', '0602', '/exercise-images/050-0602-ca4c315f1af8.webp', '/exercise-thumbnails/050-0602-ca4c315f1af8-start.webp'),
    ('Тяга к подбородку', '0120', '/exercise-images/051-0120-c6296b68e884.webp', '/exercise-thumbnails/051-0120-c6296b68e884-start.webp'),
    ('Шраги с гантелями', '0406', '/exercise-images/052-0406-411de64a95c4.webp', '/exercise-thumbnails/052-0406-411de64a95c4-start.webp'),
    ('Сгибания гантелей на бицепс', '0294', '/exercise-images/053-0294-939552e336f9.webp', '/exercise-thumbnails/053-0294-939552e336f9-start.webp'),
    ('Сгибания со штангой', '0031', '/exercise-images/054-0031-91bd16498a54.webp', '/exercise-thumbnails/054-0031-91bd16498a54-start.webp'),
    ('Молотковые сгибания', '0313', '/exercise-images/055-0313-17e23c988bba.webp', '/exercise-thumbnails/055-0313-17e23c988bba-start.webp'),
    ('Сгибания на скамье Скотта', '0070', '/exercise-images/056-0070-4088190e7123.webp', '/exercise-thumbnails/056-0070-4088190e7123-start.webp'),
    ('Сгибания на нижнем блоке', '0868', '/exercise-images/057-0868-66921eabd0ee.webp', '/exercise-thumbnails/057-0868-66921eabd0ee-start.webp'),
    ('Разгибания на блоке', '0201', '/exercise-images/058-0201-92f3db79b7f9.webp', '/exercise-thumbnails/058-0201-92f3db79b7f9-start.webp'),
    ('Разгибания гантели из-за головы', '2188', '/exercise-images/059-2188-cea16fa9e4db.webp', '/exercise-thumbnails/059-2188-cea16fa9e4db-start.webp'),
    ('Французский жим гантели', '0351', '/exercise-images/060-0351-f675aa20367e.webp', '/exercise-thumbnails/060-0351-f675aa20367e-start.webp'),
    ('Планка', '2135', '/exercise-images/061-2135-591a72c68751.webp', '/exercise-thumbnails/061-2135-591a72c68751-start.webp'),
    ('Боковая планка', '0705', '/exercise-images/062-0705-e9b5f7a0ab9b.webp', '/exercise-thumbnails/062-0705-e9b5f7a0ab9b-start.webp'),
    ('Планка с касанием плеч', '3699', '/exercise-images/063-3699-8c2b5d1c906f.webp', '/exercise-thumbnails/063-3699-8c2b5d1c906f-start.webp'),
    ('Скручивания', '0274', '/exercise-images/064-0274-5818fba5c230.webp', '/exercise-thumbnails/064-0274-5818fba5c230-start.webp'),
    ('Велосипед', '0003', '/exercise-images/065-0003-2fad6bd244a6.webp', '/exercise-thumbnails/065-0003-2fad6bd244a6-start.webp'),
    ('Русские скручивания', '0687', '/exercise-images/066-0687-a3b4eb97e280.webp', '/exercise-thumbnails/066-0687-a3b4eb97e280-start.webp'),
    ('Подъёмы ног лёжа', '0620', '/exercise-images/067-0620-b0accac198b7.webp', '/exercise-thumbnails/067-0620-b0accac198b7-start.webp'),
    ('Мёртвый жук', '0276', '/exercise-images/068-0276-8550c54c98c5.webp', '/exercise-thumbnails/068-0276-8550c54c98c5-start.webp'),
    ('Птица-собака', '0464', '/exercise-images/069-0464-4f740927d511.webp', '/exercise-thumbnails/069-0464-4f740927d511-start.webp'),
    ('Удержание «лодочки»', '1014', '/exercise-images/070-1014-61dae0843a2e.webp', '/exercise-thumbnails/070-1014-61dae0843a2e-start.webp'),
    ('Альпинисты', '0630', '/exercise-images/071-0630-821708f139f9.webp', '/exercise-thumbnails/071-0630-821708f139f9-start.webp'),
    ('Бёрпи', '1160', '/exercise-images/072-1160-e7cfd45c6fcf.webp', '/exercise-thumbnails/072-1160-e7cfd45c6fcf-start.webp'),
    ('Беговая дорожка', '3666', '/exercise-images/073-3666-ec6cea6ff585.webp', '/exercise-thumbnails/073-3666-ec6cea6ff585-start.webp'),
    ('Высокие колени', '3636', '/exercise-images/074-3636-4c518869a1f5.webp', '/exercise-thumbnails/074-3636-4c518869a1f5-start.webp'),
    ('Прыжки на скакалке', '2612', '/exercise-images/075-2612-ae5e1fe13758.webp', '/exercise-thumbnails/075-2612-ae5e1fe13758-start.webp'),
    ('Прыжки «звездой»', '3223', '/exercise-images/076-3223-53221301ad56.webp', '/exercise-thumbnails/076-3223-53221301ad56-start.webp'),
    ('Скейтер-прыжки', '3361', '/exercise-images/077-3361-0f52ece251f0.webp', '/exercise-thumbnails/077-3361-0f52ece251f0-start.webp'),
    ('Эллипс', '2141', '/exercise-images/078-2141-e3dbba360539.webp', '/exercise-thumbnails/078-2141-e3dbba360539-start.webp'),
    ('Велотренажёр', '0798', '/exercise-images/079-0798-c6a9ac07b8b1.webp', '/exercise-thumbnails/079-0798-c6a9ac07b8b1-start.webp'),
    ('Махи гирей', '0549', '/exercise-images/080-0549-5f63c7b27969.webp', '/exercise-thumbnails/080-0549-5f63c7b27969-start.webp'),
    ('Фермерская прогулка', '2133', '/exercise-images/081-2133-20af1c9f6199.webp', '/exercise-thumbnails/081-2133-20af1c9f6199-start.webp'),
    ('Медвежья походка', '3360', '/exercise-images/082-3360-25b5e18484a8.webp', '/exercise-thumbnails/082-3360-25b5e18484a8-start.webp'),
    ('Присед + жим гантелей', '0550', '/exercise-images/083-0550-feab1a2c59ce.webp', '/exercise-thumbnails/083-0550-feab1a2c59ce-start.webp'),
    ('Присед с жимом над головой', '3305', '/exercise-images/084-3305-decfa156f010.webp', '/exercise-thumbnails/084-3305-decfa156f010-start.webp'),
    ('Комплекс присед + жим', '3305', '/exercise-images/085-3305-d13fdf029ec6.webp', '/exercise-thumbnails/085-3305-d13fdf029ec6-start.webp'),
    ('Выпад + сгибание на бицепс', '1658', '/exercise-images/086-1658-e32a9c594b93.webp', '/exercise-thumbnails/086-1658-e32a9c594b93-start.webp'),
    ('Обратные выпады с поворотом', '1688', '/exercise-images/087-1688-bc219758de94.webp', '/exercise-thumbnails/087-1688-bc219758de94-start.webp'),
    ('Кошка-корова', '1363', '/exercise-images/088-1363-b9dbdbdf1d49.webp', '/exercise-thumbnails/088-1363-b9dbdbdf1d49-start.webp'),
    ('Мобилизация голеностопа', '1368', '/exercise-images/089-1368-b68d49c198ff.webp', '/exercise-thumbnails/089-1368-b68d49c198ff-start.webp'),
    ('Мобилизация плеч с резинкой', '1022', '/exercise-images/090-1022-51c099f300d3.webp', '/exercise-thumbnails/090-1022-51c099f300d3-start.webp'),
    ('Поза голубя', '2567', '/exercise-images/091-2567-a1d48c022bfa.webp', '/exercise-thumbnails/091-2567-a1d48c022bfa-start.webp'),
    ('Растяжка грушевидной', '2567', '/exercise-images/092-2567-1ab963a43f73.webp', '/exercise-thumbnails/092-2567-1ab963a43f73-start.webp'),
    ('Растяжка сгибателей бедра', '1564', '/exercise-images/093-1564-5722369d26ff.webp', '/exercise-thumbnails/093-1564-5722369d26ff-start.webp'),
    ('Раскрытие грудного отдела у стены', '1167', '/exercise-images/094-1167-efe8b5c9d16c.webp', '/exercise-thumbnails/094-1167-efe8b5c9d16c-start.webp'),
    ('Растяжка грудных у дверного проёма', '1167', '/exercise-images/095-1167-97d7fc9f9ee1.webp', '/exercise-thumbnails/095-1167-97d7fc9f9ee1-start.webp'),
    ('Наклоны к носкам', '3212', '/exercise-images/096-3212-1be8f6718d93.webp', '/exercise-thumbnails/096-3212-1be8f6718d93-start.webp'),
    ('Мировая растяжка', '1604', '/exercise-images/097-1604-ff7b82744394.webp', '/exercise-thumbnails/097-1604-ff7b82744394-start.webp'),
    ('Пуловер в блоке на спину', '0238', '/exercise-images/098-0238-729ad8345c0d.webp', '/exercise-thumbnails/098-0238-729ad8345c0d-start.webp'),
    ('Французский жим со штангой', '0061', '/exercise-images/099-0061-5e0ea0233837.webp', '/exercise-thumbnails/099-0061-5e0ea0233837-start.webp'),
    ('Французский жим EZ-грифом', '1748', '/exercise-images/100-1748-3bf99835d9ea.webp', '/exercise-thumbnails/100-1748-3bf99835d9ea-start.webp'),
    ('Французский жим стоя со штангой', '0109', '/exercise-images/101-0109-eed891d9aed5.webp', '/exercise-thumbnails/101-0109-eed891d9aed5-start.webp'),
    ('Разгибания из-за головы на блоке', '0194', '/exercise-images/102-0194-3bdfc9ef5164.webp', '/exercise-thumbnails/102-0194-3bdfc9ef5164-start.webp'),
    ('Жим вниз на блоке канатом', '0200', '/exercise-images/103-0200-ecb6680bda38.webp', '/exercise-thumbnails/103-0200-ecb6680bda38-start.webp'),
    ('Тяга верхнего блока обратным хватом', '0245', '/exercise-images/104-0245-64978b738e17.webp', '/exercise-thumbnails/104-0245-64978b738e17-start.webp'),
    ('Кроссовер на верхних блоках', '0158', '/exercise-images/105-0158-d97802efc1ae.webp', '/exercise-thumbnails/105-0158-d97802efc1ae-start.webp'),
    ('Махи гантелями в стороны', '0334', '/exercise-images/106-0334-373a017f2b56.webp', '/exercise-thumbnails/106-0334-373a017f2b56-start.webp'),
    ('Подтягивания обратным хватом', '0674', '/exercise-images/107-0674-2f113b0cab6c.webp', '/exercise-thumbnails/107-0674-2f113b0cab6c-start.webp'),
    ('Пуловер с гантелью лёжа поперёк скамьи', '0375', '/exercise-images/108-0375-440c101d0f5d.webp', '/exercise-thumbnails/108-0375-440c101d0f5d-start.webp'),
    ('Приседания в машине Смита', '3281', '/exercise-images/109-3281-0de67ecc5bef.webp', '/exercise-thumbnails/109-3281-0de67ecc5bef-start.webp'),
    ('Гакк-приседания', '0743', '/exercise-images/110-0743-8bbe19f98795.webp', '/exercise-thumbnails/110-0743-8bbe19f98795-start.webp'),
    ('Болгарские приседания в машине Смита', '0768', '/exercise-images/111-0768-86a396778408.webp', '/exercise-thumbnails/111-0768-86a396778408-start.webp'),
    ('Жим лёжа в машине Смита', '0748', '/exercise-images/112-0748-9e4814d07332.webp', '/exercise-thumbnails/112-0748-9e4814d07332-start.webp'),
    ('Жим на наклонной в тренажёре', '1299', '/exercise-images/113-1299-19979050c860.webp', '/exercise-thumbnails/113-1299-19979050c860-start.webp'),
    ('Сведение рук в тренажёре «бабочка»', '0596', '/exercise-images/114-0596-7ada59e5c411.webp', '/exercise-thumbnails/114-0596-7ada59e5c411-start.webp'),
    ('Жим вверх в тренажёре сидя', '0603', '/exercise-images/115-0603-774f319acb92.webp', '/exercise-thumbnails/115-0603-774f319acb92-start.webp'),
    ('Отведение руки в сторону на блоке', '0178', '/exercise-images/116-0178-361b94e28811.webp', '/exercise-thumbnails/116-0178-361b94e28811-start.webp'),
    ('Тяга с упором грудью в тренажёре', '1350', '/exercise-images/117-1350-3672db17979a.webp', '/exercise-thumbnails/117-1350-3672db17979a-start.webp'),
    ('Тяга верхнего блока нейтральным хватом', '0818', '/exercise-images/118-0818-fa22a87099e5.webp', '/exercise-thumbnails/118-0818-fa22a87099e5-start.webp'),
    ('Сгибания ног сидя', '0599', '/exercise-images/119-0599-4a0774f255fd.webp', '/exercise-thumbnails/119-0599-4a0774f255fd-start.webp'),
    ('Ягодичный мост в машине Смита', '0756', '/exercise-images/120-0756-6b665bab06b9.webp', '/exercise-thumbnails/120-0756-6b665bab06b9-start.webp'),
    ('Подъёмы на носки стоя в тренажёре', '0605', '/exercise-images/121-0605-86e6092a0bf1.webp', '/exercise-thumbnails/121-0605-86e6092a0bf1-start.webp'),
    ('Сгибания гантелей на бицепс на наклонной скамье', '0315', '/exercise-images/122-0315-c4b9f4da9221.webp', '/exercise-thumbnails/122-0315-c4b9f4da9221-start.webp'),
    ('Молитва', '0175', '/exercise-images/123-0175-95aa546faeaa.webp', '/exercise-thumbnails/123-0175-95aa546faeaa-start.webp'),
    ('Жим Паллофа с резинкой', '0979', '/exercise-images/124-0979-57477f696709.webp', '/exercise-thumbnails/124-0979-57477f696709-start.webp'),
    ('Тяга с канатом между ног', '0196', '/exercise-images/125-0196-2522c765cd41.webp', '/exercise-thumbnails/125-0196-2522c765cd41-start.webp'),
    ('Отведение ноги назад в кроссовере', '0228', '/exercise-images/126-0228-096122f7de40.webp', '/exercise-thumbnails/126-0228-096122f7de40-start.webp'),
    ('Обратная гиперэкстензия в тренажёре', '0593', '/exercise-images/127-0593-d679cc1bab23.webp', '/exercise-thumbnails/127-0593-d679cc1bab23-start.webp'),
    ('Ягодичный мост с гантелью', '0339', '/exercise-images/128-0339-059edf7a22c5.webp', '/exercise-thumbnails/128-0339-059edf7a22c5-start.webp'),
    ('Выпады вперёд без веса', '3470', '/exercise-images/129-3470-1d4e5e3d2269.webp', '/exercise-thumbnails/129-3470-1d4e5e3d2269-start.webp'),
    ('Болгарские приседания без веса', '2368', '/exercise-images/130-2368-85fed9f3d8ab.webp', '/exercise-thumbnails/130-2368-85fed9f3d8ab-start.webp'),
    ('Подъёмы на носки без веса', '1373', '/exercise-images/131-1373-a16ae40de3af.webp', '/exercise-thumbnails/131-1373-a16ae40de3af-start.webp'),
    ('Боковые выпады без веса', '1410', '/exercise-images/132-1410-65e9ad168c8b.webp', '/exercise-thumbnails/132-1410-65e9ad168c8b-start.webp'),
    ('Сведение ног в тренажёре', '0598', '/exercise-images/133-0598-8c9117de61cd.webp', '/exercise-thumbnails/133-0598-8c9117de61cd-start.webp'),
    ('Разведение ног в тренажёре', '0597', '/exercise-images/134-0597-7bf20012bcb0.webp', '/exercise-thumbnails/134-0597-7bf20012bcb0-start.webp');

DO $$
BEGIN
    IF EXISTS (
        SELECT package.name_ru
        FROM approved_exercise_images_release package
        JOIN exercises exercise ON exercise.name_ru = package.name_ru
            AND exercise.tags @> jsonb_build_array('ds:' || package.mapping_id)
            AND exercise.is_deleted = FALSE
        GROUP BY package.name_ru
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Ambiguous exercise identity in approved image release';
    END IF;
END $$;

UPDATE exercises exercise
SET image_url = package.image_url,
    thumbnail_url = package.thumbnail_url,
    tags = CASE
        WHEN exercise.tags @> '["image:owner-approved:2026-10-01"]'::jsonb THEN exercise.tags
        ELSE COALESCE(exercise.tags, '[]'::jsonb) || '["image:owner-approved:2026-10-01"]'::jsonb
    END
FROM approved_exercise_images_release package
WHERE exercise.name_ru = package.name_ru
    AND exercise.tags @> jsonb_build_array('ds:' || package.mapping_id)
    AND exercise.is_deleted = FALSE;

COMMENT ON COLUMN exercises.image_url IS 'Complete exercise illustration; thumbnail_url contains only the initial phase';
