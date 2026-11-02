# 测试相册

用来测试「从相册补记」的 15 张照片。画面来自 Unsplash（经 Picsum 获取），按 [Unsplash License](https://unsplash.com/license) 可免费使用；
拍摄时间和 GPS 是为了测试**人为写进 EXIF 的**，并不是照片真实的拍摄信息。

预期分组：**10 个时刻**（同一天且 1km 内为一个时刻；圣莫尼卡和祖玛海滩同一天但相距 30km，分成两个；咖啡只有日期；人像什么都没有，需要手动补日期）。

| 照片 | 场景 | 写入的时间 | 写入的地点 | 测试配文 |
| --- | --- | --- | --- | --- |
| 122.jpg | 伦敦，千禧桥上看圣保罗大教堂 | 2024-08-15 21:48 | 伦敦 City（51.508, -0.099） | 最后一班地铁前，桥上的风把所有人的头发都吹乱了。<br>*Before the last train, the wind on the bridge messed up everyone’s hair.* |
| 95.jpg, 103.jpg | 海德公园，起雾的早晨 | 2025-10-12 08:41 / 10:12 | 伦敦 海德公园 | 雾散得很慢。躺在草地上，鞋子湿了也不想起来。<br>*The fog lifted slowly. Wet shoes, and still I didn’t want to get up.* |
| 100.jpg, 108.jpg | 圣莫尼卡海滩 | 2023-07-03 15:20 / 16:05 | 洛杉矶 圣莫尼卡 | 海边的人比沙子还多。棕榈树下，冰淇淋化得比我吃得快。<br>*More people than sand. Under the palms, the ice cream melted faster than I could eat it.* |
| 92.jpg | 祖玛海滩（同一天，30 公里外） | 2023-07-03 18:44 | 马里布 祖玛海滩 | 日落前捡了一把贝壳，回家才发现全是碎的。<br>*Picked up a handful of shells before sunset. All broken, it turned out.* |
| 116.jpg, 107.jpg, 110.jpg | 托斯卡纳 Val d’Orcia | 2018-06-21 11:02 / 12:30 / 20:41 | 意大利 托斯卡纳 | 一整天都在走同一条路，从柏树走到麦田，再走到太阳落下去。<br>*Walked the same road all day: cypresses, then wheat, then the sun going down.* |
| 120.jpg, 121.jpg | 泰山，凌晨的星空与日出前 | 2024-09-14 02:18 / 05:52 | 泰山 | 凌晨两点的星空，五点五十的云海。腿疼了三天。<br>*Stars at two, a sea of clouds at ten to six. My legs hurt for three days.* |
| 82.jpg | 京都，哲学之道的樱花 | 2023-04-07 10:15 | 京都 东山 | 樱花还没全开，但已经够了。<br>*The cherry blossoms weren’t fully out yet. It was enough.* |
| 84.jpg | 纽约，韦拉扎诺海峡大桥夜景 | 2019-11-02 19:22 | 纽约 | 从布鲁克林看过去，桥上的灯像一串没串好的珠子。<br>*From Brooklyn the bridge lights looked like a badly strung necklace.* |
| 113.jpg | 家里的一杯咖啡（只有日期，没有 GPS） | 2021-12-24 08:05 | （无） | 平安夜的早上，一个人，一杯咖啡。<br>*Christmas Eve morning. One person, one coffee.* |
| 91.jpg | 拿着旧相机的人（没有任何拍摄信息） | （无） | （无） | 不记得是哪一年了，只记得那台旧相机。<br>*I don’t remember the year. Only the old camera.* |

## 署名

- 122.jpg：Vadim Sherbakov，https://unsplash.com/photos/xS_RzdD5CFE
- 95.jpg：Kundan Ramisetti，https://unsplash.com/photos/87TJNWkepvI
- 103.jpg：Ilham Rahmansyah，https://unsplash.com/photos/DwTZwZYi9Ww
- 100.jpg：Tina Rataj，https://unsplash.com/photos/pwaaqfoMibI
- 108.jpg：Florian Klauer，https://unsplash.com/photos/t1mqA3V3-7g
- 92.jpg：Rafael Souza，https://unsplash.com/photos/QxkBP3A9XmU
- 116.jpg：Anton Sulsky，https://unsplash.com/photos/YcfCXxo7rpc
- 107.jpg：Lukas Schweizer，https://unsplash.com/photos/9VWOr22LhVI
- 110.jpg：Kenneth Thewissen，https://unsplash.com/photos/D76DklsG-5U
- 120.jpg：Guillaume，https://unsplash.com/photos/_DA3D5P71qs
- 121.jpg：Radio Pink，https://unsplash.com/photos/p-bkdO43shE
- 82.jpg：Rula Sibai，https://unsplash.com/photos/-vq7mi4oF0s
- 84.jpg：Johnny Lam，https://unsplash.com/photos/63qfL0TciY8
- 113.jpg：Zugr，https://unsplash.com/photos/yZf1quatKCA
- 91.jpg：Jennifer Trovato，https://unsplash.com/photos/baRYCsjO6z4

## 怎么测

- **网页版**：`npm run web` → 「印记」Tab 右上角「从相册补记」→ 选择这个文件夹里的照片。
- **手机**：把照片传到手机相册（微信传输会去掉 EXIF，建议用数据线、AirDrop 或 Google Photos 原图上传）。
